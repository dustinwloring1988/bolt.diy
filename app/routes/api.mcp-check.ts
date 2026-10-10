import type { ActionFunctionArgs } from 'react-router';
import { authorizeMcpRequest } from '~/lib/.server/mcp-auth';
import { withSecurity } from '~/lib/security';
import { MCPService, sanitizeMcpServerTools, mcpConfigSchema } from '~/lib/services/mcpService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.mcp-check');

async function checkMcpServers({ request, context }: ActionFunctionArgs) {
  const denied = await authorizeMcpRequest(request, context.cloudflare?.env);

  if (denied) {
    return denied;
  }

  try {
    const config = request.method === 'POST' ? mcpConfigSchema.safeParse(await request.json()) : undefined;

    if (config && !config.success) {
      return Response.json({ error: 'Invalid MCP servers configuration' }, { status: 400 });
    }

    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.checkServersAvailabilities();

    if (request.method === 'POST') {
      const posthog = config?.data?.mcpServers.posthog;

      if (posthog) {
        const personalService = new MCPService();

        try {
          const personalTools = await personalService.updateConfig({ mcpServers: { posthog } });
          serverTools.posthog = personalTools.posthog;
        } finally {
          await personalService.close();
        }
      } else {
        delete serverTools.posthog;
      }
    }

    return Response.json(sanitizeMcpServerTools(serverTools), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('Error checking MCP servers:', error);
    return Response.json({ error: 'Failed to check MCP servers' }, { status: 500 });
  }
}

export const loader = withSecurity(checkMcpServers, { allowedMethods: ['GET'] });
export const action = withSecurity(checkMcpServers, { allowedMethods: ['POST'] });
