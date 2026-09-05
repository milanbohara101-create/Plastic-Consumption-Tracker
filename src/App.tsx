import React, { useState, useEffect, useMemo } from 'react';
import type { User } from 'firebase/auth';
import { subscribeToAuth, logOut, fetchJournalEntries, deleteJournalEntry } from './lib/firebase';
import type { JournalEntry } from './types';
import { LandingPage } from './components/LandingPage';
import { Navbar } from './components/Navbar';
import { JournalSection } from './components/JournalSection';
import { CompanionChat } from './components/CompanionChat';
import { AnalyticsSection } from './components/AnalyticsSection';
import { InsightsSection } from './components/InsightsSection';
import { HistorySection } from './components/HistorySection';
import { ImpactWallSection } from './components/ImpactWallSection';
import { PlasticScannerSection } from './components/PlasticScannerSection';
import { QuickAddModal } from './components/QuickAddModal';
import { RefreshCw } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('journal');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [chatInitialPrompt, setChatInitialPrompt] = useState<string>('');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);

  // Subscribe to Firebase Auth
  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch entries from Firestore whenever user logs in
  useEffect(() => {
    if (!user) {
      setEntries([]);
      return;
    }

    let isMounted = true;
    async function loadData() {
      setDataLoading(true);
      try {
        const userEntries = await fetchJournalEntries(user.uid);
        if (isMounted) {
          setEntries(userEntries);
        }
      } catch (err: any) {
        console.error('Error fetching journal entries from Firestore:', err);
        if (isMounted) {
          setNotification({
            type: 'error',
            message: `Could not load your journal records: ${err.message}`,
          });
        }
      } finally {
        if (isMounted) setDataLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Compute avoided items count
  const avoidedCount = useMemo(() => {
    return entries.reduce((total, entry) => {
      return total + (entry.items || []).filter((i) => i.action === 'avoided').length;
    }, 0);
  }, [entries]);

  // Historical context string for Gemini prompt
  const historicalContext = useMemo(() => {
    if (entries.length === 0) return '';
    return entries
      .slice(0, 5)
      .map(
        (e) =>
          `[Date: ${e.date}] Items: ${e.items.map((i) => `${i.action} ${i.name}`).join(', ')}`
      )
      .join('\n');
  }, [entries]);

  const handleEntrySaved = (newEntry: JournalEntry) => {
    setEntries((prev) => [newEntry, ...prev.filter((e) => e.id !== newEntry.id)]);
    setNotification({
      type: 'success',
      message: 'Journal entry & Gemini recommendations saved to your private database.',
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!user) return;
    try {
      await deleteJournalEntry(user.uid, entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setNotification({
        type: 'success',
        message: 'Journal entry removed.',
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: `Failed to delete entry: ${err.message}`,
      });
    }
  };

  const handleSignOut = async () => {
    try {
      await logOut();
      setUser(null);
      setActiveTab('journal');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-[#2d5a4c] animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-600">Initializing Plastic Consumption Tracker...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage onSignedIn={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-slate-800 flex flex-col font-sans">
      {/* Navigation Header */}
      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSignOut={handleSignOut}
        avoidedCount={avoidedCount}
        onOpenQuickAdd={() => setIsQuickAddOpen(true)}
      />

      {/* Global Notifications */}
      {notification && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 w-full">
          <div
            className={`p-3.5 rounded-xl text-xs font-semibold border flex items-center justify-between shadow-xs ${
              notification.type === 'success'
                ? 'bg-white text-[#1e3a31] border-[#2d5a4c]/30 shadow-xs'
                : 'bg-white text-[#9b1c1c] border-[#fbd5d5] shadow-xs'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-[#2d5a4c]' : 'bg-[#9b1c1c]'}`} />
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-slate-600 ml-2"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Quick Add Modal */}
      {isQuickAddOpen && user && (
        <QuickAddModal
          isOpen={isQuickAddOpen}
          user={user}
          onClose={() => setIsQuickAddOpen(false)}
          onEntrySaved={handleEntrySaved}
          onShowNotification={setNotification}
        />
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {dataLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <RefreshCw className="w-4 h-4 animate-spin mr-2 text-[#2d5a4c]" />
            <span>Loading your private records from Firestore...</span>
          </div>
        ) : (
          <>
            {activeTab === 'journal' && (
              <JournalSection
                user={user}
                onEntrySaved={handleEntrySaved}
                historicalContext={historicalContext}
                onOpenImpactWall={() => setActiveTab('impact')}
                onOpenScanner={() => setActiveTab('scanner')}
                onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                avoidedCount={avoidedCount}
              />
            )}

            {activeTab === 'scanner' && (
              <PlasticScannerSection
                user={user}
                onEntrySaved={handleEntrySaved}
                onFindAlternative={(prompt) => {
                  setChatInitialPrompt(prompt);
                  setActiveTab('chat');
                }}
                onNavigateToJournal={() => setActiveTab('journal')}
              />
            )}

            {activeTab === 'impact' && (
              <ImpactWallSection user={user} entries={entries} />
            )}

            {activeTab === 'chat' && (
              <CompanionChat
                user={user}
                recentEntries={entries}
                avoidedCount={avoidedCount}
                initialPrompt={chatInitialPrompt}
                onClearInitialPrompt={() => setChatInitialPrompt('')}
              />
            )}

            {activeTab === 'analytics' && <AnalyticsSection entries={entries} />}

            {activeTab === 'insights' && <InsightsSection user={user} entries={entries} />}

            {activeTab === 'history' && (
              <HistorySection entries={entries} onDeleteEntry={handleDeleteEntry} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
