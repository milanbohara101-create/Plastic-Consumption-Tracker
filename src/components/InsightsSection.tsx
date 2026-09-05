import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import {
  Sparkles,
  Calendar,
  Award,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  Bookmark,
  ChevronRight,
} from 'lucide-react';
import type { JournalEntry, SustainabilitySummary } from '../types';
import { saveSummary, fetchSummaries } from '../lib/firebase';

interface InsightsSectionProps {
  user: User;
  entries: JournalEntry[];
}

export const InsightsSection: React.FC<InsightsSectionProps> = ({ user, entries }) => {
  const [timeframe, setTimeframe] = useState<'weekly' | 'monthly'>('weekly');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentInsight, setCurrentInsight] = useState<SustainabilitySummary | null>(null);
  const [savedSummaries, setSavedSummaries] = useState<SustainabilitySummary[]>([]);

  // Load existing summaries from Firestore
  useEffect(() => {
    let mounted = true;
    async function loadPastSummaries() {
      try {
        const list = await fetchSummaries(user.uid);
        if (mounted && list.length > 0) {
          setSavedSummaries(list);
          // show latest by default if none generated in current session
          if (!currentInsight) {
            setCurrentInsight(list[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load past summaries:', err);
      }
    }
    loadPastSummaries();
    return () => {
      mounted = false;
    };
  }, [user.uid]);

  const handleGenerateInsights = async () => {
    if (entries.length === 0) {
      setErrorMsg('You need at least one journal entry to generate sustainability insights.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);

    try {
      // Calculate aggregate stats for prompt
      const totalAvoided = entries.reduce(
        (sum, e) => sum + e.items.filter((i) => i.action === 'avoided').length,
        0
      );

      const response = await fetch('/api/gemini/generate-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeframe,
          entries: entries.slice(0, 20),
          stats: {
            totalLogged: entries.length,
            totalAvoided,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${response.status}`);
      }

      const res = await response.json();
      const raw = res.insights || {};

      const newSummary: SustainabilitySummary = {
        id: `sum-${Date.now()}`,
        userId: user.uid,
        timeframe,
        periodTitle: raw.periodTitle || `${timeframe === 'weekly' ? 'Weekly' : 'Monthly'} Reflection`,
        headline: raw.headline || 'Progress toward mindful plastic reduction',
        topObservedHabits: raw.topObservedHabits || [],
        achievements: raw.achievements || [],
        highImpactSwaps: raw.highImpactSwaps || [],
        areasForImprovement: raw.areasForImprovement || [],
        encouragingClosing: raw.encouragingClosing || 'Every mindful choice adds up to real difference.',
        createdAt: Date.now(),
      };

      setCurrentInsight(newSummary);

      // Persist to user-isolated Firestore
      await saveSummary(user.uid, newSummary);
      setSavedSummaries((prev) => [newSummary, ...prev.filter((s) => s.id !== newSummary.id)]);
    } catch (err: any) {
      console.error('Insights error:', err);
      setErrorMsg(err.message || 'Failed to generate insights. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-[#1e3a31] text-white p-6 rounded-xl shadow-xs border border-[#2d5a4c]/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold tracking-wider uppercase text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#a8c69f]" />
              <span>Historical Insights &amp; Gemini Reflections</span>
            </h2>
            <p className="text-slate-300 text-xs mt-1 max-w-2xl leading-relaxed">
              Gemini reviews your logged habits, surfaces recurring patterns, celebrates conscious avoidance, and identifies the highest-impact budget-friendly swaps.
            </p>
          </div>

          {/* Timeframe & Generator Controls */}
          <div className="flex items-center gap-1.5 bg-[#172e27] p-1.5 rounded-lg border border-[#2d5a4c]/40 shrink-0">
            <button
              type="button"
              onClick={() => setTimeframe('weekly')}
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
                timeframe === 'weekly'
                  ? 'bg-[#2d5a4c] text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('monthly')}
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
                timeframe === 'monthly'
                  ? 'bg-[#2d5a4c] text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              id="btn-generate-insights"
              type="button"
              disabled={isGenerating || entries.length === 0}
              onClick={handleGenerateInsights}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#a8c69f] hover:bg-[#97b88e] disabled:opacity-50 text-[#1e3a31] font-bold text-xs uppercase tracking-wider rounded shadow-xs transition-colors ml-1 shrink-0"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1e3a31]" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-[#1e3a31]" />
                  <span>Generate</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-white border border-[#fbd5d5] text-[#9b1c1c] rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#9b1c1c] shrink-0" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Active Generated Insight View */}
      {currentInsight ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-6">
          {/* Headline & Period Title */}
          <div className="border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2 text-[10px] font-bold text-[#2d5a4c] uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5" />
              <span>{currentInsight.periodTitle}</span>
              <span className="text-slate-400 font-normal">
                &bull; Generated {new Date(currentInsight.createdAt).toLocaleDateString()}
              </span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800 mt-1">{currentInsight.headline}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Observed Habits */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2 mb-3">
                <TrendingUp className="w-3.5 h-3.5 text-[#2d5a4c]" />
                <span>Observed Behavioral Patterns</span>
              </h4>
              <ul className="space-y-2 text-xs text-slate-700">
                {currentInsight.topObservedHabits.map((habit, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2d5a4c] mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{habit}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Celebrated Achievements */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="font-bold text-[#1e3a31] text-xs uppercase tracking-wider flex items-center gap-2 mb-3">
                <Award className="w-3.5 h-3.5 text-[#e8c46c]" />
                <span>Celebrated Wins &amp; Avoided Plastics</span>
              </h4>
              <ul className="space-y-2 text-xs text-slate-700">
                {currentInsight.achievements.map((ach, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#2d5a4c] mt-0.5 shrink-0" />
                    <span className="leading-relaxed">{ach}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* High-Impact Swaps */}
          <div>
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2 mb-3">
              <Lightbulb className="w-3.5 h-3.5 text-[#e8c46c]" />
              <span>Recommended High-Impact, Realistic Swaps</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {currentInsight.highImpactSwaps.map((swap, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-800">{swap.targetItem}</p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {swap.recommendation}
                    </p>
                  </div>
                  {swap.estimatedCostBenefit && (
                    <span className="inline-block mt-3 text-[10px] bg-[#f4f7f5] text-[#1e3a31] px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-[#a8c69f] self-start">
                      💡 {swap.estimatedCostBenefit}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Areas for gentle improvement */}
          {currentInsight.areasForImprovement && currentInsight.areasForImprovement.length > 0 && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] block mb-1">
                Gentle Next Steps for Future Weeks:
              </span>
              <ul className="list-disc list-inside space-y-1">
                {currentInsight.areasForImprovement.map((area, idx) => (
                  <li key={idx}>{area}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Closing Encouragement */}
          <div className="p-4 rounded-lg bg-[#f4f7f5] border border-[#a8c69f] text-xs text-[#1e3a31] font-medium leading-relaxed">
            🌿 {currentInsight.encouragingClosing}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center shadow-xs">
          <Sparkles className="w-8 h-8 text-[#2d5a4c] mx-auto mb-2" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-800">No Insights Generated Yet</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
            Click &quot;Generate&quot; above to have Gemini review your journal history and uncover your plastic patterns and high-impact swaps.
          </p>
        </div>
      )}

      {/* Previously Saved Summaries Archive */}
      {savedSummaries.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h4 className="font-bold text-slate-400 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5 text-[#2d5a4c]" />
            <span>Saved Historical Reports ({savedSummaries.length})</span>
          </h4>
          <div className="divide-y divide-slate-100">
            {savedSummaries.map((sum) => (
              <button
                key={sum.id}
                type="button"
                onClick={() => setCurrentInsight(sum)}
                className={`w-full text-left py-2.5 px-3 flex items-center justify-between hover:bg-slate-50 rounded-lg transition-colors text-xs ${
                  currentInsight?.id === sum.id ? 'bg-[#f4f7f5] font-bold text-[#1e3a31] border border-slate-200' : ''
                }`}
              >
                <div>
                  <span className="font-bold text-slate-800">{sum.periodTitle}: </span>
                  <span className="text-slate-600">{sum.headline}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                  <span>{new Date(sum.createdAt).toLocaleDateString()}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
