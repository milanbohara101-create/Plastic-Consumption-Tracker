import React from 'react';
import type { User } from 'firebase/auth';
import { Leaf, LogOut, BookOpen, MessageSquare, BarChart3, Sparkles, History, Trophy, ScanLine, Zap } from 'lucide-react';

interface NavbarProps {
  user: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onSignOut: () => void;
  avoidedCount: number;
  onOpenQuickAdd?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  setActiveTab,
  onSignOut,
  avoidedCount,
  onOpenQuickAdd,
}) => {
  const navItems = [
    { id: 'journal', label: 'Daily Journal', icon: BookOpen },
    { id: 'scanner', label: 'Plastic Scanner', icon: ScanLine },
    { id: 'impact', label: 'Impact Wall', icon: Trophy },
    { id: 'chat', label: 'Gemini Coach', icon: MessageSquare },
    { id: 'analytics', label: 'Progress & Trends', icon: BarChart3 },
    { id: 'insights', label: 'Weekly/Monthly Insights', icon: Sparkles },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#1e3a31] text-white border-b border-[#2d5a4c]/60 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & App Name */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#a8c69f] rounded-lg flex items-center justify-center shadow-xs shrink-0">
              <div className="w-4 h-4 border-2 border-[#1e3a31] rounded-full"></div>
            </div>
            <div>
              <span className="font-bold text-base sm:text-lg tracking-tight text-white block leading-tight">
                PLASTIC TRACKER
              </span>
              <span className="text-[10px] text-[#a8c69f] font-semibold uppercase tracking-widest block">
                Sustainability Companion • Gemini AI
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-[#172e27] p-1 rounded-xl border border-[#2d5a4c]/40">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                    isActive
                      ? 'bg-[#2d5a4c] text-white shadow-xs border border-[#3e7262]'
                      : 'text-slate-300 hover:text-white hover:bg-[#224137]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* User Profile & Avoided Badge */}
          <div className="flex items-center gap-3">
            {onOpenQuickAdd && (
              <button
                id="nav-btn-quick-add"
                type="button"
                onClick={onOpenQuickAdd}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#a8c69f] hover:bg-[#bce0b2] text-[#1e3a31] text-xs font-bold uppercase tracking-wider rounded-lg shadow-xs transition-colors shrink-0"
              >
                <Zap className="w-3.5 h-3.5 fill-current text-[#1e3a31]" />
                <span className="hidden sm:inline">+ Quick Add</span>
                <span className="sm:hidden">+ Log</span>
              </button>
            )}

            {avoidedCount > 0 && (
              <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2d5a4c] border border-[#3e7262] text-xs text-[#a8c69f] font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#a8c69f]" />
                <span>{avoidedCount} avoided</span>
              </div>
            )}

            <div className="flex items-center gap-2 pl-2 border-l border-[#2d5a4c]/60">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-[#1e3a31]">
                  {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.isAnonymous ? 'JD' : 'U'}
                </div>
              )}
              <span className="hidden sm:inline text-xs text-slate-200 max-w-[120px] truncate font-medium">
                {user.displayName || (user.isAnonymous ? 'Guest User' : user.email?.split('@')[0])}
              </span>
              <button
                id="btn-sign-out"
                onClick={onSignOut}
                title="Sign Out"
                className="p-1.5 text-slate-300 hover:text-white hover:bg-[#2d5a4c] rounded-lg transition-colors ml-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden border-t border-[#2d5a4c]/60 bg-[#1e3a31] px-2 py-1.5 flex justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center py-1 px-2 text-[10px] uppercase font-bold tracking-wider rounded-lg ${
                isActive ? 'text-[#a8c69f]' : 'text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
