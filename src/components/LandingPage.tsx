import React, { useState } from 'react';
import {
  Leaf,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  Layers,
  HeartHandshake,
} from 'lucide-react';
import { signInWithGoogle, signInAsGuest } from '../lib/firebase';

interface LandingPageProps {
  onSignedIn: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSignedIn }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await signInWithGoogle();
      onSignedIn();
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      // If popup fails or closed by user, show actionable message
      setErrorMsg(
        err.message ||
          'Sign in with Google was not completed. You can also try the Sandbox Guest Mode below.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await signInAsGuest();
      onSignedIn();
    } catch (err: any) {
      console.error('Guest Sign-In Error:', err);
      setErrorMsg(err.message || 'Could not initialize guest session.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] flex flex-col justify-between text-slate-800 font-sans">
      {/* Top Header */}
      <header className="border-b border-[#2d5a4c]/50 bg-[#1e3a31] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#a8c69f] flex items-center justify-center text-[#1e3a31] shadow-xs">
              <div className="w-3.5 h-3.5 border-2 border-[#1e3a31] rounded-full"></div>
            </div>
            <span className="font-bold text-sm tracking-wider uppercase text-white">
              Plastic Consumption Tracker
            </span>
          </div>

          <button
            id="header-btn-login"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="text-xs font-bold uppercase tracking-wider text-[#a8c69f] hover:text-white px-3.5 py-1.5 rounded-lg border border-[#2d5a4c] hover:bg-[#2d5a4c] transition-colors"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Hero & Value Proposition */}
      <main className="max-w-5xl mx-auto px-4 py-12 sm:py-16 flex-1 flex flex-col justify-center items-center text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white border border-slate-200 text-[10px] font-bold uppercase tracking-wider text-[#2d5a4c] mb-6 shadow-xs">
          <Sparkles className="w-3 h-3 text-[#2d5a4c]" />
          <span>Powered by Gemini 3.6 Flash &amp; Cloud Firestore</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight max-w-3xl leading-[1.15]">
          Track, understand, and reduce your daily plastic footprint.
        </h1>

        <p className="mt-4 text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
          Log what you used or avoided in plain, natural sentences. Gemini categorizes your plastic items, suggests affordable, realistic alternatives, and guides your sustainability journey without judgment.
        </p>

        {/* Error notification if login issues */}
        {errorMsg && (
          <div className="mt-6 max-w-md w-full p-3.5 bg-white border border-[#fbd5d5] text-[#9b1c1c] rounded-xl text-xs flex items-center gap-2 text-left shadow-xs">
            <AlertCircle className="w-4 h-4 text-[#9b1c1c] shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md">
          <button
            id="btn-google-login"
            type="button"
            disabled={isLoading}
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-3 bg-[#2d5a4c] hover:bg-[#1e3a31] text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-xs transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>

          <button
            id="btn-guest-login"
            type="button"
            disabled={isLoading}
            onClick={handleGuestSignIn}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-lg border border-slate-200 transition-colors disabled:opacity-50 shadow-xs"
          >
            <span>Explore Sandbox Mode</span>
          </button>
        </div>

        {/* Key Features Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl text-left w-full">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#2d5a4c] border border-slate-200 flex items-center justify-center mb-3">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">Frictionless Journaling</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Record entries in seconds using natural language. Gemini extracts products, quantities, and conscious avoidances automatically.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#2d5a4c] border border-slate-200 flex items-center justify-center mb-3">
              <HeartHandshake className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">Realistic, Practical Swaps</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              No shaming or expensive gadgets. Get practical swaps considering affordability, durability, convenience, and reusability.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-[#f4f7f5] text-[#2d5a4c] border border-slate-200 flex items-center justify-center mb-3">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">Isolated &amp; Private</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              All journal entries and chats are saved under your private Firebase account with strict security rules. No other user can see your data.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Plastic Consumption Tracker &bull; Geometric Balance Theme &bull; Powered by Cloud Firestore &amp; Google Gemini
      </footer>
    </div>
  );
};
