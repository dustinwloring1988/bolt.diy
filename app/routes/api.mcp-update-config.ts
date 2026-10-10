import type { ActionFunctionArgs } from 'react-router';
import { authorizeMcpRequest } from '~/lib/.server/mcp-auth';
import { withSecurity } from '~/lib/security';
import { MCPService, sanitizeMcpServerTools, mcpConfigSchema } from '~/lib/services/mcpService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.mcp-update-config');

async function updateMcpConfig({ request, context }: ActionFunctionArgs) {
  const denied = await authorizeMcpRequest(request, context.cloudflare?.env);

  if (denied) {
    return denied;
  }

  try {
    const parsedConfig = mcpConfigSchema.safeParse(await request.json());

    if (!parsedConfig.success) {
      return Response.json({ error: 'Invalid MCP servers configuration' }, { status: 400 });
    }

    const mcpConfig = parsedConfig.data;

    const posthog = mcpConfig.mcpServers.posthog;

    const sharedConfig = {
      mcpServers: Object.fromEntries(Object.entries(mcpConfig.mcpServers).filter(([name]) => name !== 'posthog')),
    };

    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.updateConfig(sharedConfig);

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

    return Response.json(sanitizeMcpServerTools(serverTools), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('Error updating MCP config:', error);
    return Response.json({ error: 'Failed to update MCP config' }, { status: 500 });
  }
}

export const action = withSecurity(updateMcpConfig, { allowedMethods: ['POST'] });
