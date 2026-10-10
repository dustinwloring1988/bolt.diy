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

let rl = createInterface({ input, output });

async function askSecret(question) {
  rl.close();
  output.write(question);
  input.setRawMode(true);
  input.setEncoding('utf8');
  input.resume();

  return new Promise((resolve, reject) => {
    let answer = '';

    const finish = (error) => {
      input.off('data', onData);
      input.off('end', onEnd);
      input.setRawMode(false);
      output.write('\n');
      rl = createInterface({ input, output });

      if (error) reject(error);
      else resolve(answer.trim());
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(new Error('Setup cancelled.'));
          return;
        }

        if (character === '\r' || character === '\n') {
          if (answer.trim()) {
            finish();
            return;
          }

          output.write('\nPlease enter a value.\n');
          output.write(question);
          continue;
        }

        if (character === '\u0008' || character === '\u007f') {
          if (answer.length) {
            answer = answer.slice(0, -1);
            output.write('\b \b');
          }

          continue;
        }

        if (character >= ' ') {
          answer += character;
          output.write('*');
        }
      }
    };

    const onEnd = () => finish(new Error('Input ended before a credential was entered.'));

    input.on('data', onData);
    input.once('end', onEnd);
  });
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

function envValue(value, key) {
  if (key === 'AWS_BEDROCK_CONFIG') {
    let config;

    try {
      config = JSON.stringify(JSON.parse(value));
    } catch {
      throw new Error('Amazon Bedrock credentials must be valid JSON.');
    }

    return `'${config.replace(/'/g, '\\u0027')}'`;
  }

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '')}"`;
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
    entries.push([selected.key, await askSecret(`Enter ${selected.name} API key: `)]);
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
    const newLine = `${key}=${envValue(value, key)}`;
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
  console.log('\nSetup complete. Restart the development server to load the new settings. Connect Supabase in the app settings.');
}

main()
  .catch((error) => {
    console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
