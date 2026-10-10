import type { ActionFunctionArgs } from 'react-router';
import { withSecurity } from '~/lib/security';
import type { SupabaseProject } from '~/types/supabase';

async function supabaseAction({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = (await request.json()) as { token?: string };
    const cloudflareEnv = context?.cloudflare?.env as { SUPABASE_ACCESS_TOKEN?: string } | undefined;
    const token = body.token || cloudflareEnv?.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN;

    if (!token) {
      return Response.json({ error: 'Supabase management token is not configured' }, { status: 401 });
    }

    const projectsResponse = await fetch('https://api.supabase.com/v1/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!projectsResponse.ok) {
      const errorText = await projectsResponse.text();
      console.error('Projects fetch failed:', errorText);

      return Response.json(
        { error: 'Failed to fetch projects' },
        { status: projectsResponse.status === 401 || projectsResponse.status === 403 ? projectsResponse.status : 502 },
      );
    }

    const projects = (await projectsResponse.json()) as SupabaseProject[];

    const uniqueProjectsMap = new Map<string, SupabaseProject>();

    for (const project of projects) {
      if (!uniqueProjectsMap.has(project.id)) {
        uniqueProjectsMap.set(project.id, project);
      }
    }

    const uniqueProjects = Array.from(uniqueProjectsMap.values());

    uniqueProjects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return Response.json({
      user: { email: 'Connected', role: 'Admin' },
      stats: {
        projects: uniqueProjects,
        totalProjects: uniqueProjects.length,
      },
    });
  } catch (error) {
    console.error('Supabase API error:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Authentication failed',
      },
      { status: 502 },
    );
  }
}

export const action = withSecurity(supabaseAction, {
  allowedMethods: ['POST'],
  rateLimit: true,
});
