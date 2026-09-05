import React, { useState } from 'react';
import type { JournalEntry } from '../types';
import {
  Calendar,
  Search,
  CheckCircle2,
  Lightbulb,
  Trash2,
  Layers,
  Sparkles,
  Filter,
  Zap,
  ScanLine,
  BookOpen,
} from 'lucide-react';

interface HistorySectionProps {
  entries: JournalEntry[];
  onDeleteEntry: (entryId: string) => void;
}

export const HistorySection: React.FC<HistorySectionProps> = ({ entries, onDeleteEntry }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterAction, setFilterAction] = useState<string>('all');

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      searchQuery === '' ||
      entry.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.reflection.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.quickAddMetadata?.note && entry.quickAddMetadata.note.toLowerCase().includes(searchQuery.toLowerCase())) ||
      entry.items.some((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

    let matchesFilter = true;
    if (filterAction === 'avoided') {
      matchesFilter = entry.items.some((i) => i.action === 'avoided');
    } else if (filterAction === 'used') {
      matchesFilter = entry.items.some((i) => i.action !== 'avoided');
    } else if (filterAction === 'quick_add') {
      matchesFilter = entry.source === 'quick_add';
    } else if (filterAction === 'scanner') {
      matchesFilter = entry.source === 'scanner';
    } else if (filterAction === 'journal') {
      matchesFilter = !entry.source || entry.source === 'journal';
    }

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-5">
      {/* Search & Filter Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            id="history-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries, plastic items, notes, or reflections..."
            className="w-full text-xs pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2d5a4c] text-slate-800"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            id="history-filter-select"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#2d5a4c] font-semibold uppercase tracking-wider"
          >
            <option value="all">All Logs ({entries.length})</option>
            <option value="quick_add">⚡ Quick Add Logs ({entries.filter((e) => e.source === 'quick_add').length})</option>
            <option value="scanner">📷 Plastic Scans ({entries.filter((e) => e.source === 'scanner').length})</option>
            <option value="journal">📖 Full Journals ({entries.filter((e) => !e.source || e.source === 'journal').length})</option>
            <option value="avoided">🌱 Includes Avoided Plastic</option>
            <option value="used">Includes Used Plastic</option>
          </select>
        </div>
      </div>

      {/* Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center shadow-xs">
          <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-700">No Entries Found</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {searchQuery || filterAction !== 'all'
              ? 'Try changing your search or filter options.'
              : 'Your plastic consumption and reduction logs will be listed here chronologically.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((entry) => {
            const hasAvoided = entry.items.some((i) => i.action === 'avoided');
            const isQuickAdd = entry.source === 'quick_add';
            const isScanner = entry.source === 'scanner';
            const photoUrl = entry.quickAddMetadata?.photoUrl;

            return (
              <div
                key={entry.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs transition-all"
              >
                {/* Entry Date, Source Badge & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[#2d5a4c]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      {new Date(entry.date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>

                    {/* Source Badge */}
                    {isQuickAdd && (
                      <span className="text-[10px] bg-amber-50 text-amber-900 border border-amber-200 font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-600 fill-current" />
                        <span>Quick Add</span>
                      </span>
                    )}

                    {isScanner && (
                      <span className="text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1">
                        <ScanLine className="w-3 h-3 text-emerald-700" />
                        <span>Scanner</span>
                      </span>
                    )}

                    {!isQuickAdd && !isScanner && (
                      <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-slate-500" />
                        <span>Journal</span>
                      </span>
                    )}

                    {hasAvoided && (
                      <span className="text-[10px] bg-[#f4f7f5] text-[#1e3a31] border border-[#a8c69f] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-[#2d5a4c]" />
                        <span>Avoided Plastic!</span>
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteEntry(entry.id)}
                    className="text-slate-300 hover:text-[#9b1c1c] p-1 transition-colors"
                    title="Delete Entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Raw User Text & Optional Photo */}
                <div className="flex flex-col sm:flex-row items-start gap-3 mb-3">
                  {photoUrl && (
                    <img
                      src={photoUrl}
                      alt="Logged plastic item"
                      className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-slate-200 shrink-0"
                    />
                  )}
                  <div className="flex-1 w-full">
                    <p className="text-xs text-slate-700 italic bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
                      &quot;{entry.text}&quot;
                    </p>
                    {entry.quickAddMetadata?.note && entry.quickAddMetadata.note !== entry.text && (
                      <p className="text-[11px] text-slate-500 mt-1 pl-1">
                        <span className="font-semibold text-slate-600">Note:</span> {entry.quickAddMetadata.note}
                      </p>
                    )}
                  </div>
                </div>

                {/* Gemini Reflection / Feedback */}
                {entry.reflection && (
                  <div className="text-xs text-slate-600 mb-3 bg-[#f4f7f5] p-3 rounded-lg border border-slate-200 leading-relaxed">
                    <span className="font-bold text-[#1e3a31] uppercase tracking-wider text-[10px] flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-3 h-3 text-[#2d5a4c]" />
                      <span>Gemini Reflection:</span>
                    </span>
                    <p>{entry.reflection}</p>
                  </div>
                )}

                {/* Extracted Items */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Recorded Items ({entry.items.length}):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {entry.items.map((it) => (
                      <div
                        key={it.id}
                        className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs flex flex-col justify-between shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 truncate mr-2">{it.name}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                              it.action === 'avoided'
                                ? 'bg-[#2d5a4c] text-[#a8c69f]'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {it.action} ({it.quantity})
                          </span>
                        </div>

                        {it.alternative && (
                          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex items-start gap-1.5">
                            <Lightbulb className="w-3 h-3 text-[#e8c46c] mt-0.5 shrink-0" />
                            <span className="truncate font-medium">Swap: {it.alternative.title}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
