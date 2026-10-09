import { generateId, type UIMessage } from 'ai';
import ignore from 'ignore';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { LoadingOverlay } from '~/components/ui/LoadingOverlay';
import { useGit } from '~/lib/hooks/useGit';
import { useChatHistory } from '~/lib/persistence';
import { createMessage } from '~/lib/persistence/messageMigration';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from '~/utils/constants';
import { detectProjectCommands, createCommandsMessage, escapeBoltTags } from '~/utils/projectCommands';

const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.github/**',
  '.vscode/**',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.png',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',
  '**/*lock.yaml',
];

const ig = ignore().add(IGNORE_PATTERNS);

interface StarterTemplatesProps {
  importChat?: (description: string, messages: UIMessage[]) => Promise<void>;
}

const StarterTemplates: React.FC<StarterTemplatesProps> = ({ importChat: importChatProp }) => {
  const { importChat: importChatFromHistory } = useChatHistory();
  const { ready: gitReady, gitClone } = useGit();
  const [loading, setLoading] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);

  /*
   * Prefer the prop passed from Chat (which has navigate wired up) — fall
   * back to useChatHistory's importChat if not provided.
   */
  const importChat = importChatProp ?? importChatFromHistory;

  const handleTemplateClick = async (template: Template) => {
    if (!gitReady) {
      toast.error('WebContainer is still initialising — please wait a moment and try again.');
      return;
    }

    const repoUrl = `https://github.com/${template.githubRepo}.git`;

    setLoading(true);
    setLoadingTemplate(template.label);

    try {
      const { workdir, data } = await gitClone(repoUrl);

      const filePaths = Object.keys(data).filter((p) => !ig.ignores(p));
      const textDecoder = new TextDecoder('utf-8');

      const fileContents = filePaths
        .map((filePath) => {
          const { data: content, encoding } = data[filePath];
          return {
            path: filePath,
            content: encoding === 'utf8' ? content : content instanceof Uint8Array ? textDecoder.decode(content) : '',
          };
        })
        .filter((f) => f.content);

      const commands = await detectProjectCommands(fileContents);
      const commandsMessage = createCommandsMessage(commands);

      const filesMessage = createMessage({
        role: 'assistant',
        id: generateId(),
        text: `Cloning the repo ${repoUrl} into ${workdir}
<boltArtifact id="imported-files" title="Git Cloned Files" type="bundled">
${fileContents
  .map(
    (file) =>
      `<boltAction type="file" filePath="${file.path}">
${escapeBoltTags(file.content)}
</boltAction>`,
  )
  .join('\n')}
</boltArtifact>`,
      }) as UIMessage;

      const messages: UIMessage[] = [filesMessage];

      if (commandsMessage) {
        messages.push(
          createMessage({
            role: 'user',
            id: generateId(),
            text: 'Setup the codebase and start the application',
          }) as UIMessage,
        );
        messages.push(commandsMessage);
      }

      await importChat(`${template.label}`, messages);
    } catch (error) {
      console.error('Error cloning template:', error);
      toast.error(`Failed to load ${template.label} template`);
    } finally {
      setLoading(false);
      setLoadingTemplate(null);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        <span className="text-sm text-gray-500">or start a blank app with your favorite stack</span>
        <div className="flex justify-center">
          <div className="flex flex-wrap justify-center items-center gap-4 max-w-full">
            {STARTER_TEMPLATES.map((template) => (
              <button
                key={template.name}
                type="button"
                title={template.label}
                disabled={loading || !gitReady}
                onClick={() => handleTemplateClick(template)}
                className="flex appearance-none items-center justify-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div
                  className={`inline-block ${template.icon} w-8 h-8 text-4xl transition-theme hover:text-purple-500 dark:text-white dark:opacity-50 dark:hover:opacity-100 dark:hover:text-purple-400 transition-all grayscale hover:grayscale-0 transition`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <LoadingOverlay message={`Loading ${loadingTemplate ?? 'template'}…`} />}
    </>
  );
};

export default StarterTemplates;
