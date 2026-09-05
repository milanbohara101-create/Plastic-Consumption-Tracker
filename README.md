# Plastic Consumption Tracker & AI Sustainability Companion

A full-stack, user-authenticated web application powered by **Google Gemini 3.6 Flash** and **Google Cloud Firestore** to help users track, understand, and reduce their daily single-use plastic footprint.

---

## 1. System Architecture & Threat Model

### Agentic Threat Modeling Summary (5 Threat Zones)

| Threat Zone | Identified Risk Scenario | Countermeasure & Defensive Implementation |
| :--- | :--- | :--- |
| **Input Surfaces** | Malicious injection in journal text, chat prompts, or camera/file uploads (oversized uploads, malicious file types, prompt injection). | Strict schema validation, image MIME type validation (`jpeg`, `png`, `webp`), 10MB payload size limits, and sanitization prior to processing. |
| **Planning & Reasoning** | Indirect prompt injection via user-provided text or OCR data in photos altering AI instructions. | Explicit separation of system prompts and multimodal content; treat visual items and OCR as plain data only. |
| **Tool Execution & API Access** | Client-side API key leakage, unauthorized AI quota consumption, path traversal during image save/delete. | Keep Gemini API calls strictly on backend (`process.env.GEMINI_API_KEY`); strictly sanitize file paths using `path.basename` to prevent traversal. |
| **Memory & State** | Cross-tenant data leaks in Firestore, ID spoofing, or storing raw base64 images in Firestore. | Strict owner-bound rules (`/users/{userId}/...`), Zero Insecure Defaults in `firestore.rules`, and storing only server-managed image paths in Firestore (never raw base64). |
| **Inter-System Communication** | Network interception, token leakage during authentication, or missing server verification. | Use Firebase Authentication with Google Sign-In, HTTPS transport, and sanitize payloads with strict undefined-stripping prior to persistence. |

---

## 2. Environment & Prerequisites

1. **Google Cloud CLI (`gcloud`)**: Installed and initialized with an active billing project:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```
2. **Enable Required Google Cloud APIs**:
   ```bash
   gcloud services enable run.googleapis.com \
       secretmanager.googleapis.com \
       firestore.googleapis.com \
       cloudbuild.googleapis.com
   ```
3. **Node.js**: Version 20.x or higher with npm.

---

## 3. Secret Management Setup (Secret Manager)

Store your Gemini API key in Google Cloud Secret Manager rather than plaintext files or environment overrides:

```bash
# 1. Create the secret in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# 2. Add your Gemini API key version
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 3. Grant the Cloud Run default runtime service account permission to read the secret
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 4. Cloud Firestore Security Rules

