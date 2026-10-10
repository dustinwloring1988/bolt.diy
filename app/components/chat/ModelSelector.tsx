import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import type { ProviderInfo } from '~/types/model';
import { classNames } from '~/utils/classNames';

const formatContextSize = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }

  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }

  return tokens.toString();
};

interface ModelSelectorProps {
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  modelList: ModelInfo[];
  providerList: ProviderInfo[];
  apiKeys: Record<string, string>;
  modelLoading?: 'all' | string[];
  onApiKeyChange?: (providerName: string, apiKey: string) => void;
}

// Helper to get provider icon
const getProviderIcon = (providerName: string): string => {
  const icons: Record<string, string> = {
    Anthropic: 'i-ph:lightning',
    OpenAI: 'i-ph:sparkle',
    Google: 'i-ph:star-four',
    OpenRouter: 'i-ph:infinity',
    Ollama: 'i-ph:cube',
    Groq: 'i-ph:rocket-launch',
    Deepseek: 'i-ph:brain',
    Mistral: 'i-ph:magic-wand',
    Cohere: 'i-ph:circles-three',
    xAI: 'i-ph:lightning-slash',
    LMStudio: 'i-ph:desktop',
    OpenAILike: 'i-ph:plugs-connected',
  };

  return icons[providerName] || 'i-ph:cube';
};

// Helper function to determine if a model is likely free
const isModelLikelyFree = (model: ModelInfo, providerName?: string): boolean => {
  if (providerName === 'OpenRouter' && model.label.includes('in:$0.00') && model.label.includes('out:$0.00')) {
    return true;
  }

  if (model.name.toLowerCase().includes('free') || model.label.toLowerCase().includes('free')) {
    return true;
  }

  return false;
};

