import { useStore } from '@nanostores/react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { useState, useEffect, useMemo } from 'react';
import { AvatarDropdown } from './AvatarDropdown';
import { TAB_LABELS, DEFAULT_TAB_CONFIG, TAB_DESCRIPTIONS, TAB_ICONS } from './constants';
import type { TabType, Profile } from './types';
import { TabTile } from '~/components/@settings/shared/components/TabTile';

// Import all tab components
import ConnectorsTab from '~/components/@settings/tabs/connectors/ConnectorsTab';
import { DataTab } from '~/components/@settings/tabs/data/DataTab';
import { EventLogsTab } from '~/components/@settings/tabs/event-logs/EventLogsTab';
import FeaturesTab from '~/components/@settings/tabs/features/FeaturesTab';
import GitHubTab from '~/components/@settings/tabs/github/GitHubTab';
import GitLabTab from '~/components/@settings/tabs/gitlab/GitLabTab';
import McpTab from '~/components/@settings/tabs/mcp/McpTab';
import NetlifyTab from '~/components/@settings/tabs/netlify/NetlifyTab';
import NotificationsTab from '~/components/@settings/tabs/notifications/NotificationsTab';
import ProfileTab from '~/components/@settings/tabs/profile/ProfileTab';
import CloudProvidersTab from '~/components/@settings/tabs/providers/cloud/CloudProvidersTab';
import LocalProvidersTab from '~/components/@settings/tabs/providers/local/LocalProvidersTab';
import SettingsTab from '~/components/@settings/tabs/settings/SettingsTab';
import SupabaseTab from '~/components/@settings/tabs/supabase/SupabaseTab';
import VercelTab from '~/components/@settings/tabs/vercel/VercelTab';
import { DialogTitle } from '~/components/ui/Dialog';
import { useConnectionStatus } from '~/lib/hooks/useConnectionStatus';
import { useFeatures } from '~/lib/hooks/useFeatures';
import { useNotifications } from '~/lib/hooks/useNotifications';
import { profileStore } from '~/lib/stores/profile';
import { tabConfigurationStore, resetTabConfiguration } from '~/lib/stores/settings';
import { classNames } from '~/utils/classNames';

interface ControlPanelProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabType;
}

// Beta status for experimental features
const BETA_TABS = new Set<TabType>(['local-providers', 'mcp']);

const BetaLabel = () => (
  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-purple-500/10 dark:bg-purple-500/20">
    <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">BETA</span>
  </div>
);

