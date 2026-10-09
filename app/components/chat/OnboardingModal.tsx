import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { profileStore, updateProfile } from '~/lib/stores/profile';
import { updateWebSearchEnabled } from '~/lib/stores/settings';
import { classNames } from '~/utils/classNames';

const ONBOARDING_KEY = 'bolt_onboarding_complete';

function hasCompletedOnboarding(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

function markOnboardingComplete() {
  localStorage.setItem(ONBOARDING_KEY, 'true');
}

export function OnboardingModal() {
  const profile = useStore(profileStore);
  const [visible, setVisible] = useState(false);
  const [username, setUsername] = useState('');
  const [enableSearch, setEnableSearch] = useState(false);
  const [step, setStep] = useState<'welcome' | 'name' | 'features'>('welcome');

  useEffect(() => {
    // Show the modal only once, when profile has no username and onboarding hasn't been completed
    if (!hasCompletedOnboarding() && !profile.username) {
      setVisible(true);
    }
  }, []);

  const handleFinish = () => {
    if (username.trim()) {
      updateProfile({ username: username.trim() });
    }

    if (enableSearch) {
      updateWebSearchEnabled(true);
    }

    markOnboardingComplete();
    setVisible(false);
  };

  const handleSkip = () => {
    markOnboardingComplete();
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleSkip}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={classNames(
            'relative z-10 w-full max-w-md mx-4',
            'bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor',
            'rounded-2xl shadow-2xl overflow-hidden',
          )}
        >
          {/* Purple accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-purple-500 to-purple-400" />

          <div className="p-8">
            {step === 'welcome' && (
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-full bg-purple-500/15 flex items-center justify-center">
                  <div className="i-ph:lightning-fill text-3xl text-purple-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-bolt-elements-textPrimary">Welcome to Bolt</h2>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                    Your AI-powered development environment. Let's get you set up in a few quick steps.
                  </p>
                </div>
                <div className="flex gap-3 mt-2 w-full">
                  <button
                    onClick={handleSkip}
                    className={classNames(
                      'flex-1 px-4 py-2 rounded-lg text-sm',
                      'border border-bolt-elements-borderColor',
                      'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                      'hover:bg-bolt-elements-background-depth-2 transition-colors',
                    )}
                  >
                    Skip setup
                  </button>
                  <button
                    onClick={() => setStep('name')}
                    className={classNames(
                      'flex-1 px-4 py-2 rounded-lg text-sm font-medium',
                      'bg-purple-500 hover:bg-purple-600 text-white transition-colors',
                    )}
                  >
                    Get started
                  </button>
                </div>
              </div>
            )}

            {step === 'name' && (
              <div className="flex flex-col gap-5">
                <div>
                  <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">What should we call you?</h2>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                    Your name appears in the sidebar and helps personalize the experience.
                  </p>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && username.trim()) {
                      setStep('features');
                    }
                  }}
                  placeholder="Your name or username"
                  autoFocus
                  className={classNames(
                    'w-full px-4 py-2.5 rounded-lg text-sm',
                    'border border-bolt-elements-borderColor',
                    'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary',
                    'placeholder-bolt-elements-textTertiary',
                    'focus:outline-none focus:ring-2 focus:ring-purple-500/40',
                  )}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('welcome')}
                    className={classNames(
                      'flex-1 px-4 py-2 rounded-lg text-sm',
                      'border border-bolt-elements-borderColor',
                      'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                      'hover:bg-bolt-elements-background-depth-2 transition-colors',
                    )}
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep('features')}
                    disabled={!username.trim()}
                    className={classNames(
                      'flex-1 px-4 py-2 rounded-lg text-sm font-medium',
                      'bg-purple-500 hover:bg-purple-600 text-white transition-colors',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {step === 'features' && (
              <div className="flex flex-col gap-5">
                <div>
                  <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">Enable web search?</h2>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                    When enabled, the AI can search DuckDuckGo and browse web pages as tool calls — without you needing
                    to manually paste URLs.
                  </p>
                </div>

                <button
                  onClick={() => setEnableSearch(!enableSearch)}
                  className={classNames(
                    'w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left',
                    enableSearch
                      ? 'border-purple-500/60 bg-purple-500/8'
                      : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
                  )}
                >
                  <div
                    className={classNames(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      enableSearch ? 'bg-purple-500/20' : 'bg-bolt-elements-background-depth-3',
                    )}
                  >
                    <div
                      className={classNames(
                        'i-ph:globe text-xl',
                        enableSearch ? 'text-purple-400' : 'text-bolt-elements-textSecondary',
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-bolt-elements-textPrimary">
                      Web Search &amp; Browse
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">Beta</span>
                    </div>
                    <div className="text-xs text-bolt-elements-textSecondary mt-0.5">
                      DuckDuckGo search + page content fetching as AI tool calls
                    </div>
                  </div>
                  <div
                    className={classNames(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                      enableSearch ? 'border-purple-500 bg-purple-500' : 'border-bolt-elements-borderColor',
                    )}
                  >
                    {enableSearch && <div className="i-ph:check-bold text-xs text-white" />}
                  </div>
                </button>

                <p className="text-xs text-bolt-elements-textTertiary">
                  You can change this anytime in Settings → Features.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('name')}
                    className={classNames(
                      'flex-1 px-4 py-2 rounded-lg text-sm',
                      'border border-bolt-elements-borderColor',
                      'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                      'hover:bg-bolt-elements-background-depth-2 transition-colors',
                    )}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleFinish}
                    className={classNames(
                      'flex-1 px-4 py-2 rounded-lg text-sm font-medium',
                      'bg-purple-500 hover:bg-purple-600 text-white transition-colors',
                    )}
                  >
                    Finish setup
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
