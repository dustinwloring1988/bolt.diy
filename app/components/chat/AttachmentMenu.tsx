import { useStore } from '@nanostores/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { isGitHubConnected } from '~/lib/stores/githubConnection';
import { useMCPStore } from '~/lib/stores/mcp';
import { skillsStore, toggleSkill } from '~/lib/stores/skills';
import { supabaseConnection } from '~/lib/stores/supabase';
import { classNames } from '~/utils/classNames';

interface AttachmentMenuProps {
  onAttachFile: () => void;
  onSupabaseConnect: () => void;
  onGithubConnect: () => void;
  onEnhancePrompt: () => void;
  onOpenDesignDialog: () => void;
  enhancingPrompt?: boolean;
  isEnhanceDisabled?: boolean;
}

export function AttachmentMenu({
  onAttachFile,
  onSupabaseConnect,
  onGithubConnect,
  onEnhancePrompt,
  onOpenDesignDialog,
  enhancingPrompt = false,
  isEnhanceDisabled = false,
}: AttachmentMenuProps) {
  const skills = useStore(skillsStore);
  const mcpServers = useMCPStore((state) => state.serverTools);
  const githubConnected = useStore(isGitHubConnected);
  const supabaseConnected = useStore(supabaseConnection).isConnected ?? false;

  const statusDot = (active: boolean, label: string) => (
    <span
      aria-label={`${label} ${active ? 'active' : 'inactive'}`}
      title={`${label} ${active ? 'active' : 'inactive'}`}
      className={classNames('ml-auto h-2 w-2 shrink-0 rounded-full', active ? 'bg-green-500' : 'bg-red-500')}
    />
  );

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title="Add attachment or connector"
          className={classNames(
            'flex items-center text-bolt-elements-item-contentDefault bg-transparent',
            'hover:text-bolt-elements-item-contentActive rounded-md p-1',
            'hover:bg-bolt-elements-item-backgroundActive',
            'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus focus:ring-offset-1',
            'transition-all',
          )}
        >
          <div className="i-ph:plus text-xl"></div>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={classNames(
            'min-w-[200px] rounded-lg p-1',
            'bg-bolt-elements-background-depth-2',
            'border border-bolt-elements-borderColor',
            'shadow-lg',
            'animate-in fade-in-80 zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2',
            'data-[side=left]:slide-in-from-right-2',
            'data-[side=right]:slide-in-from-left-2',
            'data-[side=top]:slide-in-from-bottom-2',
            'z-[1000]',
          )}
          sideOffset={5}
          align="start"
        >
          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
              'text-bolt-elements-textPrimary',
              'hover:bg-bolt-elements-background-depth-3',
              'data-[highlighted]:bg-bolt-elements-background-depth-3',
              'outline-none transition-colors',
            )}
            onSelect={onAttachFile}
          >
            <div className="i-ph:paperclip text-lg"></div>
            <span>Attach Image</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
              'text-bolt-elements-textPrimary',
              'hover:bg-bolt-elements-background-depth-3',
              'data-[highlighted]:bg-bolt-elements-background-depth-3',
              'outline-none transition-colors',
            )}
            onSelect={onOpenDesignDialog}
          >
            <div className="i-ph:palette text-lg"></div>
            <span>Design Palette</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={classNames(
              'flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
              'text-bolt-elements-textPrimary',
              'hover:bg-bolt-elements-background-depth-3',
              'data-[highlighted]:bg-bolt-elements-background-depth-3',
              'outline-none transition-colors',
              isEnhanceDisabled && 'opacity-50 cursor-not-allowed',
            )}
            onSelect={onEnhancePrompt}
            disabled={isEnhanceDisabled}
          >
            {enhancingPrompt ? (
              <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-lg animate-spin"></div>
            ) : (
              <div className="i-bolt:stars text-lg"></div>
            )}
            <span>Enhance Prompt</span>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="h-px bg-bolt-elements-borderColor my-1" />

          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              className={classNames(
                'flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
                'text-bolt-elements-textPrimary',
                'hover:bg-bolt-elements-background-depth-3',
                'outline-none transition-colors',
              )}
            >
              <div className="flex items-center gap-2">
                <div className="i-bolt:mcp text-lg"></div>
                <span>MCP</span>
              </div>
              <div className="i-ph:caret-right text-sm"></div>
            </DropdownMenu.SubTrigger>

            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className={classNames(
                  'min-w-[180px] rounded-lg p-1',
                  'bg-bolt-elements-background-depth-2',
                  'border border-bolt-elements-borderColor',
                  'shadow-lg',
                  'animate-in fade-in-80 zoom-in-95',
                  'data-[side=right]:slide-in-from-left-2',
                  'data-[side=left]:slide-in-from-right-2',
                  'z-[1000]',
                )}
                sideOffset={8}
              >
                {Object.entries(mcpServers).length === 0 ? (
                  <div className="px-3 py-2 text-xs text-bolt-elements-textTertiary">No MCP servers configured</div>
                ) : (
                  Object.entries(mcpServers).map(([serverName, server]) => (
                    <div
                      key={serverName}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-bolt-elements-textPrimary"
                    >
                      <div className="i-bolt:mcp text-lg shrink-0"></div>
                      <span className="truncate">{serverName}</span>
                      {statusDot(server.status === 'available', serverName)}
                    </div>
                  ))
                )}
                <DropdownMenu.Separator className="h-px bg-bolt-elements-borderColor my-1" />
                <DropdownMenu.Item
                  className={classNames(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
                    'text-bolt-elements-textPrimary',
                    'hover:bg-bolt-elements-background-depth-3',
                    'data-[highlighted]:bg-bolt-elements-background-depth-3',
                    'outline-none transition-colors',
                  )}
                  onSelect={() => document.dispatchEvent(new CustomEvent('open-mcp-settings'))}
                >
                  <div className="i-ph:gear text-lg"></div>
                  <span>MCP tools</span>
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              className={classNames(
                'flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
                'text-bolt-elements-textPrimary',
                'hover:bg-bolt-elements-background-depth-3',
                'outline-none transition-colors',
              )}
            >
              <div className="flex items-center gap-2">
                <div className="i-ph:plug text-lg"></div>
                <span>Connectors</span>
              </div>
              <div className="i-ph:caret-right text-sm"></div>
            </DropdownMenu.SubTrigger>

            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className={classNames(
                  'min-w-[180px] rounded-lg p-1',
                  'bg-bolt-elements-background-depth-2',
                  'border border-bolt-elements-borderColor',
                  'shadow-lg',
                  'animate-in fade-in-80 zoom-in-95',
                  'data-[side=right]:slide-in-from-left-2',
                  'data-[side=left]:slide-in-from-right-2',
                  'z-[1000]',
                )}
                sideOffset={8}
              >
                <DropdownMenu.Item
                  className={classNames(
                    'flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
                    'text-bolt-elements-textPrimary',
                    'hover:bg-bolt-elements-background-depth-3',
                    'outline-none transition-colors',
                  )}
                  onSelect={onSupabaseConnect}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <img
                      className="w-4 h-4"
                      height="16"
                      width="16"
                      crossOrigin="anonymous"
                      src="https://cdn.simpleicons.org/supabase"
                      alt=""
                    />
                    <span>Supabase</span>
                  </span>
                  {statusDot(supabaseConnected, 'Supabase')}
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  className={classNames(
                    'flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
                    'text-bolt-elements-textPrimary',
                    'hover:bg-bolt-elements-background-depth-3',
                    'outline-none transition-colors',
                  )}
                  onSelect={onGithubConnect}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <div className="i-ph:github-logo text-lg"></div>
                    <span>GitHub</span>
                  </span>
                  {statusDot(githubConnected, 'GitHub')}
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              className={classNames(
                'flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
                'text-bolt-elements-textPrimary',
                'hover:bg-bolt-elements-background-depth-3',
                'outline-none transition-colors',
              )}
            >
              <div className="flex items-center gap-2">
                <div className="i-ph:star text-lg"></div>
                <span>Skills</span>
              </div>
              <div className="i-ph:caret-right text-sm"></div>
            </DropdownMenu.SubTrigger>

            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className={classNames(
                  'min-w-[180px] rounded-lg p-1',
                  'bg-bolt-elements-background-depth-2',
                  'border border-bolt-elements-borderColor',
                  'shadow-lg',
                  'animate-in fade-in-80 zoom-in-95',
                  'data-[side=right]:slide-in-from-left-2',
                  'data-[side=left]:slide-in-from-right-2',
                  'z-[1000]',
                )}
                sideOffset={8}
              >
                {skills.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-bolt-elements-textTertiary">No skills available</div>
                ) : (
                  skills.map((skill) => (
                    <DropdownMenu.CheckboxItem
                      key={skill.id}
                      checked={skill.enabled}
                      onCheckedChange={(checked) => toggleSkill(skill.id, checked)}
                      title={skill.description}
                      className={classNames(
                        'flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
                        'text-bolt-elements-textPrimary',
                        'hover:bg-bolt-elements-background-depth-3',
                        'data-[highlighted]:bg-bolt-elements-background-depth-3',
                        'outline-none transition-colors',
                      )}
                    >
                      {/* Fixed-width check indicator — always occupies space so names stay aligned */}
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                        <DropdownMenu.ItemIndicator>
                          <div className="i-ph:check text-sm text-bolt-elements-textPrimary"></div>
                        </DropdownMenu.ItemIndicator>
                      </div>
                      <div className="i-ph:star text-lg shrink-0"></div>
                      <span className="truncate">{skill.name}</span>
                      {statusDot(skill.enabled, skill.name)}
                    </DropdownMenu.CheckboxItem>
                  ))
                )}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
