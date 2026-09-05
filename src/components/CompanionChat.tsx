import React, { useState, useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import {
  Send,
  Bot,
  User as UserIcon,
  Sparkles,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Clock,
} from 'lucide-react';
import type { ChatMessage, JournalEntry } from '../types';
import { saveChatMessage, fetchChatMessages } from '../lib/firebase';

interface CompanionChatProps {
  user: User;
  recentEntries: JournalEntry[];
  avoidedCount: number;
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
}

const QUICK_QUESTIONS = [
  'What could I have done differently today?',
  "What's a cheaper alternative to plastic bottled water?",
  'How do I reduce plastic when ordering restaurant takeout?',
  'How can I keep fruits and greens fresh without plastic wrap?',
];

export const CompanionChat: React.FC<CompanionChatProps> = ({
  user,
  recentEntries,
  avoidedCount,
  initialPrompt,
  onClearInitialPrompt,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Handle incoming initial prompt from Scanner or other sections
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      setInputText(initialPrompt);
      if (onClearInitialPrompt) {
        onClearInitialPrompt();
      }
    }
  }, [initialPrompt, onClearInitialPrompt]);

  // Load chat history from Firestore on mount
  useEffect(() => {
    let mounted = true;
    async function loadHistory() {
      try {
        const saved = await fetchChatMessages(user.uid);
        if (mounted) {
          if (saved.length > 0) {
            setMessages(saved);
          } else {
            // Friendly default greeting
            const initialGreeting: ChatMessage = {
              id: 'init-msg',
              role: 'model',
              content:
                "Hello! I'm Sprout, your sustainability companion. Whether you want realistic alternatives to everyday plastics, advice on shopping routines, or reflections on your progress, I'm here to support you without any judgment. How can I help you today?",
              timestamp: Date.now(),
            };
            setMessages([initialGreeting]);
          }
        }
      } catch (err) {
        console.error('Failed to load chat messages:', err);
      }
    }
    loadHistory();
    return () => {
      mounted = false;
    };
  }, [user.uid]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    setErrorMsg(null);
    setInputText('');

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    // Persist user message to Firestore
    try {
      await saveChatMessage(user.uid, userMessage);
    } catch (saveErr) {
      console.warn('Could not persist user message:', saveErr);
    }

    try {
      // Build user context from recent journal entries
      const recentItemsNames = recentEntries
        .slice(0, 5)
        .flatMap((e) => e.items.map((i) => `${i.action} ${i.name}`))
        .slice(0, 10)
        .join(', ');

      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          userContext: {
            summary: `User has recorded ${recentEntries.length} entries.`,
            recentItems: recentItemsNames || 'No items recorded yet.',
            avoidedCount,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${response.status}`);
      }

      const res = await response.json();
      const replyText = res.reply || "I'm here to support your plastic reduction journey!";

      const modelMessage: ChatMessage = {
        id: `msg-${Date.now()}-model`,
        role: 'model',
        content: replyText,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, modelMessage]);

      // Persist model message to Firestore
      await saveChatMessage(user.uid, modelMessage);
    } catch (err: any) {
      console.error('Chat error:', err);
      setErrorMsg(err.message || 'Failed to get a response from Gemini. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-11rem)] min-h-[560px] bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Main Conversation Column */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200">
        {/* Chat Header */}
        <div className="bg-[#1e3a31] text-white px-6 py-4 flex items-center justify-between border-b border-[#2d5a4c]/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#a8c69f] flex items-center justify-center text-[#1e3a31] shadow-xs">
              <div className="w-3.5 h-3.5 border-2 border-[#1e3a31] rounded-full"></div>
            </div>
            <div>
              <h2 className="font-bold text-xs uppercase tracking-wider text-white flex items-center gap-2">
                <span>Sprout &bull; Sustainability Coach</span>
                <span className="text-[10px] bg-[#2d5a4c] text-[#a8c69f] px-2 py-0.5 rounded font-semibold">
                  Gemini 3.6 Flash
                </span>
              </h2>
              <p className="text-[11px] text-slate-300">
                Supportive, non-judgmental guidance tailored to your habits
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#a8c69f] bg-[#172e27] px-2.5 py-1 rounded border border-[#2d5a4c]/40">
            <Sparkles className="w-3 h-3 text-[#a8c69f]" />
            <span>Context-Aware</span>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 max-w-2xl ${
                  isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                    isUser
                      ? 'bg-[#2d5a4c] text-white'
                      : 'bg-white border border-slate-200 text-[#1e3a31]'
                  }`}
                >
                  {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>

                <div
                  className={`p-3.5 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-[#2d5a4c] text-white rounded-2xl rounded-tr-none max-w-[85%] shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-tl-none max-w-[85%] shadow-xs'
                  }`}
                >
                  <div className="whitespace-pre-line leading-relaxed">{msg.content}</div>
                  <div
                    className={`text-[9px] font-medium mt-1.5 flex items-center gap-1 uppercase tracking-wider ${
                      isUser ? 'text-[#a8c69f] justify-end' : 'text-slate-400'
                    }`}
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 text-slate-600 text-xs p-2.5 bg-white rounded-xl max-w-xs border border-slate-200 shadow-xs">
              <RefreshCw className="w-3 h-3 animate-spin text-[#2d5a4c]" />
              <span className="font-medium text-[11px] uppercase tracking-wider">Sprout is thinking...</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Error alert */}
        {errorMsg && (
          <div className="px-4 py-2 bg-white border-t border-[#fbd5d5] text-[#9b1c1c] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#9b1c1c] shrink-0" />
            <span className="flex-1 font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Suggested Questions Pills */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none shrink-0">
          <span className="text-slate-400 flex items-center gap-1 shrink-0 text-[10px] font-bold uppercase tracking-wider">
            <HelpCircle className="w-3 h-3 text-[#2d5a4c]" />
            <span>Prompt:</span>
          </span>
          {QUICK_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => handleSendMessage(q)}
              className="shrink-0 bg-white hover:bg-slate-100 text-slate-700 px-3 py-1 rounded-lg border border-slate-200 text-xs font-medium transition-colors whitespace-nowrap"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Chat Input Field */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            id="chat-input-text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask Gemini about habits, alternatives, or recipes..."
            disabled={isLoading}
            className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2d5a4c]/20 focus:border-[#2d5a4c] transition-colors"
          />
          <button
            type="submit"
            id="btn-chat-send"
            disabled={isLoading || !inputText.trim()}
            className="px-4 py-2.5 bg-[#2d5a4c] hover:bg-[#1e3a31] disabled:opacity-50 text-white rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>

      {/* Geometric Recommendations Sidebar */}
      <div className="hidden lg:block w-80 bg-slate-50 p-6 overflow-y-auto shrink-0 border-l border-slate-200">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          Smart Recommendations
        </h3>
        <div className="space-y-3">
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
            <p className="text-[10px] font-bold text-[#e8c46c] uppercase tracking-wider mb-1">
              FOR ON-THE-GO
            </p>
            <p className="text-xs font-bold text-slate-800 mb-1">Stainless Steel Insulated Flask</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Eliminates single-use PET bottles. Keeps drinks cold 24h and pays for itself within weeks.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
            <p className="text-[10px] font-bold text-[#2d5a4c] uppercase tracking-wider mb-1">
              FOR GROCERIES
            </p>
            <p className="text-xs font-bold text-slate-800 mb-1">Organic Cotton Mesh Produce Bags</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Breathable, washable alternative to thin LDPE roll bags. Keeps produce fresh longer.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
            <p className="text-[10px] font-bold text-[#2d5a4c] uppercase tracking-wider mb-1">
              FOR MEAL PREP
            </p>
            <p className="text-xs font-bold text-slate-800 mb-1">Borosilicate Glass Food Containers</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Microwave and oven safe with snap lock lids. Replaces stained takeout plastic tubs.
            </p>
          </div>

          <div className="bg-[#2d5a4c] p-4 rounded-xl text-white shadow-xs mt-4">
            <p className="text-[10px] uppercase font-bold text-[#a8c69f] mb-1">Impact Offset</p>
            <p className="text-xl font-bold">{avoidedCount} Items Avoided</p>
            <p className="text-[11px] text-slate-200 mt-1 leading-tight">
              Every avoided item is logged safely in your Firestore account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
