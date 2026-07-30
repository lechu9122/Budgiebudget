import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdvice } from '../services/api';

export type NavPage = 'dashboard' | 'csv-import' | 'reports' | 'profile';

const ROUTES: Record<NavPage, string> = {
  dashboard: '/dashboard',
  'csv-import': '/csv-import',
  reports: '/reports',
  profile: '/profile',
};

interface MainLayoutProps {
  children: ReactNode;
  username?: string;
  onLogout?: () => void;
}

type ChatMessage = {
  id: number;
  role: 'assistant' | 'user';
  content: string;
};

const MainLayout: React.FC<MainLayoutProps> = ({ children, username, onLogout }) => {
  const navigate = useNavigate();
  const goTo = (page: NavPage) => navigate(ROUTES[page]);
  const [isAdvisorOpen, setIsAdvisorOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: Date.now(),
      role: 'assistant',
      content: 'Hi. I am your budget advisor. Tell me what you want help with.',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  // Get initials for avatar
  const getInitials = () => {
    if (!username) return '?';
    const parts = username.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return username[0].toUpperCase();
  };

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setSending(true);

    try {
      const result = await getAdvice();
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: result.advice,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: 'I could not fetch advice right now. Please try again.',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleDraftKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-[60] border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo - Left (click to go home) */}
          <button
            type="button"
            onClick={() => goTo('dashboard')}
            className="flex items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-gray-50"
            title="Go to dashboard"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-50 via-white to-primary-100">
              <span className="text-2xl">🦜</span>
            </div>
            <span className="text-xl font-bold text-gray-900">BudgieBudget</span>
          </button>

          {/* User Avatar with Dropdown - Right */}
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-white font-semibold text-sm hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
              title={username || 'User Profile'}
            >
              {getInitials()}
            </button>

            {/* Dropdown Menu */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    goTo('profile');
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Profile
                </button>
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    goTo('csv-import');
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  CSV Import
                </button>
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    goTo('reports');
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Financial Reports
                </button>
                <hr className="my-1 border-gray-200" />
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    onLogout?.();
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                >
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex w-full transition-all duration-300">
        <div
          className={`transition-all duration-300 ${
            isAdvisorOpen ? 'w-[70%]' : 'w-full'
          }`}
        >
          {children}
        </div>

        {isAdvisorOpen && (
          <aside className="h-[calc(100vh-4rem)] w-[30%] border-l border-gray-200 bg-white shadow-xl transition-all duration-300">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-800">AI Advisor Chat</h2>
                <button
                  type="button"
                  onClick={() => setIsAdvisorOpen(false)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                >
                  Close
                </button>
              </div>

              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                        message.role === 'user'
                          ? 'ml-auto bg-primary-600 text-white'
                          : 'mr-auto bg-gray-100 text-gray-700'
                      }`}
                    >
                      {message.content}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleDraftKeyDown}
                    placeholder="Type a message..."
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* AI Advisor Toggle Button */}
      <button
        type="button"
        onClick={() => setIsAdvisorOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-50 rounded-full bg-primary-600 p-4 text-white shadow-lg transition-all duration-300 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
        aria-label={isAdvisorOpen ? 'Close AI advisor panel' : 'Open AI advisor panel'}
      >
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  );
};

export default MainLayout;
