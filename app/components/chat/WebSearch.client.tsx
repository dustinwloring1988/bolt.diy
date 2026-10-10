import { IconButton } from '~/components/ui/IconButton';

interface WebSearchProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export function WebSearch({ enabled, onToggle, disabled = false }: WebSearchProps) {
  return (
    <IconButton
      title={enabled ? 'Web search enabled — click to disable' : 'Enable web search'}
      aria-label={enabled ? 'Disable web search' : 'Enable web search'}
      aria-pressed={enabled}
      disabled={disabled}
      onClick={() => onToggle(!enabled)}
      className={`transition-all ${enabled ? 'text-purple-500' : ''}`}
    >
      <div className="i-ph:globe text-xl" />
    </IconButton>
  );
}
