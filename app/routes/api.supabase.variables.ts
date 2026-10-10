import type { ActionFunctionArgs } from 'react-router';
import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { withSecurity } from '~/lib/security';

async function supabaseVariablesAction({ request }: ActionFunctionArgs) {
  try {
    // Add proper type assertion for the request body
    const body = (await request.json()) as { projectId?: string; token?: string };
    const { projectId } = body;
    const cookieToken = getApiKeysFromCookie(request.headers.get('Cookie')).VITE_SUPABASE_ACCESS_TOKEN;
    const token = body.token || cookieToken;

    if (!projectId || !token) {
      return Response.json({ error: 'Project ID and token are required' }, { status: 400 });
    }

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/api-keys`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return Response.json({ error: `Failed to fetch API keys: ${response.statusText}` }, { status: response.status });
    }

    const apiKeys = (await response.json()) as Array<{ name?: string; api_key?: string }>;

    const publicApiKeys = Array.isArray(apiKeys)
      ? apiKeys.filter((key) => key.name === 'anon' || key.name === 'public')
      : [];

    return Response.json({ apiKeys: publicApiKeys });
  } catch (error) {
    console.error('Error fetching project API keys:', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Unknown error occurred' }, { status: 500 });
  }
}

export const action = withSecurity(supabaseVariablesAction, {
  allowedMethods: ['POST'],
  rateLimit: true,
});
