import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

// Allowed headers to forward to the target server
const ALLOW_HEADERS = [
  'accept-encoding',
  'accept-language',
  'accept',
  'access-control-allow-origin',
  'authorization',
  'cache-control',
  'connection',
  'content-length',
  'content-type',
  'dnt',
  'pragma',
  'range',
  'referer',
  'user-agent',
  'x-authorization',
  'x-http-method-override',
  'x-requested-with',
];

// Headers to expose from the target server's response
const EXPOSE_HEADERS = [
  'accept-ranges',
  'age',
  'cache-control',
  'content-length',
  'content-language',
  'content-type',
  'date',
  'etag',
  'expires',
  'last-modified',
  'pragma',
  'server',
  'transfer-encoding',
  'vary',
  'x-github-request-id',
  'x-redirected-url',
];

/*
 * The proxy is used for browser based clones from these public Git hosts. Keeping
 * the destination set explicit prevents this endpoint from becoming an SSRF proxy.
 */
const ALLOWED_GIT_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org']);

// Handle all HTTP methods
export async function action({ request, params, context }: ActionFunctionArgs) {
  return handleProxyRequest(request, params['*'], context);
}

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return handleProxyRequest(request, params['*'], context);
}

async function handleProxyRequest(request: Request, path: string | undefined, context?: any) {
  try {
    if (!path) {
      return Response.json({ error: 'Invalid proxy URL format' }, { status: 400 });
    }

    // Handle CORS preflight request
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': ALLOW_HEADERS.join(', '),
          'Access-Control-Expose-Headers': EXPOSE_HEADERS.join(', '),
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Extract domain and remaining path
    const parts = path.match(/([^\/]+)\/?(.*)/);

    if (!parts) {
      return Response.json({ error: 'Invalid path format' }, { status: 400 });
    }

    const domain = parts[1];
    const remainingPath = parts[2] || '';

    let targetURL: URL;

    try {
      targetURL = new URL(`https://${domain}/${remainingPath}${new URL(request.url).search}`);
    } catch {
      return Response.json({ error: 'Invalid proxy host' }, { status: 400 });
    }

    if (
      targetURL.protocol !== 'https:' ||
      targetURL.port !== '' ||
      targetURL.username ||
      targetURL.password ||
      !getAllowedGitHosts(context).has(targetURL.hostname.toLowerCase())
    ) {
      return Response.json({ error: 'Git host is not allowed' }, { status: 403 });
    }

    // Filter and prepare headers
    const headers = new Headers();

    // Only forward allowed headers
    for (const header of ALLOW_HEADERS) {
      if (request.headers.has(header)) {
        headers.set(header, request.headers.get(header)!);
      }
    }

    // Set the host header
    headers.set('Host', domain);

    // Set Git user agent if not already present
    if (!headers.has('user-agent') || !headers.get('user-agent')?.startsWith('git/')) {
      headers.set('User-Agent', 'git/@isomorphic-git/cors-proxy');
    }

    /*
     * `duplex` is required by undici/Node when streaming a request body, but it is
     * absent from the Cloudflare `RequestInit` type, so widen it locally.
     */
    const fetchOptions: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,

      /*
       * Do not follow redirects on the server: a permitted host could redirect to
       * an internal service and turn this public endpoint into an SSRF vector.
       */
      redirect: 'manual',
    };

    // Add body for non-GET/HEAD requests
    if (!['GET', 'HEAD'].includes(request.method)) {
      fetchOptions.body = request.body;
      fetchOptions.duplex = 'half';
    }

    // Forward the request to the target URL
    let response = await fetch(targetURL.toString(), fetchOptions);
    let currentURL = targetURL;
    let redirectCount = 0;

    /*
     * Follow only same-origin read redirects. This preserves renamed repository URLs
     * while preventing credentials or requests from being sent to another host.
     */
    while (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');

      if (!location || !['GET', 'HEAD'].includes(request.method) || redirectCount >= 5) {
        break;
      }

      let nextURL: URL;

      try {
        nextURL = new URL(location, currentURL);
      } catch {
        break;
      }

      if (
        nextURL.protocol !== 'https:' ||
        nextURL.port !== '' ||
        nextURL.username ||
        nextURL.password ||
        nextURL.origin !== currentURL.origin ||
        !getAllowedGitHosts(context).has(nextURL.hostname.toLowerCase())
      ) {
        break;
      }

      currentURL = nextURL;
      redirectCount++;
      response = await fetch(currentURL.toString(), fetchOptions);
    }

    console.log('Response status:', response.status);

    // Create response headers
    const responseHeaders = new Headers();

    // Add CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', ALLOW_HEADERS.join(', '));
    responseHeaders.set('Access-Control-Expose-Headers', EXPOSE_HEADERS.join(', '));

    /*
     * Do not pass an unvalidated redirect to the browser: browser fetch would follow it
     * outside this route's host checks.
     */
    if (response.status >= 300 && response.status < 400) {
      return new Response(null, { status: 502, headers: responseHeaders });
    }

    // Copy exposed headers from the target response
    for (const header of EXPOSE_HEADERS) {
      // Skip content-length as we'll use the original response's content-length
      if (header === 'content-length') {
        continue;
      }

      if (response.headers.has(header)) {
        responseHeaders.set(header, response.headers.get(header)!);
      }
    }

    // If the response was redirected, add the x-redirected-url header
    if (response.redirected) {
      responseHeaders.set('x-redirected-url', response.url);
    }

    // Return the response with the target's body stream piped directly
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return Response.json(
      {
        error: 'Proxy error',
        message: error instanceof Error ? error.message : 'Unknown error',
        url: path ? `https://${path}` : 'Invalid URL',
      },
      { status: 500 },
    );
  }
}

function getAllowedGitHosts(context?: any): Set<string> {
  const configuredHosts =
    context?.cloudflare?.env?.GIT_PROXY_ALLOWED_HOSTS ?? process.env.GIT_PROXY_ALLOWED_HOSTS ?? '';

  return new Set([
    ...ALLOWED_GIT_HOSTS,
    ...String(configuredHosts)
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  ]);
}
