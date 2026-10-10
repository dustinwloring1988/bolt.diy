import { chmod, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join } from 'node:path';

const providers = [
  { name: 'OpenAI (GPT-4, GPT-4o)', key: 'OPENAI_API_KEY' },
  { name: 'Anthropic (Claude)', key: 'ANTHROPIC_API_KEY' },
  { name: 'Google Gemini', key: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  { name: 'Groq', key: 'GROQ_API_KEY' },
  { name: 'xAI', key: 'XAI_API_KEY' },
  { name: 'DeepSeek', key: 'DEEPSEEK_API_KEY' },
  { name: 'Mistral', key: 'MISTRAL_API_KEY' },
  { name: 'Cohere', key: 'COHERE_API_KEY' },
  { name: 'Together AI', key: 'TOGETHER_API_KEY' },
  { name: 'Perplexity', key: 'PERPLEXITY_API_KEY' },
  { name: 'OpenRouter', key: 'OPEN_ROUTER_API_KEY' },
  { name: 'Ollama (local)', key: null },
  { name: 'LM Studio (local)', key: null },
  { name: 'GitHub Models', key: 'GITHUB_API_KEY' },
  { name: 'Amazon Bedrock (AWS credentials JSON)', key: 'AWS_BEDROCK_CONFIG' },
  { name: 'Moonshot (Kimi)', key: 'MOONSHOT_API_KEY' },
  { name: 'Hyperbolic', key: 'HYPERBOLIC_API_KEY' },
  { name: 'Z.ai (GLM)', key: 'ZAI_API_KEY' },
];

const rl = createInterface({ input, output });

async function askRequired(question) {
  while (true) {
    const answer = (await rl.question(question)).trim();

    if (answer) {
      return answer;
    }

    console.log('Please enter a value.');
  }
}

async function askChoice(question, min, max) {
  while (true) {
    const answer = Number((await rl.question(question)).trim());

    if (Number.isInteger(answer) && answer >= min && answer <= max) {
      return answer;
    }

    console.log(`Enter a number between ${min} and ${max}.`);
  }
}

async function askYesNo(question) {
  while (true) {
    let answer;

    try {
      answer = (await rl.question(`${question} (y/n): `)).trim().toLowerCase();
    } catch (error) {
      if (input.readableEnded) return false;
      throw error;
    }

    if (['y', 'yes'].includes(answer)) return true;
    if (['n', 'no'].includes(answer)) return false;
    console.log('Please answer y or n.');
  }
}

function envValue(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '')}"`;
}

async function verifySupabaseCredentials(projectUrl, publishableKey) {
  let url;

  try {
    url = new URL(projectUrl);
  } catch {
    throw new Error('The Supabase project URL is not a valid URL.');
  }

  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
    throw new Error('Use the HTTPS project URL from your Supabase project settings.');
  }

  const response = await fetch(new URL('/auth/v1/health', url), {
    headers: { apikey: publishableKey },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Supabase verification failed (${response.status}). Check the URL and publishable key.`);
  }

  return url.origin;
}

async function main() {
  if (!input.isTTY) {
    throw new Error('The setup wizard requires an interactive terminal.');
  }

  console.log('bolt.diy Setup Wizard\n\nSelect an AI provider:');
  providers.forEach((provider, index) => console.log(`${index + 1}. ${provider.name}`));

  const selected = providers[(await askChoice(`Select provider (1-${providers.length}): `, 1, providers.length)) - 1];
  const entries = [];

  if (selected.key) {
    entries.push([selected.key, await askRequired(`Enter ${selected.name} API key: `)]);
  }

  if (await askYesNo('Configure Supabase?')) {
    const projectUrl = await askRequired('Enter the Supabase project URL: ');
    const publishableKey = await askRequired('Enter the Supabase publishable/anon key: ');

    console.log('Verifying the Supabase project URL and publishable key...');
    const verifiedUrl = await verifySupabaseCredentials(projectUrl, publishableKey);

    entries.push(
      ['VITE_SUPABASE_URL', verifiedUrl],
      ['VITE_SUPABASE_ANON_KEY', publishableKey],
      ['VITE_SUPABASE_VERIFICATION_STATUS', 'verified'],
    );
  }

  const envPath = join(process.cwd(), '.env.local');
  let existingContent = '';

  try {
    existingContent = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const lines = existingContent.split(/\r?\n/);

  for (const [key, value] of entries) {
    const assignment = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
    const newLine = `${key}=${envValue(value)}`;
    let didReplace = false;

    for (let index = 0; index < lines.length; index++) {
      if (assignment.test(lines[index])) {
        if (didReplace) {
          lines[index] = '';
        } else {
          lines[index] = newLine;
          didReplace = true;
        }
      }
    }

    if (!didReplace) {
      lines.push(newLine);
    }
  }

  const content = `${lines
    .filter((line, index) => line || index < lines.length - 1)
    .join('\n')
    .trimEnd()}\n`;
  await writeFile(envPath, content, { encoding: 'utf8', mode: 0o600 });
  await chmod(envPath, 0o600);
  console.log('\nSetup complete. Restart the development server to load the new settings.');
}

main()
  .catch((error) => {
    console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
