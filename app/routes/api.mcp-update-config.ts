import type { ActionFunctionArgs } from 'react-router';
import { MCPService, sanitizeMcpServerTools, type MCPConfig } from '~/lib/services/mcpService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.mcp-update-config');

export async function action({ request }: ActionFunctionArgs) {
  try {
    const mcpConfig = (await request.json()) as MCPConfig;

    if (!mcpConfig || typeof mcpConfig !== 'object') {
      return Response.json({ error: 'Invalid MCP servers configuration' }, { status: 400 });
    }

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

    return Response.json(sanitizeMcpServerTools(serverTools));
  } catch (error) {
    logger.error('Error updating MCP config:', error);
    return Response.json({ error: 'Failed to update MCP config' }, { status: 500 });
  }
}
