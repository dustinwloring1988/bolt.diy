/**
 * Web search & fetch API route.
 *
 * Supports three operations via POST body:
 *
 *  { query, provider }          → keyword search (Exa MCP or DuckDuckGo HTML scrape)
 *  { url }                      → fetch page content and extract readable text
 *
 * Provider values: "exa" (default, free — uses https://mcp.exa.ai/mcp) | "duckduckgo"
 * Exa works without an API key but accepts EXA_API_KEY env var for higher limits.
 */

import type { ActionFunctionArgs } from 'react-router';
import { withSecurity } from '~/lib/security';
import { isAllowedUrl } from '~/utils/url';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

const MAX_CONTENT_LENGTH = 8000;
const MAX_REDIRECTS = 5;

/** Fetch a public URL without allowing fetch() to follow unchecked redirects. */
async function fetchPublicUrl(input: string): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = input;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (!isAllowedUrl(currentUrl)) {
      throw new Error('URL is not allowed. Only public HTTP/HTTPS URLs are accepted.');
    }

    const response = await fetch(currentUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get('location');

    if (!location) {
      return { response, finalUrl: currentUrl };
    }

    if (redirects === MAX_REDIRECTS) {
      throw new Error('Too many redirects');
    }

    await response.body?.cancel();
    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error('Too many redirects');
}

/*
 * ── Exa MCP ────────────────────────────────────────────────────────────────────
 * Exa's remote MCP server is free (rate-limited) without a key, and faster/richer
 * with EXA_API_KEY set.  We call it over plain HTTPS as a JSON-RPC endpoint —
 * same protocol opencode uses in packages/opencode/src/tool/mcp-websearch.ts.
 */

const EXA_MCP_URL = process.env.EXA_API_KEY
  ? `https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(process.env.EXA_API_KEY)}`
  : 'https://mcp.exa.ai/mcp';

interface ExaResult {
  title?: string;
  url: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
}

interface ExaSearchResult {
  query: string;
  results: Array<{ title: string; url: string; description: string }>;
}

async function exaSearch(query: string, numResults = 8): Promise<ExaSearchResult> {
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'web_search_exa',
      arguments: {
        query,
        type: 'auto',
        numResults,
        livecrawl: 'fallback',
        contextMaxCharacters: 6000,
      },
    },
  };

  const res = await fetch(EXA_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    throw new Error(`Exa MCP error: ${res.status} ${res.statusText}`);
  }

  const body = await res.text();

  // Parse response: can be direct JSON or SSE (data: {...})
  let parsed: { result?: { content?: Array<{ type: string; text: string }> } } | undefined;

  const trimmed = body.trim();

  if (trimmed.startsWith('{')) {
    parsed = JSON.parse(trimmed);
  } else {
    // SSE format
    for (const line of body.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6).trim();

        if (data && data.startsWith('{')) {
          parsed = JSON.parse(data);
          break;
        }
      }
    }
  }

  const text = parsed?.result?.content?.find((c) => c.type === 'text')?.text;

  if (!text) {
    return { query, results: [] };
  }

  // Exa returns results as a context string with source URLs — parse it
  const results: Array<{ title: string; url: string; description: string }> = [];

  // Try to parse structured JSON results first
  try {
    const json = JSON.parse(text) as { results?: ExaResult[] };

    if (Array.isArray(json.results)) {
      for (const r of json.results.slice(0, numResults)) {
        results.push({
          title: r.title || r.url,
          url: r.url,
          description: r.summary || (r.highlights?.[0] ?? r.text?.slice(0, 200) ?? ''),
        });
      }

      return { query, results };
    }
  } catch {
    // not JSON — fall through to text parsing
  }

  // Parse the context string which has "Source: URL\n..." blocks
  const sourceBlocks = text.split(/\n(?=Source: )/);

  for (const block of sourceBlocks.slice(0, numResults)) {
    const urlMatch = block.match(/Source:\s*(https?:\/\/\S+)/);
    const titleMatch = block.match(/Title:\s*(.+)/);
    const summaryMatch = block.match(/Summary:\s*([\s\S]+?)(?=\n\w|$)/);

    if (urlMatch) {
      results.push({
        url: urlMatch[1].trim(),
        title: titleMatch ? titleMatch[1].trim() : urlMatch[1].trim(),
        description: summaryMatch ? summaryMatch[1].trim().slice(0, 300) : '',
      });
    }
  }

  return { query, results };
}

// ── DuckDuckGo HTML scrape ──────────────────────────────────────────────────────