export const ModelSelector = ({
  model,
  setModel,
  provider,
  setProvider,
  modelList,
  providerList,
  modelLoading,
  apiKeys,
  onApiKeyChange,
}: ModelSelectorProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(provider);
  const [focusedModelIndex, setFocusedModelIndex] = useState(-1);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelOptionsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [showFreeModelsOnly, setShowFreeModelsOnly] = useState(false);

  type ConnectionStatus = 'unknown' | 'connected' | 'disconnected';

  const [localProviderStatus, setLocalProviderStatus] = useState<Record<string, ConnectionStatus>>({});

  // Check connectivity of local providers
  useEffect(() => {
    const checkLocalProviders = async () => {
      const statuses: Record<string, 'connected' | 'disconnected'> = {};

      for (const p of providerList) {
        if (!LOCAL_PROVIDERS.includes(p.name)) {
          continue;
        }

        const hasModels = modelList.some((m) => m.provider === p.name);
        statuses[p.name] = hasModels ? 'connected' : 'disconnected';
      }

      setLocalProviderStatus(statuses);
    };

    checkLocalProviders();
  }, [providerList, modelList]);

  useEffect(() => {
    if (providerList.length > 0 && (!provider || !providerList.some((candidate) => candidate.name === provider.name))) {
      const fallback = providerList[0];
      setSelectedProvider(fallback);
      setProvider?.(fallback);

      const firstModel = modelList.find((candidate) => candidate.provider === fallback.name);

      if (firstModel) {
        setModel?.(firstModel.name);
      }

      return;
    }

    setSelectedProvider(provider);
  }, [provider, providerList, modelList, setProvider, setModel]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentModel = useMemo(() => {
    return modelList.find((m) => m.name === model);
  }, [modelList, model]);

  const filteredModels = useMemo(() => {
    const providerModels = modelList.filter((m) => m.provider === selectedProvider?.name);

    return providerModels
      .filter((m) => {
        if (showFreeModelsOnly && !isModelLikelyFree(m, selectedProvider?.name)) {
          return false;
        }

        if (!searchQuery) {
          return true;
        }

        const searchLower = searchQuery.toLowerCase();

        return (
          m.label.toLowerCase().includes(searchLower) ||
          m.name.toLowerCase().includes(searchLower) ||
          formatContextSize(m.maxTokenAllowed).toLowerCase().includes(searchLower)
        );
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [modelList, selectedProvider, searchQuery, showFreeModelsOnly]);

  const handleModelSelect = useCallback(
    (modelName: string) => {
      setModel?.(modelName);
      setProvider?.(selectedProvider!);
      setIsOpen(false);
      setSearchQuery('');
    },
    [setModel, setProvider, selectedProvider],
  );

  const handleProviderClick = useCallback((p: ProviderInfo) => {
    setSelectedProvider(p);
    setSearchQuery('');
    setFocusedModelIndex(-1);
    setShowApiKeyInput(false); // Reset API key input when switching providers
    setShowFreeModelsOnly(false);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      return;
    }

    if (e.target instanceof HTMLElement && e.target.closest('button')) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedModelIndex((prev) => (prev + 1 >= filteredModels.length ? 0 : prev + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedModelIndex((prev) => (prev - 1 < 0 ? filteredModels.length - 1 : prev - 1));
        break;
      case 'Enter':
        e.preventDefault();

        if (focusedModelIndex >= 0 && focusedModelIndex < filteredModels.length) {
          handleModelSelect(filteredModels[focusedModelIndex].name);
        }

        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        break;
    }
  };

  useEffect(() => {
    if (focusedModelIndex >= 0 && modelOptionsRef.current[focusedModelIndex]) {
      modelOptionsRef.current[focusedModelIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedModelIndex]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Measure the prompt box container so the dropdown spans its full width
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) {
      return undefined;
    }

    const button = dropdownRef.current;
    const promptBox = button.closest('.z-prompt') as HTMLElement | null;

    if (!promptBox) {
      return undefined;
    }

    const recalc = () => {
      const boxRect = promptBox.getBoundingClientRect();
      const btnRect = button.getBoundingClientRect();
      setDropdownStyle({
        left: boxRect.left - btnRect.left,
        width: boxRect.width,
      });
    };

    recalc();
    window.addEventListener('resize', recalc);

    return () => window.removeEventListener('resize', recalc);
  }, [isOpen]);

  if (providerList.length === 0) {
    return (
      <div className="mb-2 p-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-prompt-background text-bolt-elements-textPrimary">
        <p className="text-center">
          No providers are currently enabled. Please enable at least one provider in the settings to start using the
          chat.
        </p>
      </div>
    );
  }

  return (
    <div className="relative" onKeyDown={handleKeyDown} ref={dropdownRef}>
      {/* Compact Inline Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={classNames(
          'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs',
          'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault',
          'hover:bg-bolt-elements-item-backgroundActive hover:text-bolt-elements-item-contentActive',
          'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus focus:ring-offset-1',
          'transition-all',
          isOpen ? 'bg-bolt-elements-item-backgroundActive text-bolt-elements-item-contentActive' : undefined,
        )}
        title="Select model"
      >
        {provider && <div className={classNames(getProviderIcon(provider.name), 'text-sm opacity-70')} />}
        <span className="font-medium max-w-[130px] truncate">{currentModel?.label || 'Select model'}</span>
        <div className={classNames('i-ph:caret-down text-[10px] opacity-70', isOpen ? 'rotate-180' : undefined)} />
      </button>

      {/* Dropdown - anchored to the prompt box container edge-to-edge */}
      {isOpen && (
        <div
          className="absolute bottom-full mb-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl overflow-hidden z-50"
          style={{
            left: dropdownStyle.left,
            width: dropdownStyle.width || undefined,
          }}
        >
          <div className="flex h-[420px]">
            {/* Left Sidebar - Providers */}
            <div className="w-14 bg-bolt-elements-background-depth-3 border-r border-bolt-elements-borderColor flex flex-col">
              <div className="p-2 border-b border-bolt-elements-borderColor">
                <div className="text-[9px] font-semibold text-bolt-elements-textSecondary uppercase tracking-wider px-0.5 text-center">
                  Provider
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-1.5 space-y-0.5 px-1">
                {providerList.map((p) => {
                  const isSelected = p.name === selectedProvider?.name;
                  const isLocal = LOCAL_PROVIDERS.includes(p.name);
                  const status = isLocal ? localProviderStatus[p.name] : null;

                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handleProviderClick(p)}
                      title={p.name}
                      className={classNames(
                        'w-full p-2 flex items-center justify-center relative group rounded-md',
                        'hover:bg-bolt-elements-background-depth-1 transition-colors',
                        isSelected
                          ? 'bg-bolt-elements-background-depth-1 ring-2 ring-inset ring-accent-500'
                          : undefined,
                      )}
                    >
                      <div
                        className={classNames(
                          getProviderIcon(p.name),
                          'text-lg transition-colors',
                          isSelected
                            ? 'text-accent-400'
                            : 'text-bolt-elements-textTertiary group-hover:text-bolt-elements-textSecondary',
                        )}
                      />

                      {/* Connection status indicator */}
                      {status && (
                        <div
                          className={classNames(
                            'absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full',
                            status === 'connected' ? 'bg-green-500' : 'bg-red-400',
                          )}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Content - Models */}
            <div className="flex-1 flex flex-col min-w-0 bg-bolt-elements-background-depth-1">
              {/* Header */}
              <div className="p-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={classNames(getProviderIcon(selectedProvider?.name || ''), 'text-base text-accent-400')}
                    />
                    <div className="font-semibold text-sm text-bolt-elements-textPrimary">{selectedProvider?.name}</div>
                    <div className="text-xs text-bolt-elements-textTertiary bg-bolt-elements-background-depth-1 px-1.5 py-0.5 rounded">
                      {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Add API Key Button - Show only when provider needs key and input is not shown */}
                  {selectedProvider && !LOCAL_PROVIDERS.includes(selectedProvider.name) && !showApiKeyInput && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowApiKeyInput(true);
                        setTimeout(() => apiKeyInputRef.current?.focus(), 100);
                      }}
                      className={classNames(
                        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition-colors',
                        apiKeys[selectedProvider.name]
                          ? 'bg-green-500/15 text-green-400 border-green-500/40 hover:bg-green-500/20'
                          : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/20',
                      )}
                      title={apiKeys[selectedProvider.name] ? 'API key set' : 'Add API key'}
                    >
                      {apiKeys[selectedProvider.name] ? (
                        <>
                          <div className="i-ph:check-circle text-sm" />
                          <span>API Key Set</span>
                        </>
                      ) : (
                        <>
                          <div className="i-ph:warning text-sm" />
                          <span>Add API Key</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* API Key Input Field - Show only when button is clicked */}
                {selectedProvider && !LOCAL_PROVIDERS.includes(selectedProvider.name) && showApiKeyInput && (
                  <div className="mb-3">
                    <div className="relative">
                      <input
                        ref={apiKeyInputRef}
                        type="password"
                        value={apiKeys[selectedProvider.name] || ''}
                        onChange={(e) => {
                          e.stopPropagation();
                          onApiKeyChange?.(selectedProvider.name, e.target.value);
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation(); // Prevent keyboard shortcuts from triggering

                          if (e.key === 'Escape') {
                            setShowApiKeyInput(false);
                          } else if (e.key === 'Enter') {
                            setShowApiKeyInput(false);
                            searchInputRef.current?.focus();
                          }
                        }}
                        placeholder={`${selectedProvider.name} API Key`}
                        className={classNames(
                          'w-full pl-9 pr-20 py-2 rounded-md text-xs',
                          'bg-bolt-elements-background-depth-1 border',
                          apiKeys[selectedProvider.name]
                            ? 'border-green-500/40 text-bolt-elements-textPrimary'
                            : 'border-yellow-500/40 text-bolt-elements-textSecondary',
                          'placeholder:text-bolt-elements-textTertiary',
                          'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500',
                        )}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                        <span
                          className={classNames(
                            apiKeys[selectedProvider.name]
                              ? 'i-ph:check-circle text-green-500'
                              : 'i-ph:key text-yellow-500',
                          )}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowApiKeyInput(false);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs rounded hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary transition-colors"
                      >
                        Done
                      </button>
                    </div>
                    {!apiKeys[selectedProvider.name] && (
                      <div className="text-[10px] text-yellow-400 mt-1 flex items-center gap-1">
                        <span className="i-ph:warning text-xs" />
                        API key required to use this provider
                      </div>
                    )}
                  </div>
                )}

                {/* Search */}
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search models..."
                    className={classNames(
                      'w-full pl-9 pr-8 py-2 rounded-md text-sm',
                      'bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor',
                      'text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary',
                      'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500',
                    )}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <span className="i-ph:magnifying-glass text-bolt-elements-textSecondary" />
                  </div>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchQuery('');
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-bolt-elements-background-depth-2 transition-colors"
                    >
                      <span className="i-ph:x text-bolt-elements-textSecondary text-sm" />
                    </button>
                  )}
                </div>

                {/* Free filter for OpenRouter */}
                {selectedProvider?.name === 'OpenRouter' && (
                  <button
                    type="button"
                    onClick={() => setShowFreeModelsOnly(!showFreeModelsOnly)}
                    className={classNames(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium mt-2.5 transition-all border',
                      showFreeModelsOnly
                        ? 'bg-green-500/15 text-green-400 border-green-500/40 hover:bg-green-500/20'
                        : 'bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
                    )}
                  >
                    <span className="i-ph:gift text-sm" />
                    Free models only
                  </button>
                )}
              </div>

              {/* Models List */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
                {modelLoading === 'all' ||
                (Array.isArray(modelLoading)
                  ? modelLoading.includes(selectedProvider?.name ?? '')
                  : modelLoading === selectedProvider?.name) ? (
                  <div className="flex items-center justify-center h-full text-bolt-elements-textTertiary">
                    <div className="flex items-center gap-2">
                      <span className="i-ph:spinner animate-spin" />
                      Loading models...
                    </div>
                  </div>
                ) : filteredModels.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-bolt-elements-textSecondary text-sm px-4 text-center">
                    {searchQuery
                      ? `No models match "${searchQuery}"${showFreeModelsOnly ? ' (free only)' : ''}`
                      : showFreeModelsOnly
                        ? 'No free models available'
                        : 'No models available'}
                  </div>
                ) : (
                  <>
                    {filteredModels.map((m, index) => {
                      const isSelected = m.name === model;
                      const isFocused = focusedModelIndex === index;
                      const isFree = isModelLikelyFree(m, selectedProvider?.name);

                      return (
                        <div
                          key={m.name}
                          ref={(el) => {
                            modelOptionsRef.current[index] = el;
                          }}
                          onClick={() => handleModelSelect(m.name)}
                          className={classNames(
                            'p-2.5 rounded-lg cursor-pointer group transition-all',
                            'hover:bg-bolt-elements-background-depth-2',
                            isSelected
                              ? 'bg-accent-500/10 border border-accent-500/40 shadow-sm'
                              : 'border border-bolt-elements-borderColor hover:border-bolt-elements-borderColor',
                            isFocused ? 'ring-2 ring-accent-500/50' : undefined,
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <div
                                  className={classNames(
                                    'text-sm font-medium truncate',
                                    isSelected
                                      ? 'text-accent-300'
                                      : 'text-bolt-elements-textPrimary group-hover:text-bolt-elements-textPrimary',
                                  )}
                                >
                                  {m.label}
                                </div>
                                {isFree && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[10px] font-semibold shrink-0 border border-green-500/30">
                                    FREE
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-bolt-elements-textSecondary truncate">
                                {formatContextSize(m.maxTokenAllowed)} tokens
                              </div>
                            </div>
                            {isSelected && <div className="i-ph:check-circle-fill text-accent-400 text-lg shrink-0" />}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
