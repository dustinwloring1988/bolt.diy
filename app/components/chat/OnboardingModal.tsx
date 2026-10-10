import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import Cookies from 'js-cookie';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { profileStore, updateProfile } from '~/lib/stores/profile';
import {
  providersStore,
  updateProviderSettings,
  updateWebSearchEnabled,
  updateWebSearchProvider,
  webSearchEnabledStore,
  updatePromptId,
  type WebSearchProvider,
} from '~/lib/stores/settings';
import type { IProviderConfig } from '~/types/model';
import { classNames } from '~/utils/classNames';
import { providerBaseUrlEnvKeys } from '~/utils/constants';

// ─── Constants ────────────────────────────────────────────────────────────────
const ONBOARDING_KEY = 'bolt_onboarding_complete';

// Cloud providers (non-local) worth surfacing in onboarding
const ONBOARDING_PROVIDERS = [
  'Anthropic',
  'OpenAI',
  'Google',
  'OpenRouter',
  'Groq',
  'Mistral',
  'Deepseek',
  'xAI',
  'Cohere',
  'Perplexity',
];

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  Anthropic: 'Claude models — state-of-the-art coding & reasoning',
  OpenAI: 'GPT-4o, o1 — industry standard multimodal models',
  Google: 'Gemini 2.5 Pro/Flash — large context, fast',
  OpenRouter: 'Access 200+ models via one key',
  Groq: 'Ultra-fast inference on Llama, Mixtral',
  Mistral: 'Efficient European models with function calling',
  Deepseek: 'High-quality open models, very affordable',
  xAI: 'Grok — strong reasoning, real-time data',
  Cohere: 'Command models with retrieval',
  Perplexity: 'Online models with web access built-in',
};

const CONNECTOR_LIST = [
  {
    id: 'supabase',
    name: 'Supabase',
    icon: 'i-ph:database',
    description: 'Postgres DB, Auth, Storage & Edge Functions',
    color: 'text-emerald-400',
    docsUrl: 'https://supabase.com/dashboard/account/tokens',
    docsLabel: 'Get token →',
    placeholder: 'sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    envKey: 'SUPABASE_ACCESS_TOKEN',
    storeKey: 'Supabase',
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'i-ph:github-logo',
    description: 'Clone repos, commit & create pull requests',
    color: 'text-bolt-elements-textPrimary',
    docsUrl: 'https://github.com/settings/tokens',
    docsLabel: 'Get token →',
    placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    envKey: 'GITHUB_TOKEN',
    storeKey: 'Github',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hasCompletedOnboarding(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

function markOnboardingComplete() {
  localStorage.setItem(ONBOARDING_KEY, 'true');
}

function getApiKeysFromCookie(): Record<string, string> {
  const raw = Cookies.get('apiKeys');

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ─── Step types ───────────────────────────────────────────────────────────────
type Step = 'welcome' | 'profile' | 'providers' | 'connectors' | 'search' | 'prompt' | 'done';

const STEPS: Step[] = ['welcome', 'profile', 'providers', 'connectors', 'search', 'prompt', 'done'];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Animated step wrapper */
const StepPane = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.22, ease: 'easeOut' }}
    className="flex flex-col gap-5"
  >
    {children}
  </motion.div>
);

/** Progress dots */
const StepDots = ({ current, total }: { current: number; total: number }) => (
  <div className="flex items-center justify-center gap-1.5 mt-1 mb-4">
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        className={classNames(
          'rounded-full transition-all duration-300',
          i === current
            ? 'w-5 h-1.5 bg-purple-500'
            : i < current
              ? 'w-1.5 h-1.5 bg-purple-500/40'
              : 'w-1.5 h-1.5 bg-bolt-elements-borderColor',
        )}
      />
    ))}
  </div>
);