function parseDuckDuckGoResults(html: string): Array<{ title: string; url: string; description: string }> {
  const results: Array<{ title: string; url: string; description: string }> = [];
  const titleLinkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  const titles: Array<{ url: string; title: string }> = [];

  let m: RegExpExecArray | null;

  while ((m = titleLinkRegex.exec(html)) !== null) {
    const rawUrl = m[1];

    const rawTitle = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    let finalUrl = rawUrl;

    try {
      if (rawUrl.includes('uddg=')) {
        const parsed = new URL(rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl, 'https://html.duckduckgo.com');
        const uddg = parsed.searchParams.get('uddg');

        if (uddg) {
          finalUrl = decodeURIComponent(uddg);
        }
      } else if (rawUrl.startsWith('/')) {
        continue;
      }
    } catch {
      // keep rawUrl
    }

    if (rawTitle && finalUrl && (finalUrl.startsWith('http://') || finalUrl.startsWith('https://'))) {
      titles.push({ url: finalUrl, title: rawTitle });
    }
  }

  const snippets: string[] = [];

  while ((m = snippetRegex.exec(html)) !== null) {
    snippets.push(
      m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }

  // Deduplicate by URL
  const seen = new Set<string>();

  for (let i = 0; i < titles.length && results.length < 10; i++) {
    if (!seen.has(titles[i].url)) {
      seen.add(titles[i].url);
      results.push({ title: titles[i].title, url: titles[i].url, description: snippets[i] || '' });
    }
  }

  return results;
}

async function duckduckgoSearch(query: string): Promise<Array<{ title: string; url: string; description: string }>> {
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const res = await fetch(ddgUrl, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo returned ${res.status}`);
  }

  const html = await res.text();

  return parseDuckDuckGoResults(html);
}

// ── Web fetch / page content extraction ────────────────────────────────────────

/**
 * Convert HTML to clean readable text, preserving code blocks and structure.
 * Better than a simple regex strip — removes boilerplate sections and normalises whitespace.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    .replace(/<figure\b[^<]*(?:(?!<\/figure>)<[^<]*)*<\/figure>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, '\n\n$2\n')
    .replace(/<(p|div|section|article|main|li)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractMeta(html: string, attr: string): string {
  // name= or property= (for OG tags)
  const nameMatch = html.match(
    new RegExp(`<meta[^>]+(?:name|property)=["']${attr}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i'),
  );

  if (nameMatch) {
    return nameMatch[1].trim();
  }

  const altMatch = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${attr}["'][^>]*>`, 'i'),
  );

  return altMatch ? altMatch[1].trim() : '';
}

// ── Route handler ───────────────────────────────────────────────────────────────

async function webSearchAction({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = (await request.json()) as { url?: string; query?: string; provider?: string; numResults?: number };

    // ── Fetch mode ────────────────────────────────────────────────────────────
    if (body.url) {
      const url = String(body.url).trim();

      if (!isAllowedUrl(url)) {
        return Response.json(
          { error: 'URL is not allowed. Only public HTTP/HTTPS URLs are accepted.' },
          { status: 400 },
        );
      }

      const { response, finalUrl } = await fetchPublicUrl(url);

      if (!response.ok) {
        return Response.json(
          { error: `Failed to fetch URL: ${response.status} ${response.statusText}` },
          { status: 502 },
        );
      }

      const contentType = response.headers.get('content-type') || '';

      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        return Response.json({ error: 'URL must point to an HTML or text page' }, { status: 400 });
      }

      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';
      const description = extractMeta(html, 'description') || extractMeta(html, 'og:description');
      const content = htmlToText(html);

      return Response.json({
        success: true,
        mode: 'fetch',
        data: {
          title,
          description,
          content: content.length > MAX_CONTENT_LENGTH ? content.slice(0, MAX_CONTENT_LENGTH) + '...' : content,
          sourceUrl: finalUrl,
        },
      });
    }

    // ── Search mode ───────────────────────────────────────────────────────────
    if (body.query) {
      const query = String(body.query).trim();

      if (!query) {
        return Response.json({ error: 'Search query cannot be empty' }, { status: 400 });
      }

      const provider = body.provider === 'duckduckgo' ? 'duckduckgo' : 'exa';
      const numResults = Math.min(Math.max(Number(body.numResults) || 8, 1), 20);

      let results: Array<{ title: string; url: string; description: string }>;

      if (provider === 'exa') {
        try {
          const exaResult = await exaSearch(query, numResults);
          results = exaResult.results;
        } catch (exaErr) {
          // Fallback to DuckDuckGo if Exa fails
          console.warn('Exa search failed, falling back to DuckDuckGo:', exaErr);
          results = await duckduckgoSearch(query);
        }
      } else {
        results = await duckduckgoSearch(query);
      }

      return Response.json({
        success: true,
        mode: 'search',
        provider,
        data: { query, results },
      });
    }

    return Response.json({ error: 'Either "url" (fetch) or "query" (search) is required' }, { status: 400 });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return Response.json({ error: 'Request timed out' }, { status: 504 });
    }

    console.error('Web search/fetch error:', error);

    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 },
    );
  }
}

export const action = withSecurity(webSearchAction, {
  allowedMethods: ['POST'],
  rateLimit: true,
});
