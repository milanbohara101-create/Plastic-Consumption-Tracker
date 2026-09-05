import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { User } from 'firebase/auth';
import type { JournalEntry, ImpactAdjustment, ImpactCategoryKey } from '../types';
import {
  calculateImpactMetrics,
  calculateMilestoneProgress,
  calculateMonthlyImpact,
} from '../lib/impactCalculator';
import { saveImpactWallData, fetchImpactWallData } from '../lib/firebase';
import {
  Award,
  Trophy,
  ShoppingBag,
  Coffee,
  Package,
  Droplet,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Lock,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  TrendingUp,
  AlertCircle,
  Recycle,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface ImpactWallSectionProps {
  user: User;
  entries: JournalEntry[];
}

export const ImpactWallSection: React.FC<ImpactWallSectionProps> = ({ user, entries }) => {
  const [adjustments, setAdjustments] = useState<ImpactAdjustment[]>([]);
  const [geminiMessage, setGeminiMessage] = useState<string>('');
  const [isLoadingMessage, setIsLoadingMessage] = useState<boolean>(false);
  const [isInitialLoadDone, setIsInitialLoadDone] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Manual Adjustment Form state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [adjName, setAdjName] = useState<string>('');
  const [adjCategory, setAdjCategory] = useState<ImpactCategoryKey | 'reused'>('bags');
  const [adjAction, setAdjAction] = useState<'avoided' | 'reused'>('avoided');
  const [adjQuantity, setAdjQuantity] = useState<number>(1);
  const [adjNote, setAdjNote] = useState<string>('');

  // 1. Initial calculation from historical entries & adjustments
  const metrics = useMemo(() => {
    return calculateImpactMetrics(entries, adjustments);
  }, [entries, adjustments]);

  const milestoneProgress = useMemo(() => {
    return calculateMilestoneProgress(metrics.totalItemsAvoided);
  }, [metrics.totalItemsAvoided]);

  const monthlyImpact = useMemo(() => {
    return calculateMonthlyImpact(entries, adjustments);
  }, [entries, adjustments]);

  // 2. Load persisted Impact Wall data from Firestore on mount
  useEffect(() => {
    let isMounted = true;
    async function loadStoredData() {
      if (!user) {
        setIsInitialLoadDone(true);
        return;
      }
      try {
        const stored = await fetchImpactWallData(user.uid);
        if (stored && isMounted) {
          if (Array.isArray(stored.adjustments)) {
            setAdjustments(stored.adjustments);
          }
          if (stored.positiveMessage?.text) {
            setGeminiMessage(stored.positiveMessage.text);
          }
        }
      } catch (err: any) {
        console.warn('Unable to load stored Impact Wall data:', err?.message || err);
      } finally {
        if (isMounted) {
          setIsInitialLoadDone(true);
        }
      }
    }

    loadStoredData();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // 3. Generate or regenerate positive encouragement message using Gemini
  const generatePositiveMessage = useCallback(
    async (forceRegenerate = false) => {
      if (!user) return;
      if (geminiMessage && !forceRegenerate) return;

      setIsLoadingMessage(true);
      try {
        const res = await fetch('/api/gemini/impact-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            totalAvoided: metrics.totalItemsAvoided,
            totalReused: metrics.plasticItemsReused,
            bagsAvoided: metrics.plasticBagsAvoided,
            bottlesAvoided: metrics.plasticBottlesAvoided,
            containersAvoided: metrics.plasticContainersAvoided,
            cupsAvoided: metrics.disposableCupsAvoided,
            otherAvoided: metrics.otherItemsAvoided,
            mostAvoidedCategory: monthlyImpact.mostAvoidedCategory,
            currentMilestone: milestoneProgress.currentMilestone?.title || '',
            nextMilestone: milestoneProgress.nextMilestone?.title || '',
          }),
        });

        if (!res.ok) {
          throw new Error(`Impact message endpoint returned ${res.status}`);
        }

        const data = await res.json();
        const messageText = data.message || (data.success && data.message);
        if (messageText && isMountedRef.current) {
          setGeminiMessage(messageText);

          // Persist updated message in Firestore if user is authenticated
          try {
            await saveImpactWallData(user.uid, {
              userId: user.uid,
              metrics,
              monthly: monthlyImpact,
              adjustments,
              positiveMessage: {
                text: messageText,
                generatedAt: Date.now(),
              },
              lastUpdated: Date.now(),
            });
          } catch (saveErr) {
            console.warn('Could not persist impact message to Firestore:', saveErr);
          }
        }
      } catch (err: any) {
        console.warn('Unable to fetch live positive impact message, applying local calculation:', err?.message || err);
        // Fallback message if offline or transient failure
        if (isMountedRef.current && !geminiMessage) {
          setGeminiMessage(
            `You have avoided ${metrics.totalItemsAvoided} single-use plastic items so far! Every conscious swap builds lasting change.`
          );
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoadingMessage(false);
        }
      }
    },
    [user, metrics, monthlyImpact, milestoneProgress, adjustments, geminiMessage]
  );

  // Auto-generate message only after initial Firestore load finishes and if none exists
  useEffect(() => {
    if (isInitialLoadDone && !geminiMessage && !isLoadingMessage && entries.length > 0) {
      generatePositiveMessage(false);
    }
  }, [isInitialLoadDone, geminiMessage, isLoadingMessage, entries.length, generatePositiveMessage]);

  // Save adjustments to Firestore and recompute
  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || adjQuantity === 0) return;

    setIsSaving(true);
    const newAdjustment: ImpactAdjustment = {
      id: 'adj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      itemName: adjName.trim() || `${adjCategory.toUpperCase()} adjustment`,
      categoryKey: adjCategory,
      action: adjAction,
      quantityDelta: Number(adjQuantity) || 1,
      note: adjNote.trim() || undefined,
      timestamp: Date.now(),
    };

    const updatedAdjustments = [newAdjustment, ...adjustments];
    setAdjustments(updatedAdjustments);

    try {
      const updatedMetrics = calculateImpactMetrics(entries, updatedAdjustments);
      const updatedMonthly = calculateMonthlyImpact(entries, updatedAdjustments);

      await saveImpactWallData(user.uid, {
        userId: user.uid,
        metrics: updatedMetrics,
        monthly: updatedMonthly,
        adjustments: updatedAdjustments,
        positiveMessage: geminiMessage ? { text: geminiMessage, generatedAt: Date.now() } : undefined,
        lastUpdated: Date.now(),
      });

      setStatusNotification({
        type: 'success',
        text: 'Impact count updated successfully.',
      });
      setTimeout(() => setStatusNotification(null), 3500);

      // Reset form
      setAdjName('');
      setAdjQuantity(1);
      setAdjNote('');
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving impact adjustment:', err);
      setStatusNotification({
        type: 'error',
        text: `Failed to save adjustment: ${err.message}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveAdjustment = async (id: string) => {
    if (!user) return;
    const updatedAdjustments = adjustments.filter((a) => a.id !== id);
    setAdjustments(updatedAdjustments);

    try {
      const updatedMetrics = calculateImpactMetrics(entries, updatedAdjustments);
      const updatedMonthly = calculateMonthlyImpact(entries, updatedAdjustments);

      await saveImpactWallData(user.uid, {
        userId: user.uid,
        metrics: updatedMetrics,
        monthly: updatedMonthly,
        adjustments: updatedAdjustments,
        positiveMessage: geminiMessage ? { text: geminiMessage, generatedAt: Date.now() } : undefined,
        lastUpdated: Date.now(),
      });

      setStatusNotification({
        type: 'success',
        text: 'Adjustment removed.',
      });
      setTimeout(() => setStatusNotification(null), 3000);
    } catch (err: any) {
      setStatusNotification({
        type: 'error',
        text: `Could not remove adjustment: ${err.message}`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {statusNotification && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-xs ${
            statusNotification.type === 'success'
              ? 'bg-white text-[#1e3a31] border-[#2d5a4c]/40'
              : 'bg-white text-[#9b1c1c] border-[#fbd5d5]'
          }`}
        >
          <span>{statusNotification.text}</span>
          <button
            onClick={() => setStatusNotification(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* Hero Header & Gemini Encouragement */}
      <div className="bg-[#1e3a31] text-white rounded-xl p-6 border border-[#2d5a4c]/60 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#2d5a4c] border border-[#3e7262] text-[10px] uppercase font-bold tracking-wider text-[#a8c69f] mb-3">
              <Trophy className="w-3.5 h-3.5 text-[#a8c69f]" />
              <span>Personal Impact Celebration</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tight text-white">
              The Impact Wall
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
              Every avoided cup, bottle, or bag matters. Here is the cumulative tangible progress of your positive choices over time.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              id="btn-correct-impact"
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2d5a4c] hover:bg-[#24483d] text-white border border-[#3e7262] text-xs font-bold uppercase tracking-wider transition-colors shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#a8c69f]" />
              <span>Correct / Log Items</span>
            </button>
          </div>
        </div>

        {/* Gemini Encouraging Message Banner */}
        <div className="mt-5 pt-4 border-t border-[#2d5a4c]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#172e27] p-4 rounded-xl border border-[#2d5a4c]/40">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[#2d5a4c] flex items-center justify-center shrink-0 text-[#a8c69f]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8c69f] block mb-0.5">
                Gemini Personal Reflection:
              </span>
              <p className="text-xs text-slate-200 leading-relaxed font-medium">
                {isLoadingMessage ? (
                  <span className="italic text-slate-400">Reflecting on your milestone progress...</span>
                ) : geminiMessage ? (
                  `"${geminiMessage}"`
                ) : (
                  'Log your daily journal entries to generate personal encouragement and milestone reflections.'
                )}
              </p>
            </div>
          </div>

          <button
            id="btn-refresh-impact-message"
            type="button"
            disabled={isLoadingMessage}
            onClick={() => generatePositiveMessage(true)}
            title="Refresh Encouragement"
            className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#a8c69f] hover:text-white px-3 py-1.5 rounded-lg border border-[#2d5a4c] hover:bg-[#2d5a4c] transition-colors shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingMessage ? 'animate-spin' : ''}`} />
            <span>New Reflection</span>
          </button>
        </div>
      </div>

      {/* Total Avoided Hero Banner & Next Milestone Progress */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-100 pb-4 lg:pb-0 lg:pr-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Total Cumulative Items Avoided
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-extrabold text-[#1e3a31]">
                {metrics.totalItemsAvoided}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                items avoided
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <Recycle className="w-3.5 h-3.5 text-[#2d5a4c]" />
              <span>Plus <strong className="text-slate-800 font-bold">{metrics.plasticItemsReused}</strong> items actively reused</span>
            </div>
          </div>

          {/* Progress to Next Milestone */}
          <div className="lg:col-span-8 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Next Milestone Target
                </span>
                <span className="text-sm font-extrabold uppercase tracking-tight text-slate-800">
                  {milestoneProgress.nextMilestone ? (
                    <>
                      {milestoneProgress.nextMilestone.title} ({milestoneProgress.nextMilestone.threshold} items)
                    </>
                  ) : (
                    'Maximum Milestone Achieved!'
                  )}
                </span>
              </div>
              <span className="text-xs font-bold text-[#2d5a4c] bg-[#f4f7f5] border border-slate-200 px-2.5 py-1 rounded">
                {milestoneProgress.progressPercent}%
              </span>
            </div>

            {/* Geometric Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
              <div
                className="bg-[#2d5a4c] h-full rounded-full transition-all duration-500"
                style={{ width: `${milestoneProgress.progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>
                {milestoneProgress.currentMilestone
                  ? `Completed: ${milestoneProgress.currentMilestone.title} (${milestoneProgress.currentMilestone.threshold})`
                  : 'Start your plastic reduction journey'}
              </span>
              <span>
                {milestoneProgress.nextMilestone
                  ? `${milestoneProgress.itemsToNext} more item${milestoneProgress.itemsToNext === 1 ? '' : 's'} to go`
                  : 'All milestones unlocked!'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6 Metric Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Categorized Avoided &amp; Reused Items
          </span>
          <span className="text-[10px] font-semibold text-slate-400">
            Grounded in your journal entries &amp; adjustments
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Bags */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#2d5a4c] flex items-center justify-center border border-slate-200">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Bags</span>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 block leading-none">
                {metrics.plasticBagsAvoided}
              </span>
              <span className="text-[11px] text-slate-500 font-medium mt-1 block">Bags avoided</span>
            </div>
          </div>

          {/* Bottles */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#2d5a4c] flex items-center justify-center border border-slate-200">
                <Droplet className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Bottles</span>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 block leading-none">
                {metrics.plasticBottlesAvoided}
              </span>
              <span className="text-[11px] text-slate-500 font-medium mt-1 block">Bottles avoided</span>
            </div>
          </div>

          {/* Food Containers */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#2d5a4c] flex items-center justify-center border border-slate-200">
                <Package className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Takeout</span>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 block leading-none">
                {metrics.plasticContainersAvoided}
              </span>
              <span className="text-[11px] text-slate-500 font-medium mt-1 block">Containers avoided</span>
            </div>
          </div>

          {/* Disposable Cups */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#2d5a4c] flex items-center justify-center border border-slate-200">
                <Coffee className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Cups</span>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 block leading-none">
                {metrics.disposableCupsAvoided}
              </span>
              <span className="text-[11px] text-slate-500 font-medium mt-1 block">Cups avoided</span>
            </div>
          </div>

          {/* Other Items */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#2d5a4c] flex items-center justify-center border border-slate-200">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Other</span>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 block leading-none">
                {metrics.otherItemsAvoided}
              </span>
              <span className="text-[11px] text-slate-500 font-medium mt-1 block">Other avoided</span>
            </div>
          </div>

          {/* Reused Items */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#2d5a4c] flex items-center justify-center border border-slate-200">
                <Recycle className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Reused</span>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 block leading-none">
                {metrics.plasticItemsReused}
              </span>
              <span className="text-[11px] text-slate-500 font-medium mt-1 block">Items reused</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Impact Overview */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#2d5a4c]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Monthly Impact Summary &bull; {monthlyImpact.monthName}
            </h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Current Month Cycle
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Month Avoided */}
          <div className="bg-[#f4f7f5] p-3.5 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">
              Avoided This Month
            </span>
            <span className="text-2xl font-black text-[#1e3a31]">
              {monthlyImpact.totalAvoided}
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">
              conscious items saved
            </span>
          </div>

          {/* Month Reused */}
          <div className="bg-[#f4f7f5] p-3.5 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">
              Reused This Month
            </span>
            <span className="text-2xl font-black text-[#1e3a31]">
              {monthlyImpact.totalReused}
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">
              items given a 2nd life
            </span>
          </div>

          {/* Most Avoided Category */}
          <div className="bg-[#f4f7f5] p-3.5 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">
              Top Avoided Category
            </span>
            <span className="text-base font-extrabold text-[#1e3a31] truncate block">
              {monthlyImpact.mostAvoidedCategory}
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">
              highest reduction volume
            </span>
          </div>

          {/* Comparison vs Previous Month */}
          <div className="bg-[#f4f7f5] p-3.5 rounded-lg border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">
              Previous Month Comparison
            </span>
            {monthlyImpact.hasPreviousMonthData ? (
              <div>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-[#2d5a4c]" />
                  <span className="text-base font-black text-slate-900">
                    {monthlyImpact.differenceVsPrevMonth >= 0
                      ? `+${monthlyImpact.differenceVsPrevMonth}`
                      : `${monthlyImpact.differenceVsPrevMonth}`}
                  </span>
                  <span className="text-xs text-slate-600">vs last month</span>
                </div>
                <span className="text-[11px] text-slate-500 block mt-1">
                  Last month: {monthlyImpact.previousMonthAvoided} items avoided
                </span>
              </div>
            ) : (
              <div>
                <span className="text-xs font-bold text-slate-700 block">Baseline Established</span>
                <span className="text-[11px] text-slate-400 block mt-1">
                  Comparison will activate in your second tracked month.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Milestone Achievements Showcase */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-[#2d5a4c]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Milestone Badges &amp; Achievements
            </h2>
          </div>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            {milestoneProgress.allMilestones.filter((m) => m.achieved).length} of{' '}
            {milestoneProgress.allMilestones.length} Unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {milestoneProgress.allMilestones.map((milestone) => (
            <div
              key={milestone.threshold}
              className={`p-4 rounded-xl border transition-all flex items-start gap-3 ${
                milestone.achieved
                  ? 'bg-white border-[#2d5a4c] shadow-xs'
                  : 'bg-slate-50/70 border-slate-200 opacity-60'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  milestone.achieved
                    ? 'bg-[#2d5a4c] text-[#a8c69f]'
                    : 'bg-slate-200 text-slate-400'
                }`}
              >
                {milestone.achieved ? (
                  <CheckCircle2 className="w-5 h-5 text-[#a8c69f]" />
                ) : (
                  <Lock className="w-4 h-4 text-slate-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 truncate">
                    {milestone.title}
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      milestone.achieved
                        ? 'bg-[#f4f7f5] text-[#1e3a31] border border-[#a8c69f]'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {milestone.threshold} items
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {milestone.description}
                </p>
                {milestone.achieved && (
                  <span className="text-[9px] font-bold text-[#2d5a4c] uppercase tracking-wider mt-1.5 inline-block">
                    &bull; Milestone Unlocked
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User Corrections / Adjustments Log */}
      {adjustments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Manual Corrections &amp; Direct Logged Adjustments ({adjustments.length})
            </span>
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-[11px] font-bold text-[#2d5a4c] hover:underline"
            >
              + Add Another
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {adjustments.map((adj) => (
              <div key={adj.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-800 mr-2">{adj.itemName}</span>
                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded uppercase tracking-wider">
                    {adj.action} ({adj.categoryKey})
                  </span>
                  {adj.note && <span className="text-slate-400 italic text-[11px] ml-2">&quot;{adj.note}&quot;</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-[#2d5a4c]">
                    {adj.quantityDelta >= 0 ? `+${adj.quantityDelta}` : adj.quantityDelta}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAdjustment(adj.id)}
                    className="text-slate-300 hover:text-[#9b1c1c] p-1 transition-colors"
                    title="Remove Adjustment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Impact Adjustment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md w-full shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#2d5a4c]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Correct or Log Impact Items
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-base font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddAdjustment} className="space-y-4 text-xs">
              <div>
                <label className="font-bold uppercase tracking-wider text-slate-600 block mb-1">
                  Item Description
                </label>
                <input
                  type="text"
                  id="input-adj-name"
                  value={adjName}
                  onChange={(e) => setAdjName(e.target.value)}
                  placeholder="e.g. Refused grocery plastic bags at checkout"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2d5a4c]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-slate-600 block mb-1">
                    Impact Category
                  </label>
                  <select
                    id="select-adj-category"
                    value={adjCategory}
                    onChange={(e) => setAdjCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2d5a4c] font-medium"
                  >
                    <option value="bags">Plastic Bags</option>
                    <option value="bottles">Plastic Bottles</option>
                    <option value="containers">Food Containers</option>
                    <option value="cups">Disposable Cups</option>
                    <option value="other">Other Plastic Items</option>
                    <option value="reused">Reused Item</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold uppercase tracking-wider text-slate-600 block mb-1">
                    Action Type
                  </label>
                  <select
                    id="select-adj-action"
                    value={adjAction}
                    onChange={(e) => setAdjAction(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2d5a4c] font-medium"
                  >
                    <option value="avoided">Avoided (Prevented)</option>
                    <option value="reused">Reused (Repurposed)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-slate-600 block mb-1">
                    Quantity Adjustment
                  </label>
                  <input
                    type="number"
                    id="input-adj-quantity"
                    min={-50}
                    max={100}
                    value={adjQuantity}
                    onChange={(e) => setAdjQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2d5a4c]"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Use positive to add, negative to subtract.
                  </span>
                </div>

                <div>
                  <label className="font-bold uppercase tracking-wider text-slate-600 block mb-1">
                    Optional Note
                  </label>
                  <input
                    type="text"
                    id="input-adj-note"
                    value={adjNote}
                    onChange={(e) => setAdjNote(e.target.value)}
                    placeholder="e.g. Weekly farmer's market"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2d5a4c]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-bold uppercase tracking-wider text-[11px]"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-adj-submit"
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-[#2d5a4c] hover:bg-[#1e3a31] text-white font-bold uppercase tracking-wider text-[11px] shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Apply Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
