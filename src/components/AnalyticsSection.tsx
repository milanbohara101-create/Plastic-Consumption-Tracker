import React, { useMemo } from 'react';
import type { JournalEntry } from '../types';
import {
  TrendingDown,
  ShieldAlert,
  CheckCircle2,
  Calendar,
  Sparkles,
  Info,
  Layers,
  Award,
} from 'lucide-react';

interface AnalyticsSectionProps {
  entries: JournalEntry[];
}

export const AnalyticsSection: React.FC<AnalyticsSectionProps> = ({ entries }) => {
  // Aggregate stats
  const stats = useMemo(() => {
    let totalUsed = 0;
    let totalAvoided = 0;
    let totalPurchased = 0;
    let totalDisposed = 0;

    const categoryMap: Record<string, number> = {};
    const itemMap: Record<string, { count: number; category: string }> = {};

    entries.forEach((entry) => {
      (entry.items || []).forEach((item) => {
        const qty = item.quantity || 1;
        if (item.action === 'avoided') {
          totalAvoided += qty;
        } else if (item.action === 'purchased') {
          totalPurchased += qty;
          totalUsed += qty;
        } else if (item.action === 'disposed') {
          totalDisposed += qty;
        } else {
          totalUsed += qty;
        }

        const cat = item.category || 'Other Packaging';
        categoryMap[cat] = (categoryMap[cat] || 0) + qty;

        const normalizedName = item.name.trim();
        if (normalizedName) {
          if (!itemMap[normalizedName]) {
            itemMap[normalizedName] = { count: 0, category: cat };
          }
          itemMap[normalizedName].count += qty;
        }
      });
    });

    const sortedCategories = Object.entries(categoryMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const sortedItems = Object.entries(itemMap)
      .map(([name, data]) => ({ name, count: data.count, category: data.category }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Calculate avoid ratio
    const totalImpactItems = totalUsed + totalAvoided;
    const avoidRatio = totalImpactItems > 0 ? Math.round((totalAvoided / totalImpactItems) * 100) : 0;

    return {
      totalEntries: entries.length,
      totalUsed,
      totalAvoided,
      totalPurchased,
      totalDisposed,
      sortedCategories,
      sortedItems,
      avoidRatio,
    };
  }, [entries]);

  // Day-of-week distribution
  const dayStats = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    entries.forEach((e) => {
      const d = new Date(e.date || Date.now());
      const dayIdx = (d.getDay() + 6) % 7; // Monday = 0
      const itemsCount = (e.items || []).length;
      counts[dayIdx] += itemsCount || 1;
    });
    const maxVal = Math.max(...counts, 1);
    return days.map((day, i) => ({
      day,
      count: counts[i],
      heightPct: Math.max(12, Math.round((counts[i] / maxVal) * 90)),
      isHighest: counts[i] === maxVal && counts[i] > 0,
    }));
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <div className="w-12 h-12 rounded-lg bg-[#f4f7f5] border border-slate-200 text-[#2d5a4c] flex items-center justify-center mx-auto mb-3">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-sm uppercase tracking-wider text-slate-800">No Journal Entries Recorded Yet</h3>
        <p className="text-slate-500 text-xs mt-1 max-w-md mx-auto leading-relaxed">
          Start recording what plastic products you used or avoided in the &quot;Daily Journal&quot; tab. Your patterns, categories, and reduction trends will appear here.
        </p>
      </div>
    );
  }

  const maxCatCount = stats.sortedCategories[0]?.count || 1;

  return (
    <div className="space-y-6">
      {/* Top Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Avoided Plastics (Hero Stat) */}
        <div className="bg-[#2d5a4c] text-white rounded-xl p-5 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 bg-white/15 rounded-full flex items-center justify-center text-xl shrink-0">
            🌿
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-[#a8c69f] tracking-wider mb-1">
              Plastics Avoided
            </p>
            <p className="text-2xl font-bold leading-none">{stats.totalAvoided} <span className="text-xs font-normal opacity-80">items</span></p>
            <p className="text-[11px] opacity-80 mt-1">Conscious skips & reusable choices</p>
          </div>
        </div>

        {/* Total Used Plastics */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Plastics Logged (Used)
            </span>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-slate-800">{stats.totalUsed}</span>
            <span className="text-xs text-slate-400">items</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Awareness enables intentional change</p>
        </div>

        {/* Avoidance Ratio */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Avoidance Rate
            </span>
            <TrendingDown className="w-4 h-4 text-[#2d5a4c]" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-[#2d5a4c]">
              {stats.avoidRatio}%
            </span>
            <span className="text-xs text-slate-400">bypassed</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Rate of conscious avoidance</p>
        </div>

        {/* Total Entries Recorded */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Journal Days Logged
            </span>
            <Calendar className="w-4 h-4 text-[#1e3a31]" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-slate-800">
              {stats.totalEntries}
            </span>
            <span className="text-xs text-slate-400">days active</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Consistent logging records real routines</p>
        </div>
      </div>

      {/* Geometric Weekly Overview Bar Chart & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Overview Bars */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col h-72">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Activity Overview
            </h3>
            <span className="text-[10px] font-bold uppercase text-[#2d5a4c] bg-[#f4f7f5] px-2 py-0.5 rounded border border-[#a8c69f]">
              Weekly Distribution
            </span>
          </div>
          <div className="flex-1 flex items-end justify-between px-3 pb-2 border-b border-slate-100">
            {dayStats.map((item, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1.5 flex-1 max-w-[40px]">
                <span className="text-[9px] font-bold text-slate-400">{item.count > 0 ? item.count : ''}</span>
                <div
                  className={`w-full rounded-t-sm transition-all duration-300 ${
                    item.isHighest ? 'bg-[#2d5a4c]' : item.count > 0 ? 'bg-[#a8c69f]' : 'bg-slate-200'
                  }`}
                  style={{ height: `${item.heightPct}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-2 px-2">
            {dayStats.map((item, idx) => (
              <span key={idx} className="flex-1 text-center">{item.day.slice(0, 1)}</span>
            ))}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-[#2d5a4c]" />
                <span>Usage by Category</span>
              </h3>
              <span className="text-[10px] font-bold uppercase text-slate-400">Total volume</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Shows where plastic enters your daily lifestyle most frequently.
            </p>

            <div className="space-y-3">
              {stats.sortedCategories.map((cat) => {
                const percentage = Math.round((cat.count / maxCatCount) * 100);
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{cat.category}</span>
                      <span className="font-bold text-slate-500">{cat.count} items</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#2d5a4c] h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Frequently Encountered Items */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Award className="w-3.5 h-3.5 text-[#e8c46c]" />
            <span>Frequently Encountered Plastic Products</span>
          </h3>
          <span className="text-[10px] font-bold uppercase text-[#2d5a4c] bg-[#f4f7f5] px-2 py-0.5 rounded border border-[#a8c69f]">
            Swap Targets
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Prime targets for finding high-impact, cost-effective reusable alternatives.
        </p>

        {stats.sortedItems.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">No specific items tracked yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.sortedItems.map((item, idx) => (
              <div key={item.name} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-md bg-white border border-slate-200 text-[#1e3a31] flex items-center justify-center text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-800 truncate">{item.name}</p>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 truncate">{item.category}</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#1e3a31] bg-white border border-slate-200 px-2 py-0.5 rounded shrink-0">
                  {item.count}x
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Environmental Honesty & Estimates Clarification Callout */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 flex items-start gap-3">
        <Info className="w-4 h-4 text-[#2d5a4c] shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
            Environmental Estimates Clarification:
          </p>
          <p className="mt-0.5">
            This application tracks physical item counts and observable behavioral habits rather than calculating speculative, fabricated carbon or weight figures. When estimates or lifecycle trade-offs are discussed, Gemini explicitly notes them as rules-of-thumb based on durability and reusability rather than exact laboratory metrics.
          </p>
        </div>
      </div>
    </div>
  );
};
