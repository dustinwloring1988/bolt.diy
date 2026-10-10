import type { ActionFunctionArgs } from 'react-router';
import { MCPService, sanitizeMcpServerTools, type MCPConfig } from '~/lib/services/mcpService';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.mcp-check');

async function checkMcpServers(request: Request) {
  try {
    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.checkServersAvailabilities();

    if (request.method === 'POST') {
      const config = (await request.json()) as MCPConfig;
      const posthog = config?.mcpServers?.posthog;

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

    return Response.json(sanitizeMcpServerTools(serverTools));
  } catch (error) {
    logger.error('Error checking MCP servers:', error);
    return Response.json({ error: 'Failed to check MCP servers' }, { status: 500 });
  }
}

export async function loader({ request }: ActionFunctionArgs) {
  return checkMcpServers(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return checkMcpServers(request);
}