/** Toggle card (used in connectors, search, etc.) */
const ToggleCard = ({
  icon,
  iconClass,
  title,
  description,
  badge,
  selected,
  onClick,
  children,
}: {
  icon: string;
  iconClass?: string;
  title: string;
  description: string;
  badge?: string;
  selected: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) => (
  <div
    className={classNames(
      'rounded-xl border transition-all duration-200 overflow-hidden',
      selected
        ? 'border-purple-500/50 bg-purple-500/5'
        : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
    )}
  >
    <button
      type="button"
      className="w-full flex items-center gap-3 p-3 text-left bg-transparent hover:bg-bolt-elements-background-depth-2 transition-colors"
      onClick={onClick}
    >
      <div
        className={classNames(
          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
          selected ? 'bg-purple-500/20' : 'bg-bolt-elements-background-depth-3',
        )}
      >
        <div
          className={classNames(
            icon,
            'text-lg',
            iconClass || (selected ? 'text-purple-400' : 'text-bolt-elements-textSecondary'),
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-bolt-elements-textPrimary">{title}</span>
          {badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium">
              {badge}
            </span>
          )}
        </div>
        <div className="text-xs text-bolt-elements-textSecondary mt-0.5 truncate">{description}</div>
      </div>
      <div
        className={classNames(
          'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
          selected ? 'border-purple-500 bg-purple-500' : 'border-bolt-elements-borderColor',
        )}
      >
        {selected && <div className="i-ph:check-bold text-[9px] text-white" />}
      </div>
    </button>
    {selected && children && (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="border-t border-purple-500/20 px-3 pb-3 pt-2"
      >
        {children}
      </motion.div>
    )}
  </div>
);

// ─── Main modal ───────────────────────────────────────────────────────────────

export function OnboardingModal() {
  const profile = useStore(profileStore);
  const allProviders = useStore(providersStore);

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('welcome');

  // Profile state
  const [username, setUsername] = useState('');

  // Provider state — local copy of enabled flags + api keys
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => getApiKeysFromCookie());

  const [enabledProviders, setEnabledProviders] = useState<Set<string>>(() => {
    const providers = providersStore.get();

    return new Set(
      Object.entries(providers)
        .filter(([, v]) => v.settings.enabled)
        .map(([k]) => k),
    );
  });

  // Connector token state
  const [connectorTokens, setConnectorTokens] = useState<Record<string, string>>({});

  // Search state
  const [enableSearch, setEnableSearch] = useState(() => webSearchEnabledStore.get());
  const [searchProvider, setSearchProvider] = useState<WebSearchProvider>('exa');

  // Prompt state
  const [selectedPromptId, setSelectedPromptId] = useState('default');

  const promptList = PromptLibrary.getList();

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasCompletedOnboarding() && !profile.username) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (step === 'profile' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [step]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const stepIndex = STEPS.indexOf(step);
  const totalVisible = STEPS.length - 1; // exclude 'done' from dots

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step);

    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
    }
  }, [step]);

  const goBack = useCallback(() => {
    const idx = STEPS.indexOf(step);

    if (idx > 0) {
      setStep(STEPS[idx - 1]);
    }
  }, [step]);

  const handleFinish = useCallback(() => {
    // Save username
    if (username.trim()) {
      updateProfile({ username: username.trim() });
    }

    // Save provider toggles + API keys
    const currentProviders = providersStore.get();
    Object.entries(currentProviders).forEach(([name, config]) => {
      const shouldEnable = enabledProviders.has(name);

      if (config.settings.enabled !== shouldEnable) {
        updateProviderSettings(name, { ...config.settings, enabled: shouldEnable } as any);
      }
    });

    // Save API keys to cookie, removing entries the user cleared.
    const updatedApiKeys = { ...getApiKeysFromCookie(), ...apiKeys };
    Object.entries(updatedApiKeys).forEach(([providerName, key]) => {
      if (!key.trim()) {
        delete updatedApiKeys[providerName];
      } else {
        updatedApiKeys[providerName] = key.trim();
      }
    });

    // Save connector tokens (stored as api keys)
    CONNECTOR_LIST.forEach((connector) => {
      const token = connectorTokens[connector.id];

      if (token?.trim()) {
        updatedApiKeys[connector.storeKey] = token.trim();
      }
    });

    Cookies.set('apiKeys', JSON.stringify(updatedApiKeys));

    // Save search settings
    updateWebSearchEnabled(enableSearch);
    updateWebSearchProvider(searchProvider);

    // Save prompt selection
    updatePromptId(selectedPromptId);

    markOnboardingComplete();
    setStep('done');
    setTimeout(() => setVisible(false), 1600);
  }, [username, enabledProviders, apiKeys, connectorTokens, enableSearch, searchProvider, selectedPromptId]);

  const handleSkip = useCallback(() => {
    markOnboardingComplete();
    setVisible(false);
  }, []);

  const toggleProvider = useCallback((name: string) => {
    setEnabledProviders((prev) => {
      const next = new Set(prev);

      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }

      return next;
    });
  }, []);

  if (!visible) {
    return null;
  }

  const onboardingProviders = ONBOARDING_PROVIDERS.filter((name) => allProviders[name]).map((name) => ({
    name,
    config: allProviders[name] as IProviderConfig,
    description: PROVIDER_DESCRIPTIONS[name] || '',
    apiTokenKey: providerBaseUrlEnvKeys[name]?.apiTokenKey,
  }));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          className={classNames(
            'relative z-10 w-full max-w-lg mx-4',
            'bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor',
            'rounded-2xl shadow-2xl overflow-hidden',
          )}
        >
          {/* Purple accent top bar */}
          <div className="h-0.5 w-full bg-gradient-to-r from-purple-600 via-purple-400 to-purple-600" />

          {/* Header — only on non-welcome, non-done steps */}
          {step !== 'welcome' && step !== 'done' && (
            <div className="flex items-center justify-between px-6 pt-5 pb-0">
              <button
                type="button"
                onClick={goBack}
                className="bg-transparent text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors flex items-center gap-1"
              >
                <div className="i-ph:arrow-left text-sm" />
                Back
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="bg-transparent text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
              >
                Skip all
              </button>
            </div>
          )}

          <div className="px-6 pb-6 pt-4 max-h-[85vh] overflow-y-auto">
            {/* Progress dots (skip on welcome/done) */}
            {step !== 'welcome' && step !== 'done' && <StepDots current={stepIndex - 1} total={totalVisible - 1} />}

            <AnimatePresence mode="wait">
              {/* ── WELCOME ─────────────────────────────────────────────────── */}
              {step === 'welcome' && (
                <StepPane key="welcome">
                  <div className="flex flex-col items-center text-center gap-5 py-4">
                    {/* Logo / Icon */}
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/30 to-purple-700/20 border border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-500/10">
                        <div className="i-ph:lightning-fill text-4xl text-purple-400" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-bolt-elements-background-depth-1 flex items-center justify-center">
                        <div className="i-ph:check-bold text-[9px] text-white" />
                      </div>
                    </div>

                    <div>
                      <h1 className="text-2xl font-bold text-bolt-elements-textPrimary tracking-tight">
                        Welcome to Bolt
                      </h1>
                      <p className="mt-2 text-sm text-bolt-elements-textSecondary leading-relaxed max-w-sm mx-auto">
                        Your AI-powered development environment. Let's configure everything in a few quick steps.
                      </p>
                    </div>

                    {/* Feature pills */}
                    <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                      {[
                        { icon: 'i-ph:lightning-fill', label: 'AI Coding' },
                        { icon: 'i-ph:plug', label: 'Connectors' },
                        { icon: 'i-ph:globe', label: 'Web Search' },
                        { icon: 'i-ph:terminal', label: 'Full Stack' },
                      ].map((pill) => (
                        <div
                          key={pill.label}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-xs text-bolt-elements-textSecondary"
                        >
                          <div className={classNames(pill.icon, 'text-purple-400')} />
                          {pill.label}
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 w-full mt-2">
                      <button
                        type="button"
                        onClick={goNext}
                        className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-purple-500 hover:bg-purple-600 text-white transition-colors shadow-lg shadow-purple-500/25"
                      >
                        Set up Bolt →
                      </button>
                      <button
                        type="button"
                        onClick={handleSkip}
                        className="w-full px-4 py-2 rounded-xl text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary transition-colors"
                      >
                        Skip and use defaults
                      </button>
                    </div>
                  </div>
                </StepPane>
              )}

              {/* ── PROFILE ─────────────────────────────────────────────────── */}
              {step === 'profile' && (
                <StepPane key="profile">
                  <div>
                    <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Your profile</h2>
                    <p className="text-xs text-bolt-elements-textSecondary mt-1">
                      Used to personalise the experience. Optional.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-1.5">
                        Name / username
                      </label>
                      <input
                        ref={inputRef}
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            goNext();
                          }
                        }}
                        placeholder="e.g. Alex"
                        className={classNames(
                          'w-full px-3.5 py-2.5 rounded-xl text-sm',
                          'border border-bolt-elements-borderColor',
                          'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary',
                          'placeholder-bolt-elements-textTertiary',
                          'focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/60',
                        )}
                      />
                    </div>
                  </div>
                  <NavButtons onBack={goBack} onNext={goNext} nextLabel="Continue" />
                </StepPane>
              )}

              {/* ── PROVIDERS ────────────────────────────────────────────────── */}
              {step === 'providers' && (
                <StepPane key="providers">
                  <div>
                    <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">AI Providers</h2>
                    <p className="text-xs text-bolt-elements-textSecondary mt-1">
                      Enable the providers you want to use and add their API keys. You can change this any time in
                      Settings.
                    </p>
                  </div>

                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
                    {onboardingProviders.map((p) => {
                      const isEnabled = enabledProviders.has(p.name);
                      const key = apiKeys[p.name] || '';
                      const hasKey = !!key.trim();
                      const keyLabel = p.apiTokenKey || `${p.name.toUpperCase().replace(/\s/g, '_')}_API_KEY`;

                      return (
                        <div
                          key={p.name}
                          className={classNames(
                            'rounded-xl border transition-all duration-200 overflow-hidden',
                            isEnabled
                              ? 'border-purple-500/40 bg-purple-500/5'
                              : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
                          )}
                        >
                          {/* Row */}
                          <div className="flex items-center gap-3 p-3">
                            <ProviderIcon name={p.name} enabled={isEnabled} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-bolt-elements-textPrimary">{p.name}</span>
                                {isEnabled && hasKey && (
                                  <span className="flex items-center gap-1 text-[10px] text-green-400">
                                    <div className="i-ph:check-circle-fill text-xs" />
                                    Key set
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-bolt-elements-textTertiary truncate">{p.description}</p>
                            </div>
                            {/* Toggle */}
                            <button
                              type="button"
                              onClick={() => toggleProvider(p.name)}
                              className={classNames(
                                'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
                                isEnabled ? 'bg-purple-500' : 'bg-bolt-elements-borderColor',
                              )}
                            >
                              <div
                                className={classNames(
                                  'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                                  isEnabled ? 'translate-x-4' : 'translate-x-0.5',
                                )}
                              />
                            </button>
                          </div>

                          {/* API key input — only when enabled */}
                          {isEnabled && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="border-t border-purple-500/20 px-3 pb-3 pt-2"
                            >
                              <label className="block text-[10px] font-medium text-bolt-elements-textTertiary mb-1.5 uppercase tracking-wide">
                                {keyLabel}
                              </label>
                              <div className="relative">
                                <input
                                  type="password"
                                  value={key}
                                  onChange={(e) => setApiKeys((prev) => ({ ...prev, [p.name]: e.target.value }))}
                                  placeholder={`sk-...`}
                                  className={classNames(
                                    'w-full pl-3 pr-9 py-2 rounded-lg text-xs font-mono',
                                    'border',
                                    hasKey
                                      ? 'border-green-500/40 bg-green-500/5 text-bolt-elements-textPrimary'
                                      : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
                                    'placeholder-bolt-elements-textTertiary',
                                    'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                                  )}
                                />
                                {hasKey && (
                                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 i-ph:check-circle-fill text-green-500 text-sm" />
                                )}
                              </div>
                              {p.config.getApiKeyLink && (
                                <a
                                  href={p.config.getApiKeyLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                                >
                                  Get API key <div className="i-ph:arrow-square-out text-xs" />
                                </a>
                              )}
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <NavButtons onBack={goBack} onNext={goNext} nextLabel="Continue" />
                </StepPane>
              )}

              {/* ── CONNECTORS ───────────────────────────────────────────────── */}
              {step === 'connectors' && (
                <StepPane key="connectors">
                  <div>
                    <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Connectors</h2>
                    <p className="text-xs text-bolt-elements-textSecondary mt-1">
                      Connect services to unlock database integration, version control, and more.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {CONNECTOR_LIST.map((connector) => {
                      const token = connectorTokens[connector.id] || '';
                      const hasToken = !!token.trim();

                      return (
                        <div
                          key={connector.id}
                          className={classNames(
                            'rounded-xl border transition-all duration-200 overflow-hidden',
                            hasToken
                              ? 'border-purple-500/40 bg-purple-500/5'
                              : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
                          )}
                        >
                          <div className="flex items-center gap-3 p-3">
                            <div
                              className={classNames(
                                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                                hasToken ? 'bg-purple-500/20' : 'bg-bolt-elements-background-depth-3',
                              )}
                            >
                              <div
                                className={classNames(
                                  connector.icon,
                                  'text-lg',
                                  hasToken ? 'text-purple-400' : connector.color,
                                )}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-bolt-elements-textPrimary">
                                  {connector.name}
                                </span>
                                {hasToken && (
                                  <span className="flex items-center gap-1 text-[10px] text-green-400">
                                    <div className="i-ph:check-circle-fill text-xs" />
                                    Connected
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-bolt-elements-textTertiary">{connector.description}</p>
                            </div>
                          </div>

                          {/* Token input */}
                          <div className="border-t border-bolt-elements-borderColor/50 px-3 pb-3 pt-2">
                            <label className="block text-[10px] font-medium text-bolt-elements-textTertiary mb-1.5 uppercase tracking-wide">
                              Personal Access Token
                            </label>
                            <div className="relative">
                              <input
                                type="password"
                                value={token}
                                onChange={(e) =>
                                  setConnectorTokens((prev) => ({ ...prev, [connector.id]: e.target.value }))
                                }
                                placeholder={connector.placeholder}
                                className={classNames(
                                  'w-full pl-3 pr-9 py-2 rounded-lg text-xs font-mono',
                                  'border',
                                  hasToken
                                    ? 'border-green-500/40 bg-green-500/5 text-bolt-elements-textPrimary'
                                    : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
                                  'placeholder-bolt-elements-textTertiary',
                                  'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
                                )}
                              />
                              {hasToken && (
                                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 i-ph:check-circle-fill text-green-500 text-sm" />
                              )}
                            </div>
                            <a
                              href={connector.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                            >
                              {connector.docsLabel} <div className="i-ph:arrow-square-out text-xs" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <NavButtons onBack={goBack} onNext={goNext} nextLabel="Continue" />
                </StepPane>
              )}

              {/* ── SEARCH ───────────────────────────────────────────────────── */}
              {step === 'search' && (
                <StepPane key="search">
                  <div>
                    <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Web Search</h2>
                    <p className="text-xs text-bolt-elements-textSecondary mt-1">
                      When enabled, the AI can search the web and browse pages as tool calls — no manual pasting needed.
                    </p>
                  </div>

                  <ToggleCard
                    icon="i-ph:globe"
                    title="Web Search & Browse"
                    description="AI can autonomously search + fetch page content"
                    badge="Beta"
                    selected={enableSearch}
                    onClick={() => setEnableSearch((v) => !v)}
                  >
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-2">
                          Search provider
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(
                            [
                              { id: 'exa', label: 'Exa', desc: 'AI-powered, free tier' },
                              { id: 'duckduckgo', label: 'DuckDuckGo', desc: 'Privacy-focused' },
                            ] as const
                          ).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSearchProvider(p.id)}
                              className={classNames(
                                'flex flex-col gap-0.5 p-2.5 rounded-lg border text-left transition-all',
                                searchProvider === p.id
                                  ? 'border-purple-500/50 bg-purple-500/10'
                                  : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-2',
                              )}
                            >
                              <span className="text-xs font-medium text-bolt-elements-textPrimary">{p.label}</span>
                              <span className="text-[10px] text-bolt-elements-textTertiary">{p.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </ToggleCard>

                  <NavButtons onBack={goBack} onNext={goNext} nextLabel="Continue" />
                </StepPane>
              )}

              {/* ── PROMPT ───────────────────────────────────────────────────── */}
              {step === 'prompt' && (
                <StepPane key="prompt">
                  <div>
                    <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">System prompt</h2>
                    <p className="text-xs text-bolt-elements-textSecondary mt-1">
                      Choose the AI personality and instruction style. You can change this in Settings → Features.
                    </p>
                  </div>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
                    {promptList.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPromptId(p.id)}
                        className={classNames(
                          'w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all',
                          selectedPromptId === p.id
                            ? 'border-purple-500/50 bg-purple-500/8'
                            : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
                        )}
                      >
                        <div
                          className={classNames(
                            'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all',
                            selectedPromptId === p.id
                              ? 'border-purple-500 bg-purple-500'
                              : 'border-bolt-elements-borderColor',
                          )}
                        >
                          {selectedPromptId === p.id && <div className="i-ph:check-bold text-[8px] text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-bolt-elements-textPrimary">{p.label}</span>
                            {p.id === 'default' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-bolt-elements-textTertiary mt-0.5">{p.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  <NavButtons onBack={goBack} onNext={handleFinish} nextLabel="Finish setup" nextPrimary />
                </StepPane>
              )}

              {/* ── DONE ─────────────────────────────────────────────────────── */}
              {step === 'done' && (
                <StepPane key="done">
                  <div className="flex flex-col items-center text-center gap-4 py-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                      className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center"
                    >
                      <div className="i-ph:check-bold text-3xl text-green-400" />
                    </motion.div>
                    <div>
                      <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">
                        {username ? `You're all set, ${username}!` : "You're all set!"}
                      </h2>
                      <p className="text-sm text-bolt-elements-textSecondary mt-1">
                        Bolt is ready. Start building something great.
                      </p>
                    </div>
                  </div>
                </StepPane>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function NavButtons({
  onBack,
  onNext,
  nextLabel = 'Next',
  nextPrimary = false,
  nextDisabled = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextPrimary?: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex gap-2.5 pt-1">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-colors"
        >
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className={classNames(
          'flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
          nextPrimary
            ? 'bg-purple-500 hover:bg-purple-600 text-white shadow-md shadow-purple-500/20 disabled:opacity-40'
            : 'bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-40',
          'disabled:cursor-not-allowed',
        )}
      >
        {nextLabel}
      </button>
    </div>
  );
}

/** Small provider icon with a fallback glyph */
function ProviderIcon({ name, enabled }: { name: string; enabled: boolean }) {
  const iconMap: Record<string, string> = {
    Anthropic: 'i-ph:lightning',
    OpenAI: 'i-ph:sparkle',
    Google: 'i-ph:star-four',
    OpenRouter: 'i-ph:infinity',
    Groq: 'i-ph:rocket-launch',
    Mistral: 'i-ph:magic-wand',
    Deepseek: 'i-ph:brain',
    xAI: 'i-ph:lightning-slash',
    Cohere: 'i-ph:circles-three',
    Perplexity: 'i-ph:compass',
  };

  const icon = iconMap[name] || 'i-ph:cube';

  return (
    <div
      className={classNames(
        'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
        enabled ? 'bg-purple-500/20' : 'bg-bolt-elements-background-depth-3',
      )}
    >
      <div className={classNames(icon, 'text-lg', enabled ? 'text-purple-400' : 'text-bolt-elements-textTertiary')} />
    </div>
  );
}