Deploy the owner-isolated security rules to guarantee that each user can only read, write, and delete documents in their own partition:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Zero Insecure Defaults
    match /{document=**} {
      allow read, write: if false;
    }

    // Strict user data isolation
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /journalEntries/{entryId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /conversations/{conversationId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /summaries/{summaryId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /interactions/{interactionId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /impactWall/{docId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /scans/{scanId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

Deploy using Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

---

## 5. Google Cloud Run Deployment Flow

Deploy the containerized full-stack application directly to Google Cloud Run:

```bash
# Build and deploy with Secret Manager binding
gcloud run deploy plastic-tracker \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --port 3000

# Apply mandatory campaign verification label
gcloud run services update plastic-tracker \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=asia-southeast1
```

---

## 6. Functional Walkthrough & Verification Guide

### Test Suite 1: Authentication & Session Management
- **TC-1.1: Landing View Render**
  - Steps: Open app as an unauthenticated visitor.
  - Expected: Landing page displays title, value proposition, "Continue with Google", and "Explore as Sandbox Guest" buttons.
- **TC-1.2: Google Sign-In Flow**
  - Steps: Click "Continue with Google" (`#btn-google-login`).
  - Expected: Google OAuth popup/redirect opens; upon authorization, user is transitioned into the private dashboard.
- **TC-1.3: Sandbox Guest Flow**
  - Steps: Click "Explore as Sandbox Guest" (`#btn-guest-login`).
  - Expected: Firebase anonymous authentication assigns an isolated session; user enters dashboard with guest identifier.
- **TC-1.4: Sign Out**
  - Steps: Click the sign out button (`#btn-sign-out`) in the top navigation.
  - Expected: User session terminates and user is returned to the Landing Page.

### Test Suite 2: Natural Language Journaling & Gemini Extraction
- **TC-2.1: Entry Input & Sample Prompt Fill**
  - Steps: Select "Daily Journal" tab (`#nav-tab-journal`). Click a sample prompt button.
  - Expected: Textarea (`#journal-textarea`) populates with natural language sample text.
- **TC-2.2: Gemini 3.6 Flash Analysis**
  - Steps: Click "Analyze Entry" (`#btn-analyze-gemini`).
  - Expected: Spinner activates. Within seconds, Gemini returns a supportive daily reflection, identified items list, categorized packaging, and cost-effective alternatives.
- **TC-2.3: Interactive Item Editing & Correction**
  - Steps: Adjust quantity using `+` / `-` buttons, or toggle action between "Used" and "Avoided".
  - Expected: Real-time UI updates reflecting the user's manual correction.
- **TC-2.4: Firestore Persistence**
  - Steps: Click "Save Journal Entry" (`#btn-save-entry`).
  - Expected: Record is sanitized with undefined-stripping and committed to `/users/{userId}/journalEntries/{entryId}`. Success confirmation toast appears.

### Test Suite 3: Gemini Sustainability Companion Chat
- **TC-3.1: Chat Navigation & History Load**
  - Steps: Select "Gemini Coach" tab (`#nav-tab-chat`).
  - Expected: Sprout's welcome greeting appears along with past conversation records retrieved from Firestore.
- **TC-3.2: Multi-turn Contextual Query**
  - Steps: Type a question in `#chat-input-text` (or click a quick pill like *"What's a cheaper alternative to plastic bottled water?"*) and click Send (`#btn-chat-send`).
  - Expected: Gemini responds conversationally with practical, budget-conscious swaps and references user context without shaming.
- **TC-3.3: Chat Message Persistence**
  - Steps: Reload or switch tabs and return to "Gemini Coach".
  - Expected: Past exchange is preserved in `/users/{userId}/conversations`.

### Test Suite 4: Visual Analytics & Trend Progress
- **TC-4.1: Metrics Computation**
  - Steps: Select "Progress & Trends" tab (`#nav-tab-analytics`).
  - Expected: Cards display total plastics used, avoided plastics count, conscious avoidance rate %, and journal days logged.
- **TC-4.2: Category Breakdown & Frequent Items**
  - Steps: Inspect bar charts and list items.
  - Expected: Categories sorted by volume; environmental estimates disclaimer clearly rendered.

### Test Suite 5: Weekly & Monthly Historical Insights
- **TC-5.1: Historical Synthesis**
  - Steps: Select "Weekly/Monthly Insights" tab (`#nav-tab-insights`). Select "Weekly" or "Monthly" and click "Generate" (`#btn-generate-insights`).
  - Expected: Gemini synthesizes all past journal entries into observed patterns, celebrated wins, high-impact swaps, and gentle next steps.
- **TC-5.2: Report Archiving**
  - Steps: Inspect "Saved Historical Reports".
  - Expected: Generated summary document is saved in `/users/{userId}/summaries` and selectable from the historical archive.

### Test Suite 6: Journal History & Data Management
- **TC-6.1: Search & Filter**
  - Steps: Select "History" tab (`#nav-tab-history`). Type an item name into `#history-search-input` or filter by "Includes Avoided Plastic".
  - Expected: List dynamically narrows to matching journal records.
- **TC-6.2: Entry Deletion**
  - Steps: Click the trash icon on an entry.
  - Expected: Entry is deleted from Firestore and removed from the active view.

### Test Suite 7: Impact Wall & Milestone Badges
- **TC-7.1: Cumulative Metric Aggregation**
  - Steps: Select "Impact Wall" tab (`#nav-tab-impact`) or click "View Impact Wall" from the dashboard card.
  - Expected: Impact Wall displays cumulative totals for plastic bags avoided, plastic bottles avoided, food containers avoided, disposable cups avoided, other items avoided, items reused, and total items avoided.
- **TC-7.2: Milestone Badges & Level Progress**
  - Steps: Verify milestone badges (First Step, Plastic Pioneer, Bag Buster, Eco Guardian, Zero-Hero, Century Champion).
  - Expected: Progress bar calculates percentage to next badge tier and renders unlocked state for earned milestones.
- **TC-7.3: Manual Impact Correction**
  - Steps: Click "Adjust Impact Counts" (`#btn-open-adjust-impact`), change a count or enter a note, and click "Save Corrections".
  - Expected: Overrides are saved to `/users/{userId}/impactWall/adjustments` and metrics update immediately.

### Test Suite 8: Plastic Scanner & Vision Analysis
- **TC-8.1: Dashboard Launch & Camera / Upload Trigger**
  - Steps: Click the prominent "Scan Plastic" button on the dashboard banner (`#btn-scan-plastic-banner`) or the quick access card (`#btn-scan-plastic-dashboard`).
  - Expected: Scanner view opens. User can select "Take Photo" (`#btn-take-photo`) to activate live camera feed or "Upload Image" (`#btn-upload-photo`) to select a photo.
- **TC-8.2: Multimodal Resin Identification**
  - Steps: Capture a photo or upload an image of a plastic product.
  - Expected: Gemini Vision inspects the image and displays a result card with resin code (#1–#7), confidence level badge, item description, visual clues explanation, disposal/recycling guidance, and recommended alternative.
- **TC-8.3: Manual Resin Correction**
  - Steps: Select a different resin type from the dropdown selector (`#select-correct-plastic-type`).
  - Expected: Corrected resin type updates the visual badge and is reflected when saving to journal or history.
- **TC-8.4: Add Scanned Item to Daily Journal**
  - Steps: Click "Add to Journal" (`#btn-add-scan-to-journal`). Choose an action ("Avoided" or "Replaced with alternative"), specify quantity, and click "Save to Journal".
  - Expected: Item is saved to user's journal entries, and if marked avoided/replaced, the Impact Wall metrics increment accordingly.
- **TC-8.5: Find Better Alternative via Gemini Coach**
  - Steps: Click "Find Better Alternative" (`#btn-find-better-alternative`).
  - Expected: Application transitions to the "Gemini Coach" tab with a customized prompt preloaded in the input field, ready to send.
- **TC-8.6: Save Scan & Scan History Management**
  - Steps: Click "Save Scan" (`#btn-save-scan-record`). Inspect "Scan History" section.
  - Expected: Scan is saved under `/users/{userId}/scans/{scanId}` and listed in the history grid with image thumbnail. Clicking the trash icon deletes both the image file and the Firestore record.