export const ControlPanel = ({ open, onClose, initialTab }: ControlPanelProps) => {
  // State
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);

  // Store values
  const tabConfiguration = useStore(tabConfigurationStore);
  const profile = useStore(profileStore) as Profile;

  // Status hooks
  const { hasNewFeatures, unviewedFeatures, acknowledgeAllFeatures } = useFeatures();
  const { hasUnreadNotifications, unreadNotifications, markAllAsRead } = useNotifications();
  const { hasConnectionIssues, currentIssue, acknowledgeIssue } = useConnectionStatus();

  // Memoize the base tab configurations to avoid recalculation
  const baseTabConfig = useMemo(() => {
    return new Map(DEFAULT_TAB_CONFIG.map((tab) => [tab.id, tab]));
  }, []);

  // Add visibleTabs logic using useMemo with optimized calculations
  const visibleTabs = useMemo(() => {
    if (!tabConfiguration?.userTabs || !Array.isArray(tabConfiguration.userTabs)) {
      console.warn('Invalid tab configuration, resetting to defaults');
      resetTabConfiguration();

      return [];
    }

    const notificationsDisabled = profile?.preferences?.notifications === false;

    // Optimize user mode tab filtering
    return tabConfiguration.userTabs
      .filter((tab) => {
        if (!tab?.id) {
          return false;
        }

        if (tab.id === 'notifications' && notificationsDisabled) {
          return false;
        }

        return tab.visible && tab.window === 'user';
      })
      .sort((a, b) => a.order - b.order);
  }, [tabConfiguration, profile?.preferences?.notifications, baseTabConfig]);

  // Reset to default view when modal opens/closes
  useEffect(() => {
    if (!open) {
      // Reset when closing
      setActiveTab(null);
      setLoadingTab(null);
    } else {
      // When opening, set initial tab if provided
      if (initialTab) {
        setActiveTab(initialTab);
        setLoadingTab(null);
      } else {
        setActiveTab(null);
      }
    }
  }, [open, initialTab]);

  // Handle closing
  const handleClose = () => {
    setActiveTab(null);
    setLoadingTab(null);
    onClose();
  };

  const getTabComponent = (tabId: TabType) => {
    switch (tabId) {
      case 'profile':
        return <ProfileTab />;
      case 'settings':
        return <SettingsTab />;
      case 'notifications':
        return <NotificationsTab />;
      case 'features':
        return <FeaturesTab />;
      case 'data':
        return <DataTab />;
      case 'cloud-providers':
        return <CloudProvidersTab />;
      case 'local-providers':
        return <LocalProvidersTab />;
      case 'connectors':
        return <ConnectorsTab />;
      case 'github':
        return <GitHubTab />;
      case 'gitlab':
        return <GitLabTab />;
      case 'supabase':
        return <SupabaseTab />;
      case 'vercel':
        return <VercelTab />;
      case 'netlify':
        return <NetlifyTab />;
      case 'event-logs':
        return <EventLogsTab />;
      case 'mcp':
        return <McpTab />;

      default:
        return null;
    }
  };

  const getTabUpdateStatus = (tabId: TabType): boolean => {
    switch (tabId) {
      case 'features':
        return hasNewFeatures;
      case 'notifications':
        return hasUnreadNotifications;
      case 'connectors':
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        return hasConnectionIssues;
      default:
        return false;
    }
  };

  const getStatusMessage = (tabId: TabType): string => {
    switch (tabId) {
      case 'features':
        return `${unviewedFeatures.length} new feature${unviewedFeatures.length === 1 ? '' : 's'} to explore`;
      case 'notifications':
        return `${unreadNotifications.length} unread notification${unreadNotifications.length === 1 ? '' : 's'}`;
      case 'connectors':
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        return currentIssue === 'disconnected'
          ? 'Connection lost'
          : currentIssue === 'high-latency'
            ? 'High latency detected'
            : 'Connection issues detected';
      default:
        return '';
    }
  };

  const handleTabClick = (tabId: TabType) => {
    setLoadingTab(tabId);
    setActiveTab(tabId);

    // Acknowledge notifications based on tab
    switch (tabId) {
      case 'features':
        acknowledgeAllFeatures();
        break;
      case 'notifications':
        markAllAsRead();
        break;
      case 'connectors':
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        acknowledgeIssue();
        break;
    }

    // Clear loading state after a delay
    setTimeout(() => setLoadingTab(null), 500);
  };

  const tabGroups: { label: string; tabs: typeof visibleTabs }[] = [
    { label: 'Workspace', tabs: visibleTabs.filter((tab) => ['features', 'data', 'event-logs'].includes(tab.id)) },
    {
      label: 'AI providers',
      tabs: visibleTabs.filter((tab) => ['cloud-providers', 'local-providers'].includes(tab.id)),
    },
    { label: 'Integrations', tabs: visibleTabs.filter((tab) => ['connectors', 'mcp'].includes(tab.id)) },
  ];

  const renderNavItem = (tabId: TabType, label = TAB_LABELS[tabId]) => {
    const Icon = TAB_ICONS[tabId];
    const selected = activeTab === tabId;

    return (
      <button
        key={tabId}
        type="button"
        onClick={() => handleTabClick(tabId)}
        aria-label={label}
        title={label}
        aria-current={selected ? 'page' : undefined}
        className={classNames(
          'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors bg-transparent',
          selected
            ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-item-contentAccent font-medium'
            : 'text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="hidden truncate sm:inline">{label}</span>
        {getTabUpdateStatus(tabId) && <span className="ml-auto h-2 w-2 rounded-full bg-accent-500" />}
      </button>
    );
  };

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal>
        <div className="fixed inset-0 flex items-center justify-center z-[100] modern-scrollbar">
          <RadixDialog.Overlay className="absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity duration-200" />

          <RadixDialog.Content
            aria-describedby={undefined}
            onEscapeKeyDown={handleClose}
            onPointerDownOutside={handleClose}
            className="relative z-[101]"
          >
            <div
              className={classNames(
                'w-[min(1440px,calc(100vw-2rem))] h-[min(900px,calc(100vh-2rem))]',
                'bg-bolt-elements-background-depth-1 rounded-2xl shadow-2xl',
                'border border-bolt-elements-borderColor flex overflow-hidden relative',
                'transform transition-all duration-200 ease-out',
                open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-[0.98] translate-y-2',
              )}
            >
              <aside className="w-[68px] sm:w-[216px] lg:w-[248px] shrink-0 border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 flex flex-col">
                <div className="px-4 pt-4 pb-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex w-full items-center gap-2 rounded-md bg-transparent px-2 py-2 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-colors"
                  >
                    <span className="i-ph:arrow-left w-4 h-4" />
                    <span className="hidden sm:inline">Back to project</span>
                  </button>
                </div>
                <div className="mx-4 border-t border-bolt-elements-borderColor" />
                <nav aria-label="Control Panel" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                  <section>
                    <h2 className="hidden sm:block px-3 mb-2 text-xs font-semibold tracking-wide text-bolt-elements-textTertiary">
                      PREFERENCES
                    </h2>
                    <div className="space-y-1">{renderNavItem('settings', 'General')}</div>
                  </section>
                  <section>
                    <h2 className="hidden sm:block px-3 mb-2 text-xs font-semibold tracking-wide text-bolt-elements-textTertiary">
                      ACCOUNT
                    </h2>
                    <div className="space-y-1">
                      {renderNavItem('profile')}
                      {visibleTabs.filter((tab) => tab.id === 'notifications').map((tab) => renderNavItem(tab.id))}
                    </div>
                  </section>
                  {tabGroups.map(
                    (group) =>
                      group.tabs.length > 0 && (
                        <section key={group.label}>
                          <h2 className="hidden sm:block px-3 mb-2 text-xs font-semibold tracking-wide text-bolt-elements-textTertiary">
                            {group.label.toUpperCase()}
                          </h2>
                          <div className="space-y-1">{group.tabs.map((tab) => renderNavItem(tab.id))}</div>
                        </section>
                      ),
                  )}
                </nav>
                <div className="border-t border-bolt-elements-borderColor p-3 flex items-center justify-between">
                  <AvatarDropdown onSelectTab={handleTabClick} />
                  <button
                    type="button"
                    aria-label="Close Control Panel"
                    onClick={handleClose}
                    className="rounded-md bg-transparent p-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
                  >
                    <span className="i-ph:x w-4 h-4" />
                  </button>
                </div>
              </aside>
              <main className="min-w-0 flex-1 overflow-y-auto bg-bolt-elements-background-depth-1">
                <DialogTitle className="sr-only">{activeTab ? TAB_LABELS[activeTab] : 'Control Panel'}</DialogTitle>
                <div className="mx-auto w-full max-w-[1060px] p-6 md:p-10">
                  {activeTab ? (
                    getTabComponent(activeTab)
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h1 className="text-2xl font-semibold text-bolt-elements-textPrimary">Control Panel</h1>
                        <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                          Manage your account, preferences, providers, and connected services.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {visibleTabs.map((tab) => (
                          <TabTile
                            key={tab.id}
                            tab={tab}
                            onClick={() => handleTabClick(tab.id)}
                            hasUpdate={getTabUpdateStatus(tab.id)}
                            statusMessage={getStatusMessage(tab.id)}
                            description={TAB_DESCRIPTIONS[tab.id]}
                            isLoading={loadingTab === tab.id}
                            className="h-full"
                          >
                            {BETA_TABS.has(tab.id) && <BetaLabel />}
                          </TabTile>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </main>
            </div>
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};
