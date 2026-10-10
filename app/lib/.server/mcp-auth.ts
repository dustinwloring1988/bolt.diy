const SESSION_COOKIE = 'mcp_config_session';
const SESSION_TTL_SECONDS = 15 * 60;

function getAdminToken(serverEnv?: object): string | undefined {
  const token =
    serverEnv && 'MCP_CONFIG_TOKEN' in serverEnv ? serverEnv.MCP_CONFIG_TOKEN : process.env.MCP_CONFIG_TOKEN;
  return typeof token === 'string' && token ? token : undefined;
}

function unauthorized(status = 401) {
  return Response.json(
    {
      error:
        status === 503
          ? 'MCP is disabled until the server administrator sets MCP_CONFIG_TOKEN.'
          : 'A valid MCP administrator session is required.',
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function cookieValue(request: Request): string | undefined {
  return request.headers
    .get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !!origin && origin === new URL(request.url).origin;
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));

  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64Url(value: string): Uint8Array | undefined {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

export async function createMcpSessionCookie(token: string, request: Request): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${expires}.${encodeBase64Url(crypto.getRandomValues(new Uint8Array(16)))}`;
  const signature = await crypto.subtle.sign('HMAC', await importHmacKey(token), new TextEncoder().encode(payload));
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';

  return `${SESSION_COOKIE}=${payload}.${encodeBase64Url(new Uint8Array(signature))}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearMcpSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Validate the initial administrator secret or a short-lived, HttpOnly signed session. */
export async function authorizeMcpRequest(request: Request, serverEnv?: object): Promise<Response | undefined> {
  const token = getAdminToken(serverEnv);

  if (!token) {
    return unauthorized(503);
  }

  /*
   * Keep direct server-to-server administration supported. Browser code only uses this
   * header once to exchange the secret for an HttpOnly session cookie.
   */
  const suppliedToken = request.headers.get('X-MCP-Config-Token');

  if (suppliedToken) {
    const encoder = new TextEncoder();

    const [expected, supplied] = await Promise.all(
      [token, suppliedToken].map(
        async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),
      ),
    );

    let difference = 0;

    for (let index = 0; index < expected.length; index++) {
      difference |= expected[index] ^ supplied[index];
    }

    return difference === 0 ? undefined : unauthorized();
  }

  const cookie = cookieValue(request);
  const [expires, nonce, signature, ...extra] = cookie?.split('.') ?? [];
  const expiry = Number(expires);
  const signatureBytes = signature ? decodeBase64Url(signature) : undefined;

  const validShape =
    !extra.length && Number.isSafeInteger(expiry) && !!nonce && !!signatureBytes && expiry > Date.now() / 1000;

  if (!validShape || (request.method !== 'GET' && !sameOrigin(request))) {
    return unauthorized();
  }

  const valid = await crypto.subtle.verify(
    'HMAC',
    await importHmacKey(token),
    new Uint8Array(signatureBytes!).buffer,
    new TextEncoder().encode(`${expires}.${nonce}`),
  );

  return valid ? undefined : unauthorized();
}
