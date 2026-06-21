export interface ParsedMcpServer {
  name: string
  transport: 'http' | 'command'
  url: string
  command: string
  envText: string
}

export interface ParsedProvider {
  providerId: string
  baseUrl: string
  apiKey: string
  modelId: string
}

export interface SetupAgentPlan {
  summary: string
  mcpServer?: ParsedMcpServer
  provider?: ParsedProvider
  selectedModelId?: string
}

const urlPattern = /https?:\/\/[^\s,)]+/i
const apiKeyPattern = /(?:api\s*key|apikey|key|ключ)\s*[:=]?\s*([A-Za-z0-9._-]{10,})/i
const modelPattern = /(?:model|модель)\s*[:=]?\s*([A-Za-z0-9._:/-]+)/i
const commandPattern = /\b(npx|node|python|python3|uvx|docker)\s+([^\n]+)/i

export function createSetupAgentPlan(input: string): SetupAgentPlan {
  const text = input.trim()
  const lowerText = text.toLowerCase()
  const url = text.match(urlPattern)?.[0] ?? ''
  const apiKey = text.match(apiKeyPattern)?.[1] ?? ''
  const explicitModel = text.match(modelPattern)?.[1] ?? ''
  const modelId = explicitModel || (lowerText.includes('dugin400') ? 'dugin400' : '')
  const commandMatch = text.match(commandPattern)
  const command = commandMatch ? commandMatch[0].trim() : ''
  const mentionsMcp = /\bmcp\b|notion|ноушен|ноушн|server|сервер/i.test(text)
  const mentionsProvider = /base\s*url|provider|провайдер|api\s*key|apikey|ключ/i.test(text)

  const plan: SetupAgentPlan = {
    summary: 'I prepared a local setup plan.'
  }

  if (mentionsMcp) {
    const name = createMcpName(text, url)
    plan.mcpServer = {
      name,
      transport: url && !command ? 'http' : 'command',
      url: command ? '' : url,
      command,
      envText: apiKey ? `API_KEY=${apiKey}` : ''
    }
  }

  if (mentionsProvider && url && apiKey) {
    plan.provider = {
      providerId: url.includes('api.zed.md') ? 'zed' : 'custom',
      baseUrl: url,
      apiKey,
      modelId: modelId || 'dugin400'
    }
  }

  if (modelId) {
    plan.selectedModelId = modelId
  }

  const actions: string[] = []
  if (plan.mcpServer) actions.push(`MCP: ${plan.mcpServer.name}`)
  if (plan.provider) actions.push(`provider: ${plan.provider.baseUrl}`)
  if (plan.selectedModelId) actions.push(`model: ${plan.selectedModelId}`)
  plan.summary = actions.length > 0 ? `Prepared ${actions.join(', ')}.` : 'No local settings action found. I can still answer with the setup model.'

  return plan
}

function createMcpName(text: string, url: string): string {
  if (/notion|ноушен|ноушн/i.test(text)) return 'Notion'
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return 'Custom MCP'
    }
  }
  return 'Custom MCP'
}
