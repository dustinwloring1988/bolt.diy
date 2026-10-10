/** MCP configuration grants access to server processes and internal services. */
export async function authorizeMcpRequest(request: Request, serverEnv?: object): Promise<Response | undefined> {
  const token =
    serverEnv && 'MCP_CONFIG_TOKEN' in serverEnv ? serverEnv.MCP_CONFIG_TOKEN : process.env.MCP_CONFIG_TOKEN;

  if (typeof token !== 'string' || !token) {
    return Response.json(
      { error: 'MCP is disabled until the server administrator sets MCP_CONFIG_TOKEN.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const suppliedToken = request.headers.get('X-MCP-Config-Token') ?? '';
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

  if (difference !== 0) {
    return Response.json(
      { error: 'A valid MCP administrator token is required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return undefined;
}
