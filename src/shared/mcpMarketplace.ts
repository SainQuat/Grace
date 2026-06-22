export interface McpMarketplacePreset {
  id: string
  name: string
  description: string
  transport: 'http' | 'command'
  url?: string
  command?: string
  requiredEnv: string[]
}

export const mcpMarketplacePresets: McpMarketplacePreset[] = [
  {
    id: 'notion',
    name: 'Notion',
    description: 'Pages, databases, notes, and workspace knowledge.',
    transport: 'command',
    command: 'npx @notionhq/notion-mcp-server',
    requiredEnv: ['NOTION_TOKEN']
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repositories, issues, pull requests, and code search.',
    transport: 'command',
    command: 'npx @modelcontextprotocol/server-github',
    requiredEnv: ['GITHUB_TOKEN']
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Issues, cycles, projects, and product planning.',
    transport: 'command',
    command: 'npx @modelcontextprotocol/server-linear',
    requiredEnv: ['LINEAR_API_KEY']
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Docs and files from a shared drive workspace.',
    transport: 'command',
    command: 'npx @modelcontextprotocol/server-gdrive',
    requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Channels, threads, and team context.',
    transport: 'command',
    command: 'npx @modelcontextprotocol/server-slack',
    requiredEnv: ['SLACK_BOT_TOKEN']
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Local project files for private workspace automation.',
    transport: 'command',
    command: 'npx @modelcontextprotocol/server-filesystem ~/Documents',
    requiredEnv: []
  }
]

export function filterMcpMarketplacePresets(query: string): McpMarketplacePreset[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return mcpMarketplacePresets

  return mcpMarketplacePresets.filter((preset) =>
    [preset.name, preset.description, preset.command ?? '', preset.url ?? '', preset.requiredEnv.join(' ')].some((value) =>
      value.toLowerCase().includes(normalizedQuery)
    )
  )
}
