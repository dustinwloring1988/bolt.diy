import type { ActionFunctionArgs } from 'react-router';
import { authorizeMcpRequest, clearMcpSessionCookie, createMcpSessionCookie } from '~/lib/.server/mcp-auth';
import { withSecurity } from '~/lib/security';

async function manageMcpSession({ request, context }: ActionFunctionArgs) {
  if (request.method === 'DELETE') {
    if (request.headers.get('Origin') !== new URL(request.url).origin) {
      return Response.json({ error: 'A same-origin request is required.' }, { status: 403 });
    }

    return new Response(null, {
      status: 204,
      headers: { 'Set-Cookie': clearMcpSessionCookie(request), 'Cache-Control': 'no-store' },
    });
  }

  const denied = await authorizeMcpRequest(request, context.cloudflare?.env);

  if (denied) {
    return denied;
  }

  const token = request.headers.get('X-MCP-Config-Token')!;

  return Response.json(
    { authenticated: true },
    {
      headers: { 'Set-Cookie': await createMcpSessionCookie(token, request), 'Cache-Control': 'no-store' },
    },
  );
}

export const action = withSecurity(manageMcpSession, { allowedMethods: ['POST', 'DELETE'] });
