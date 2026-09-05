import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  HelpCircle,
  Lightbulb,
  Trophy,
  ScanLine,
  Zap,
} from 'lucide-react';
import type { JournalEntry, PlasticItem, PlasticAction } from '../types';
import { saveJournalEntry } from '../lib/firebase';

interface JournalSectionProps {
  user: User;
  onEntrySaved: (entry: JournalEntry) => void;
  historicalContext?: string;
  onOpenImpactWall?: () => void;
  onOpenScanner?: () => void;
  onOpenQuickAdd?: () => void;
  avoidedCount?: number;
}

const SAMPLE_PROMPTS = [
  'Today I bought a bottle of water, used two plastic bags, and ordered food in a plastic container.',
  'Brought my own tote bag to the grocery store, skipped the plastic straw at the cafe, but bought berries in a plastic clamshell.',
  'Packed my lunch in a reusable glass container, but had to buy a shampoo bottle and plastic toothbrush.',
];

export const JournalSection: React.FC<JournalSectionProps> = ({
  user,
  onEntrySaved,
  historicalContext,
  onOpenImpactWall,
  onOpenScanner,
  onOpenQuickAdd,
  avoidedCount,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState<string>(todayStr);
  const [journalText, setJournalText] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Analysis results (editable by user before final persistence)
  const [analyzedEntry, setAnalyzedEntry] = useState<{
    reflection: string;
    encouragement: string;
    items: PlasticItem[];
    clarifyingQuestions?: string[];
  } | null>(null);

  const handleAnalyze = async () => {
    if (!journalText.trim()) {
      setErrorMsg('Please write a brief journal entry before analyzing.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setSaveSuccessMsg(null);

    try {
      const response = await fetch('/api/gemini/analyze-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: journalText.trim(),
          date,
          historicalContext: historicalContext || '',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.status}`);
      }

      const res = await response.json();
      const rawData = res.data || {};

      // Map raw items to typed PlasticItem with unique IDs
      const mappedItems: PlasticItem[] = (rawData.items || []).map((it: any, idx: number) => ({
        id: `item-${Date.now()}-${idx}`,
        name: it.name || 'Plastic item',
        category: it.category || 'General Packaging',
        action: (['used', 'purchased', 'avoided', 'disposed'].includes(it.action)
          ? it.action
          : 'used') as PlasticAction,
        quantity: Math.max(1, Number(it.quantity) || 1),
        estimatedImpactNote: it.estimatedImpactNote || '',
        alternative: it.alternative
          ? {
              title: it.alternative.title || 'Reusable alternative',
              whyBetter: it.alternative.whyBetter || 'Long-lasting and reusable.',
              costLevel: it.alternative.costLevel || 'Budget (<$10)',
              convenienceScore: it.alternative.convenienceScore || 'Easy',
            }
          : undefined,
      }));

      setAnalyzedEntry({
        reflection: rawData.reflection || 'Thanks for logging your plastic usage today!',
        encouragement: rawData.encouragement || 'Small daily steps create massive long-term change.',
        items: mappedItems,
        clarifyingQuestions: rawData.clarifyingQuestions || [],
      });
    } catch (err: any) {
      console.error('Analysis error:', err);
      setErrorMsg(err.message || 'Failed to connect to Gemini analysis engine. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveToFirestore = async () => {
    if (!analyzedEntry) return;
    setIsSaving(true);
    setErrorMsg(null);
    setSaveSuccessMsg(null);

    const entryToSave: JournalEntry = {
      id: `entry-${Date.now()}`,
      userId: user.uid,
      date,
      timestamp: Date.now(),
      text: journalText,
      reflection: analyzedEntry.reflection,
      encouragement: analyzedEntry.encouragement,
      items: analyzedEntry.items,
      clarifyingQuestions: analyzedEntry.clarifyingQuestions,
    };

    try {
      await saveJournalEntry(user.uid, entryToSave);
      onEntrySaved(entryToSave);
      setSaveSuccessMsg('Journal entry and Gemini recommendations saved to private Firestore!');
      // Reset form text
      setJournalText('');
    } catch (err: any) {
      console.error('Save error:', err);
      setErrorMsg(`Failed to save to database: ${err.message}. Your inputs are preserved.`);
    } finally {
      setIsSaving(false);
    }
  };

  // Inline Item Editing Handlers
  const handleItemActionChange = (id: string, newAction: PlasticAction) => {
    if (!analyzedEntry) return;
    setAnalyzedEntry({
      ...analyzedEntry,
      items: analyzedEntry.items.map((it) => (it.id === id ? { ...it, action: newAction } : it)),
    });
  };

  const handleQuantityChange = (id: string, delta: number) => {
    if (!analyzedEntry) return;
    setAnalyzedEntry({
      ...analyzedEntry,
      items: analyzedEntry.items.map((it) =>
        it.id === id ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it
      ),
    });
  };

  const handleRemoveItem = (id: string) => {
    if (!analyzedEntry) return;
    setAnalyzedEntry({
      ...analyzedEntry,
      items: analyzedEntry.items.filter((it) => it.id !== id),
    });
  };

  const handleAddManualItem = () => {
    if (!analyzedEntry) return;
    const newItem: PlasticItem = {
      id: `item-${Date.now()}-${Math.random()}`,
      name: 'Custom Plastic Item',
      category: 'Household',
      action: 'used',
      quantity: 1,
      alternative: {
        title: 'Reusable substitute',
        whyBetter: 'Washable and long lasting.',
        costLevel: 'Budget (<$10)',
        convenienceScore: 'Easy',
      },
    };
    setAnalyzedEntry({
      ...analyzedEntry,
      items: [...analyzedEntry.items, newItem],
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome context */}
      <div className="bg-[#1e3a31] text-white p-6 rounded-xl shadow-xs border border-[#2d5a4c]/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#a8c69f]">Daily Input</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Plastic Logging Journal</h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Write naturally about what you used, purchased, avoided, or disposed of. Gemini will categorize items, identify reusable alternatives, and log your progress.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onOpenQuickAdd && (
              <button
                id="btn-quick-add-banner"
                type="button"
                onClick={onOpenQuickAdd}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#a8c69f] hover:bg-[#bce0b2] text-[#1e3a31] text-xs font-bold uppercase tracking-wider rounded-lg shadow-xs transition-colors shrink-0"
              >
                <Zap className="w-4 h-4 text-[#1e3a31] fill-current" />
                <span>+ Quick Add</span>
              </button>
            )}
            {onOpenScanner && (
              <button
                id="btn-scan-plastic-banner"
                type="button"
                onClick={onOpenScanner}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#2d5a4c] hover:bg-[#3d7362] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-xs transition-colors shrink-0 border border-[#3e7262]"
              >
                <ScanLine className="w-4 h-4 text-[#a8c69f]" />
                <span>Scan Plastic</span>
              </button>
            )}
            <div className="flex items-center gap-2 bg-[#2d5a4c] px-3.5 py-2.5 rounded-lg border border-[#3d7362] text-xs text-[#a8c69f] font-semibold shrink-0">
              <ShieldCheck className="w-4 h-4 text-[#a8c69f]" />
              <span>Private User Firestore</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Access Cards: Quick Add, Scanner & Impact Wall */}
      {(onOpenQuickAdd || onOpenScanner || onOpenImpactWall) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {onOpenQuickAdd && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#1e3a31] text-[#a8c69f] flex items-center justify-center border border-[#2d5a4c] shadow-xs shrink-0">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#2d5a4c]">
                      Fast Recording
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                      ⚡ 3-Sec
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mt-0.5">Quick Add</h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    Log bottles, bags, or packaging in seconds without writing a full entry.
                  </p>
                </div>
              </div>
              <button
                id="btn-quick-add-dashboard"
                type="button"
                onClick={onOpenQuickAdd}
                className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white px-4 py-2.5 rounded-lg bg-[#1e3a31] hover:bg-[#2d5a4c] border border-[#2d5a4c] transition-colors shadow-xs w-full sm:w-auto self-end"
              >
                <Zap className="w-3.5 h-3.5 text-[#a8c69f] fill-current" />
                <span>+ Quick Add</span>
              </button>
            </div>
          )}

          {onOpenScanner && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#1e3a31] text-[#a8c69f] flex items-center justify-center border border-[#2d5a4c] shadow-xs shrink-0">
                  <ScanLine className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#2d5a4c]">
                      AI Multimodal Vision
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      New
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mt-0.5">Plastic Scanner</h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    Snap or upload a photo to identify resin codes (#1–#7), check recyclability, and find alternatives.
                  </p>
                </div>
              </div>
              <button
                id="btn-scan-plastic-dashboard"
                type="button"
                onClick={onOpenScanner}
                className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white px-4 py-2.5 rounded-lg bg-[#2d5a4c] hover:bg-[#1e3a31] border border-[#3e7262] transition-colors shadow-xs w-full sm:w-auto self-end"
              >
                <ScanLine className="w-3.5 h-3.5 text-[#a8c69f]" />
                <span>Scan Plastic</span>
              </button>
            </div>
          )}

          {onOpenImpactWall && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#1e3a31] text-[#a8c69f] flex items-center justify-center border border-[#2d5a4c] shadow-xs shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#2d5a4c]">
                      Impact Wall Live
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f4f7f5] text-[#1e3a31] border border-slate-200">
                      {avoidedCount || 0} Total Avoided
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mt-0.5">Your Milestones</h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    Celebrate milestone badges, avoided bottles &amp; bags, and monthly plastic reduction progress.
                  </p>
                </div>
              </div>
              <button
                id="btn-view-impact-wall-card"
                type="button"
                onClick={onOpenImpactWall}
                className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white px-4 py-2.5 rounded-lg bg-[#2d5a4c] hover:bg-[#1e3a31] border border-[#3e7262] transition-colors shadow-xs w-full sm:w-auto self-end"
              >
                <span>View Impact Wall</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#a8c69f]" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Input Box Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-xs uppercase tracking-wide text-slate-700">Daily Journal</h2>
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded text-[10px] text-slate-500 font-bold uppercase tracking-wider border border-slate-200">
              <Calendar className="w-3 h-3 text-[#2d5a4c]" />
              <input
                type="date"
                id="entry-date-picker"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-slate-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onOpenQuickAdd && (
              <button
                type="button"
                id="btn-switch-to-quick-add"
                onClick={onOpenQuickAdd}
                className="text-xs text-[#2d5a4c] hover:text-[#1e3a31] font-bold flex items-center gap-1.5 bg-[#f4f7f5] hover:bg-[#e7eee9] px-2.5 py-1 rounded-lg border border-[#c4d7cc] transition-colors"
              >
                <Zap className="w-3.5 h-3.5 text-[#2d5a4c] fill-current" />
                <span>Short on time? Use Quick Add</span>
              </button>
            )}
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Quick Prompts
            </div>
          </div>
        </div>

        {/* Quick sample pills */}
        <div className="flex flex-wrap gap-2 mb-3">
          {SAMPLE_PROMPTS.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setJournalText(sample)}
              className="text-left text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
            >
              &quot;{sample.slice(0, 48)}...&quot;
            </button>
          ))}
        </div>

        {/* Journal Textarea */}
        <div className="relative bg-slate-50 rounded-lg p-3 sm:p-4 border border-dashed border-slate-300 focus-within:bg-white focus-within:border-[#2d5a4c] transition-colors">
          <textarea
            id="journal-textarea"
            rows={4}
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
            placeholder="Today I bought a bottle of water, used two plastic bags, and ordered food in a plastic container..."
            className="w-full text-sm text-slate-800 bg-transparent border-none focus:outline-none placeholder:text-slate-400 resize-none leading-relaxed"
          />
          <div className="flex justify-between items-center mt-2 text-[11px] text-slate-400 font-medium">
            <span>Natural language friendly &bull; Mention avoided plastics too</span>
            <span>{journalText.length}/3000 chars</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            id="btn-analyze-gemini"
            type="button"
            disabled={isAnalyzing || !journalText.trim()}
            onClick={handleAnalyze}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#2d5a4c] hover:bg-[#1e3a31] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-xs transition-colors"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processing Entry...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-[#a8c69f]" />
                <span>Process Entry</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error / Success Notifications */}
      {errorMsg && (
        <div className="flex items-start gap-3 p-4 bg-white border border-[#fbd5d5] text-[#9b1c1c] rounded-xl text-xs font-medium shadow-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#9b1c1c] mt-0.5" />
          <div className="flex-1">
            <p className="font-bold uppercase tracking-wider text-[10px]">Notice</p>
            <p className="mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {saveSuccessMsg && (
        <div className="flex items-start gap-3 p-4 bg-white border border-[#2d5a4c]/40 text-[#1e3a31] rounded-xl text-xs font-medium shadow-xs">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[#2d5a4c] mt-0.5" />
          <div className="flex-1">
            <p className="font-bold uppercase tracking-wider text-[10px] text-[#2d5a4c]">Saved Successfully</p>
            <p className="mt-0.5">{saveSuccessMsg}</p>
          </div>
        </div>
      )}

      {/* Analysis Results View */}
      {analyzedEntry && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-6">
          {/* Daily Reflection Header */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#2d5a4c]" />
                <span>Gemini Reflection</span>
              </h3>
              <p className="text-sm font-medium text-slate-700 leading-relaxed italic">
                &ldquo;{analyzedEntry.reflection}&rdquo;
              </p>
              <div className="mt-3 text-xs font-semibold text-[#1e3a31] bg-white p-3 rounded-lg border border-slate-200 flex items-center gap-2">
                <span className="text-[#2d5a4c] font-bold">Encouragement:</span>
                <span>{analyzedEntry.encouragement}</span>
              </div>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-[#a8c69f]/15 rounded-tl-full pointer-events-none" />
          </div>

          {/* Clarifying Questions if any */}
          {analyzedEntry.clarifyingQuestions && analyzedEntry.clarifyingQuestions.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] mb-1">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Coach Clarification</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-amber-800">
                {analyzedEntry.clarifyingQuestions.map((q, qIdx) => (
                  <li key={qIdx}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Extracted Items & Alternatives List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-[#2d5a4c]" />
                <span>Detected Items ({analyzedEntry.items.length})</span>
              </h3>
              <button
                type="button"
                onClick={handleAddManualItem}
                className="text-xs text-[#2d5a4c] hover:text-[#1e3a31] font-bold uppercase tracking-wider flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            {analyzedEntry.items.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50">
                No plastic items detected in this entry. You can add one manually or log another entry.
              </p>
            ) : (
              <div className="space-y-3">
                {analyzedEntry.items.map((item) => {
                  const isAvoided = item.action === 'avoided';
                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isAvoided
                          ? 'bg-[#f4f7f5] border-[#a8c69f]'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                            <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                              {item.category}
                            </span>
                            {isAvoided ? (
                              <span className="text-[10px] uppercase font-bold tracking-wider bg-[#a8c69f]/30 text-[#1e3a31] px-2.5 py-0.5 rounded-full border border-[#a8c69f] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-[#2d5a4c]" />
                                <span>Avoided!</span>
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-[#fdf2f2] border border-[#fbd5d5] text-[#9b1c1c] rounded-full">
                                {item.action}
                              </span>
                            )}
                          </div>
                          {item.estimatedImpactNote && (
                            <p className="text-xs text-slate-500 mt-1">
                              &bull; <span className="italic">{item.estimatedImpactNote}</span>
                            </p>
                          )}
                        </div>

                        {/* Interactive Action & Quantity Selector */}
                        <div className="flex items-center gap-3">
                          {/* Action Selector */}
                          <select
                            value={item.action}
                            onChange={(e) =>
                              handleItemActionChange(item.id, e.target.value as PlasticAction)
                            }
                            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#2d5a4c] font-semibold"
                          >
                            <option value="used">Used</option>
                            <option value="purchased">Purchased</option>
                            <option value="avoided">Avoided</option>
                            <option value="reused">Reused</option>
                            <option value="disposed">Disposed</option>
                          </select>

                          {/* Quantity Stepper */}
                          <div className="flex items-center border border-slate-200 bg-slate-50 rounded-lg">
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(item.id, -1)}
                              className="px-2.5 py-0.5 text-xs text-slate-500 hover:text-slate-800 font-bold"
                            >
                              -
                            </button>
                            <span className="text-xs font-bold px-2 text-slate-800">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(item.id, 1)}
                              className="px-2.5 py-0.5 text-xs text-slate-500 hover:text-slate-800 font-bold"
                            >
                              +
                            </button>
                          </div>

                          {/* Remove button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Practical Alternative Recommendation Card */}
                      {item.alternative && (
                        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 shadow-xs">
                          <div className="flex items-center gap-2 text-xs font-bold mb-1">
                            <span className="text-[10px] font-bold text-[#e8c46c] uppercase tracking-wider">
                              Smart Alternative
                            </span>
                            <span className="text-slate-400">&bull;</span>
                            <span className="text-slate-800">{item.alternative.title}</span>
                          </div>
                          <p className="text-xs text-slate-600 mb-2 leading-relaxed">
                            {item.alternative.whyBetter}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
                            <span className="px-2 py-0.5 bg-white text-[#2d5a4c] rounded border border-slate-200">
                              💰 {item.alternative.costLevel}
                            </span>
                            <span className="px-2 py-0.5 bg-white text-slate-700 rounded border border-slate-200">
                              ⚡ Convenience: {item.alternative.convenienceScore}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Confirm & Save Button */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Saving preserves your journal entry and Gemini recommendations in your isolated Firestore partition.
            </p>
            <button
              id="btn-save-entry"
              type="button"
              disabled={isSaving}
              onClick={handleSaveToFirestore}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#2d5a4c] hover:bg-[#1e3a31] disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-xs transition-colors"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving to Database...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Journal Entry</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
