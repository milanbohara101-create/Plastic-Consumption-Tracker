import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Standard Top-Level Request Deserialization (Ordering Guarantee)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Lazy GoogleGenAI client
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// Resilient Model Fallback Ladder
// High-Availability First: gemini-3.1-flash-lite, Primary: gemini-3.6-flash, Dynamic Alias: gemini-flash-latest, Alternate: gemini-3.8-flash, Deep Reasoning: gemini-3.7-flash
const MODEL_FALLBACK_LADDER = [
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
];

interface FallbackOptions {
  contents: any;
  config?: any;
}

async function generateContentWithFallback(options: FallbackOptions): Promise<{ text: string; modelUsed: string }> {
  const ai = getAiClient();
  let lastError: any = null;

  for (const model of MODEL_FALLBACK_LADDER) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: options.config,
      });

      const text = response.text || '';
      return { text, modelUsed: model };
    } catch (err: any) {
      const status = err?.status || err?.code || (err?.error && err?.error?.code);
      const isRecoverable =
        status === 503 ||
        status === 429 ||
        status === 404 ||
        status === 500 ||
        status === 'UNAVAILABLE' ||
        status === 'RESOURCE_EXHAUSTED';

      console.info(
        `[Gemini Recovery Matrix] Model ${model} ${isRecoverable ? 'temporarily unavailable' : 'encountering issue'} (${err?.message || status}). Falling back to next candidate...`
      );
      lastError = err;
      // Continue to next model in ladder for transient/availability errors
    }
  }

  throw new Error(`All models in fallback ladder exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
}

// ==========================================
// API Routes
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
  });
});

// Analyze Daily Journal Entry
app.post('/api/gemini/analyze-entry', async (req, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    const date = typeof data.date === 'string' ? data.date : new Date().toISOString().split('T')[0];
    const historicalContext = typeof data.historicalContext === 'string' ? data.historicalContext.slice(0, 1500) : '';

    if (!text) {
      return res.status(400).json({ error: 'Journal text is required.' });
    }

    if (text.length > 3000) {
      return res.status(400).json({ error: 'Journal text exceeds character limit (3000 max).' });
    }

    const systemInstruction = `You are a warm, supportive, and practical sustainability companion.
Your goal is to help users track, understand, and reduce their daily plastic consumption.
Key principles:
1. NEVER judge or shame the user. Celebrate any progress, awareness, or avoided plastics.
2. Extract all plastic products or packaging mentioned in the user's journal entry.
3. Categorize each item (e.g., 'Beverage Containers', 'Shopping Bags', 'Food Packaging / Takeout', 'Personal Care', 'Household', 'Utensils & Straws', 'Other').
4. Determine the action: 'used', 'purchased', 'avoided', 'disposed', or 'reused'.
5. If the user avoided or reused plastic (e.g. 'brought my own tote', 'refused a straw', 'reused an old takeout container as a planter'), celebrate this as an avoided or reused item!
6. Provide helpful, realistic, affordable alternatives. Always explain why it's better, factoring in cost, durability, convenience, availability, and frequency of use.
7. NEVER fabricate precise environmental statistics (e.g., do not say "This saved exactly 0.42kg of CO2"). If providing an estimate or impact observation, clearly qualify it as an estimate with an explanation.
8. If information is ambiguous, include 1 or 2 polite clarifying questions.
9. Return response in strict JSON matching the schema:
{
  "reflection": "A 2-3 sentence conversational, encouraging reflection on their day's habits.",
  "items": [
    {
      "name": "string (name of item, e.g. Single-use plastic water bottle)",
      "category": "string",
      "action": "used" | "purchased" | "avoided" | "disposed" | "reused",
      "quantity": number,
      "estimatedImpactNote": "string (optional friendly context on impact)",
      "alternative": {
        "title": "string (practical alternative)",
        "whyBetter": "string (practical benefits: cost, longevity, convenience)",
        "costLevel": "Free / Repurposed" | "Budget (<$10)" | "Moderate ($10-25)" | "Investment ($25+)",
        "convenienceScore": "Easy" | "Moderate" | "Requires planning"
      }
    }
  ],
  "encouragement": "A short, motivating closing thought.",
  "clarifyingQuestions": ["string optional"]
}`;

    const prompt = `Date: ${date}
User's Journal Entry:
"${text}"

${historicalContext ? `Recent Historical Context:\n${historicalContext}\n` : ''}

Analyze this entry and extract plastic items and actionable alternatives. Return only JSON.`;

    const { text: resultText } = await generateContentWithFallback({
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    let parsed;
    try {
      parsed = JSON.parse(resultText);
    } catch {
      // Fallback in case response contained markdown wrappers
      const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleanJson);
    }

    res.json({
      success: true,
      data: parsed,
    });
  } catch (error: any) {
    console.error('Error analyzing journal entry:', error);
    res.status(500).json({
      error: error.message || 'Failed to analyze journal entry.',
    });
  }
});

// Multi-turn Gemini Sustainability Companion Chat
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const userContext = data.userContext && typeof data.userContext === 'object' ? data.userContext : {};

    if (messages.length === 0) {
      return res.status(400).json({ error: 'Chat messages array cannot be empty.' });
    }

    const systemInstruction = `You are "Sprout", a supportive, compassionate sustainability coach and plastic reduction companion.
User Context:
${userContext.summary ? `Summary of habits: ${userContext.summary}\n` : ''}
${userContext.recentItems ? `Frequently logged items: ${userContext.recentItems}\n` : ''}
${userContext.avoidedCount ? `Estimated plastic items avoided to date: ${userContext.avoidedCount}\n` : ''}

Guidelines:
- Tone: Empathetic, practical, grounded, non-preachy, encouraging.
- Focus on micro-habits, cost-effective swaps, and sustainable routines.
- Prioritize low-cost, free, or repurposed alternatives before recommending commercial products.
- When answering questions like "What could I have done differently today?" or "What is a cheaper alternative?", give 2-3 specific, achievable tips.
- Do not cite fabricated impact figures. Clearly state if an idea is an estimate or general rule of thumb.
- Keep responses concise (under 250 words) unless in-depth steps are requested.`;

    // Convert messages into format for Gemini
    const contents = messages.map((m: any) => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || m.text || '').slice(0, 2000) }],
    }));

    const { text: replyText } = await generateContentWithFallback({
      contents,
      config: {
        systemInstruction,
      },
    });

    res.json({
      success: true,
      reply: replyText,
    });
  } catch (error: any) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({
      error: error.message || 'Failed to process chat message.',
    });
  }
});

// Historical Trends & Weekly/Monthly Insights
app.post('/api/gemini/generate-insights', async (req, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const timeframe = data.timeframe === 'monthly' ? 'monthly' : 'weekly';
    const entries = Array.isArray(data.entries) ? data.entries.slice(0, 30) : [];
    const stats = data.stats || {};

    if (entries.length === 0) {
      return res.status(400).json({ error: 'At least one journal entry is needed to generate insights.' });
    }

    const systemInstruction = `You are a sustainability data coach analyzing a user's plastic reduction journal over a ${timeframe} timeframe.
Your task is to surface meaningful patterns, celebrate real achievements, identify high-impact reduction opportunities, and provide 2-3 gentle next steps.
Return valid JSON only matching the schema:
{
  "periodTitle": "string (e.g. 'Past 7 Days Reflection' or 'Monthly Plastic Overview')",
  "headline": "string (1 encouraging summary headline)",
  "topObservedHabits": ["string", "string"],
  "achievements": ["string", "string"],
  "highImpactSwaps": [
    {
      "targetItem": "string",
      "recommendation": "string",
      "estimatedCostBenefit": "string"
    }
  ],
  "areasForImprovement": ["string"],
  "encouragingClosing": "string"
}`;

    const prompt = `Entries summary:
${JSON.stringify(
  entries.map((e: any) => ({
    date: e.date,
    text: e.text,
    itemsCount: e.items?.length || 0,
    items: e.items?.map((i: any) => `${i.action}: ${i.name} (${i.category})`),
  })),
  null,
  2
)}

Total logged items in window: ${stats.totalLogged || entries.length}
Total items marked avoided: ${stats.totalAvoided || 0}

Generate a thoughtful ${timeframe} sustainability insight in JSON.`;

    const { text: resultText } = await generateContentWithFallback({
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    let parsed;
    try {
      parsed = JSON.parse(resultText);
    } catch {
      const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleanJson);
    }

    res.json({
      success: true,
      insights: parsed,
    });
  } catch (error: any) {
    console.error('Error generating insights:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate sustainability insights.',
    });
  }
});

// Impact Wall Positive Message Endpoint
app.post('/api/gemini/impact-message', async (req, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {};
    const totalAvoided = Number(data.totalAvoided) || 0;
    const totalReused = Number(data.totalReused) || 0;
    const bagsAvoided = Number(data.bagsAvoided) || 0;
    const bottlesAvoided = Number(data.bottlesAvoided) || 0;
    const containersAvoided = Number(data.containersAvoided) || 0;
    const cupsAvoided = Number(data.cupsAvoided) || 0;
    const otherAvoided = Number(data.otherAvoided) || 0;
    const mostAvoidedCategory = typeof data.mostAvoidedCategory === 'string' ? data.mostAvoidedCategory : '';
    const currentMilestone = data.currentMilestone ? String(data.currentMilestone) : '';
    const nextMilestone = data.nextMilestone ? String(data.nextMilestone) : '';

    const systemInstruction = `You are a supportive, encouraging sustainability companion.
Your goal is to generate a short, positive, 1-2 sentence message celebrating the user's actual progress in avoiding and reusing plastic items.
Key Guidelines:
1. Ground the message directly in their actual numbers (for example: "You've avoided 50 plastic items so far. Your biggest improvement has been reducing single-use bottles.").
2. Keep the messaging encouraging, warm, and strictly non-judgmental. Celebrate progress rather than making users feel guilty.
3. NEVER fabricate environmental figures (no fake kilograms of plastic, CO2, or ocean pollution metrics). Focus strictly on user-recorded actions and items avoided or reused.
4. Keep the output under 40 words.
5. Return plain text only.`;

    const prompt = `User's Current Progress:
- Total Plastic Items Avoided: ${totalAvoided}
- Total Plastic Items Reused: ${totalReused}
- Plastic Bags Avoided: ${bagsAvoided}
- Plastic Bottles Avoided: ${bottlesAvoided}
- Plastic Food Containers Avoided: ${containersAvoided}
- Disposable Cups Avoided: ${cupsAvoided}
- Other Items Avoided: ${otherAvoided}
- Most Avoided Plastic Category: ${mostAvoidedCategory || 'General single-use items'}
${currentMilestone ? `- Milestone Achieved: ${currentMilestone}` : ''}
${nextMilestone ? `- Next Goal: ${nextMilestone}` : ''}

Generate an encouraging, grounded 1-2 sentence celebration message for their Impact Wall.`;

    const { text: messageText } = await generateContentWithFallback({
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    res.json({
      success: true,
      message: messageText.trim(),
    });
  } catch (error: any) {
    console.error('Error generating impact celebration message:', error);
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const totalAvoided = typeof body.totalAvoided === 'number' ? body.totalAvoided : 0;
    const defaultMsg = totalAvoided > 0
      ? `You have avoided ${totalAvoided} single-use plastic items so far! Every conscious swap builds lasting change.`
      : `Welcome to your Impact Wall! Track your plastic reduction journey and celebrate every item you keep out of landfills.`;

    res.json({
      success: true,
      message: defaultMsg,
      isFallback: true,
    });
  }
});

// ==========================================
// Plastic Scanner Multimodal Vision API
// ==========================================

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

function getExtensionFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
    case 'image/jpg':
    default:
      return 'jpg';
  }
}

// Analyze Plastic via Gemini Multimodal Vision
app.post('/api/scans/analyze', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { imageBase64, mimeType, userId } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Image data (base64 string) is required.' });
    }

    const rawMime = typeof mimeType === 'string' ? mimeType.toLowerCase().trim() : 'image/jpeg';
    const normalizedMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;

    if (!ALLOWED_IMAGE_MIMES.includes(normalizedMime)) {
      return res.status(400).json({
        error: `Unsupported image format (${rawMime}). Please upload a JPG, JPEG, PNG, or WEBP image.`,
      });
    }

    // Strip data URI prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
    const imageBuffer = Buffer.from(cleanBase64, 'base64');

    if (imageBuffer.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty image data received.' });
    }

    if (imageBuffer.length > MAX_IMAGE_BYTES) {
      return res.status(400).json({
        error: `Image size (${(imageBuffer.length / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of 10MB.`,
      });
    }

    // Ensure user isolation for storage
    const rawUserId = typeof userId === 'string' && userId.trim() ? userId.trim() : 'guest';
    const sanitizedUserId = rawUserId.replace(/[^a-zA-Z0-9_-]/g, '_');

    const ext = getExtensionFromMime(normalizedMime);
    const filename = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const userDir = path.join(process.cwd(), 'uploads', sanitizedUserId);

    await fs.promises.mkdir(userDir, { recursive: true });
    const fullDiskPath = path.join(userDir, filename);
    await fs.promises.writeFile(fullDiskPath, imageBuffer);

    const relativePath = `uploads/${sanitizedUserId}/${filename}`;
    const imageUrl = `/api/uploads/${sanitizedUserId}/${filename}`;

    // System prompt for Gemini Multimodal Vision
    const systemInstruction = `You are a specialized sustainability materials identification expert and supportive environmental coach.
Analyze the user's uploaded image to identify the most likely type of plastic or material shown.

PLASTIC RESIN CLASSIFICATIONS TO IDENTIFY:
- PET / PETE (#1): Polyethylene Terephthalate (water bottles, soft drink bottles, clear food containers).
- HDPE (#2): High-Density Polyethylene (milk jugs, detergent bottles, shampoo bottles, stiffer tubs).
- PVC (#3): Polyvinyl Chloride (clear wrap, blister packs, pipes, squeeze bottles).
- LDPE (#4): Low-Density Polyethylene (plastic grocery bags, bread bags, shrink wrap, squeezable bottles).
- PP (#5): Polypropylene (hot food takeout containers, yogurt cups, syrup bottles, medicine bottles, bottle caps).
- PS (#6): Polystyrene / Styrofoam (disposable cutlery, foam takeout clamshells, clear cups).
- Other / mixed plastic (#7): Multi-layer packaging, polycarbonate, nylon, acrylic, bioplastics/PLA.
- Not plastic / unable to determine: When the object is glass, metal, wood, ceramic, paper, or not plastic.

ESSENTIAL CRITERIA & RULES:
1. DISTINGUISH BETWEEN VISUAL IDENTIFICATION AND CERTAINTY:
   Never claim 100% certainty from visual appearance alone. Always frame inferences as likely estimations.
2. PRIORITIZE VISIBLE RECYCLING / RESIN SYMBOLS:
   If a recycling triangle with a number (#1 to #7) or acronym is visible in the photo, give this visual evidence highest priority over general shape inference and state that in your explanation.
3. CLEAR UNCERTAINTY HANDLING:
   If the plastic type cannot reliably be determined from the image (e.g. blurry image, too far away, completely generic smooth surface with no clues), set detectedMaterial to EXACTLY: "Unable to confidently identify the plastic type." and confidenceLevel to "Unable to confidently identify". Do NOT force a classification or guess wildly. Ask the user to check physically for a resin code or upload a clearer close-up.
4. MULTIPLE MATERIALS:
   If the product has multiple components (such as a PET bottle body with a PP cap or an LDPE plastic label film), identify the main material, mention the secondary components, and note whether separation is recommended before disposal.
5. BALANCED DISPOSAL & RECYCLING GUIDANCE:
   Do NOT make absolute claims that an item "is recyclable", because recycling infrastructure varies significantly by city and country. Always phrase advice conditionally: "Check whether your local recycling program accepts this plastic resin...", remind them to rinse food residue, and mention alternatives if curbside recycling is unavailable.
6. PRACTICAL ALTERNATIVE:
   Provide an accessible, affordable, lower-plastic or durable reusable alternative tailored to this specific item.
7. Return strictly valid JSON adhering to this schema:
{
  "detectedMaterial": "string (e.g. 'PP (#5)' or 'PET / PETE (#1)' or 'HDPE (#2)' or 'LDPE (#4)' or 'PVC (#3)' or 'PS (#6)' or 'Other / mixed plastic (#7)' or 'Not plastic / unable to determine' or 'Unable to confidently identify the plastic type.')",
  "resinCode": "string (e.g. '#1', '#2', '#3', '#4', '#5', '#6', '#7', 'none', or 'unknown')",
  "confidenceLevel": "High" | "Moderate" | "Low" | "Unable to confidently identify",
  "itemDescription": "string (concise description of what the object appears to be)",
  "explanation": "string (2-3 sentences explaining visual clues: visible resin symbol, container shape, sheen, flexibility, typical use cases, or why identification is uncertain)",
  "disposalGuidance": "string (responsible guidance noting to verify with local municipal recycling rules and prep/rinse the item)",
  "recommendedAlternative": "string (practical, lower-waste or reusable alternative)",
  "visibleSymbolFound": boolean,
  "isPlastic": boolean,
  "requiresSeparation": boolean
}`;

    const prompt = `Analyze this image carefully. Identify what the item appears to be, its most likely plastic resin code and material type, the confidence level, visual clues (especially check for any visible recycling symbol or resin number), recyclability instructions (reminding the user to check local recycling guidelines), and a practical reusable or low-plastic alternative.`;

    const { text: visionResponseText } = await generateContentWithFallback({
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: normalizedMime,
              data: cleanBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    let parsedResult: any = {};
    try {
      parsedResult = JSON.parse(visionResponseText);
    } catch (parseErr) {
      console.warn('Failed to parse Gemini Vision JSON response, attempting extraction:', parseErr);
      const jsonMatch = visionResponseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Invalid JSON response returned by AI vision model.');
      }
    }

    res.json({
      success: true,
      result: {
        detectedMaterial: parsedResult.detectedMaterial || 'Unable to confidently identify the plastic type.',
        resinCode: parsedResult.resinCode || 'unknown',
        confidenceLevel: parsedResult.confidenceLevel || 'Moderate',
        itemDescription: parsedResult.itemDescription || 'Scanned item',
        explanation: parsedResult.explanation || 'Visual analysis completed.',
        disposalGuidance: parsedResult.disposalGuidance || 'Check whether your local recycling system accepts this item.',
        recommendedAlternative: parsedResult.recommendedAlternative || 'Consider a reusable glass or stainless-steel alternative.',
        visibleSymbolFound: !!parsedResult.visibleSymbolFound,
        isPlastic: parsedResult.isPlastic !== false,
        requiresSeparation: !!parsedResult.requiresSeparation,
      },
      imageUrl,
      imagePath: relativePath,
    });
  } catch (error: any) {
    console.error('Error analyzing plastic scan with Gemini Vision:', error);
    res.status(500).json({
      error: error.message || 'Failed to analyze plastic image with AI vision.',
    });
  }
});

// Serve uploaded scan images safely
app.get('/api/uploads/:userId/:filename', async (req, res) => {
  try {
    const { userId, filename } = req.params;
    const sanitizedUserId = (userId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedFilename = path.basename(filename || '');

    if (!sanitizedUserId || !sanitizedFilename) {
      return res.status(400).send('Invalid file parameters.');
    }

    const filePath = path.join(process.cwd(), 'uploads', sanitizedUserId, sanitizedFilename);

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      return res.status(404).send('Image not found.');
    }

    res.sendFile(filePath);
  } catch (err: any) {
    console.error('Error serving upload:', err);
    res.status(500).send('Error retrieving file.');
  }
});

// Delete uploaded scan image
app.delete('/api/scans/image', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { userId, imagePath } = body;

    if (!userId || !imagePath) {
      return res.status(400).json({ error: 'userId and imagePath are required.' });
    }

    const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const normalizedPath = path.normalize(String(imagePath)).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(process.cwd(), normalizedPath);
    const expectedPrefix = path.join(process.cwd(), 'uploads', sanitizedUserId);

    // Prevent directory traversal outside user upload folder
    if (!fullPath.startsWith(expectedPrefix)) {
      return res.status(403).json({ error: 'Unauthorized file path access.' });
    }

    try {
      await fs.promises.unlink(fullPath);
      res.json({ success: true, message: 'Image deleted successfully.' });
    } catch (unlinkErr: any) {
      if (unlinkErr.code === 'ENOENT') {
        return res.json({ success: true, message: 'Image file was already deleted or not found.' });
      }
      throw unlinkErr;
    }
  } catch (error: any) {
    console.error('Error deleting scan image:', error);
    res.status(500).json({ error: error.message || 'Failed to delete scan image.' });
  }
});

// Vite middleware (Dev) vs Static Files (Prod)
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Plastic Consumption Tracker server running on port ${PORT}`);
  });
}

startServer();
