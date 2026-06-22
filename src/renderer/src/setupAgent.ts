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

export type PrivacyLocalOnlyMode = 'on' | 'off'
export type ModelRouterMode = 'manual' | 'fast' | 'smart' | 'code' | 'local'

export type SetupAgentActionType =
  | 'mcp-server'
  | 'provider'
  | 'model'
  | 'theme'
  | 'locale'
  | 'privacy-local-only'
  | 'model-router-mode'
  | 'provider-health'

export interface SetupAgentAction {
  type: SetupAgentActionType
  label: string
}

export interface SetupAgentPlan {
  summary: string
  actions: SetupAgentAction[]
  hasActions: boolean
  remoteSetupText: string
  mcpServer?: ParsedMcpServer
  provider?: ParsedProvider
  selectedModelId?: string
  themeMode?: 'light' | 'dark'
  locale?: 'ru' | 'en'
  privacyLocalOnly?: boolean
  modelRouterMode?: ModelRouterMode
  providerHealthCheck?: boolean
  providerHealthProviderId?: string
  cancelled?: boolean
}

const urlPattern = /https?:\/\/[^\s,)]+/i
const apiKeyPattern = /(?:api\s*key|api[_-]?key|apikey|key|ключ)\s*[:=]?\s*([A-Za-z0-9._-]{10,})/i
const envSecretPattern = /\b[A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*([^\s,;)]+)/i
const envSecretLinePattern = /\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*[^\s,;)]+)/i
const explicitModelPattern = /(?:model|модель)\s*[:=]\s*([A-Za-z0-9._:/-]+)/i
const naturalModelPattern = /(?:model|модель)\s+([A-Za-z0-9._:/-]+)/i
const commandPattern = /\b(npx|node|python|python3|uvx|docker)\s+([^\n]+)/i
const redactedSecret = '[REDACTED_SECRET]'

export function createSetupAgentPlan(input: string): SetupAgentPlan {
  const text = input.trim()
  const lowerText = text.toLowerCase()
  const url = text.match(urlPattern)?.[0] ?? ''
  const apiKey = extractApiKey(text)
  const modelId = extractModelId(text)
  const commandMatch = text.match(commandPattern)
  const command = commandMatch ? commandMatch[0].trim() : ''
  const mentionsMcp = /\bmcp\b|notion|ноушен|ноушн|server|сервер/i.test(text)
  const mentionsProvider = /base\s*url|provider|провайдер|api\s*key|api[_-]?key|apikey|ключ/i.test(text)
  const mentionsProviderHealth = isProviderHealthRequest(text)

  const plan: SetupAgentPlan = {
    summary: 'I prepared a local setup plan.',
    actions: [],
    hasActions: false,
    remoteSetupText: createRemoteSetupText(text)
  }

  if (isCancelSetupRequest(lowerText)) {
    return {
      summary: 'Ок, без изменений.',
      actions: [],
      hasActions: false,
      remoteSetupText: '',
      cancelled: true
    }
  }

  if (mentionsMcp) {
    const name = createMcpName(text, url)
    plan.mcpServer = {
      name,
      transport: url && !command ? 'http' : 'command',
      url: command ? '' : url,
      command,
      envText: extractEnvText(text) || (apiKey ? `API_KEY=${apiKey}` : '')
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

  if (/светл|light/.test(lowerText)) {
    plan.themeMode = 'light'
  } else if (/темн|dark/.test(lowerText)) {
    plan.themeMode = 'dark'
  }

  if (/англ|english|\ben\b/.test(lowerText)) {
    plan.locale = 'en'
  } else if (/рус|russian|\bru\b/.test(lowerText)) {
    plan.locale = 'ru'
  }

  const privacyLocalOnly = parsePrivacyLocalOnly(text)
  if (privacyLocalOnly !== undefined) {
    plan.privacyLocalOnly = privacyLocalOnly
  }

  const modelRouterMode = parseModelRouterMode(text)
  if (modelRouterMode) {
    plan.modelRouterMode = modelRouterMode
  }

  if (mentionsProviderHealth) {
    plan.providerHealthCheck = true
    plan.providerHealthProviderId = parseProviderHealthProviderId(text)
  }

  plan.actions = createSetupActions(plan)
  plan.hasActions = plan.actions.length > 0
  plan.summary = plan.hasActions
    ? `Actions found: ${plan.actions.map((action) => action.label).join(', ')}.`
    : 'No local settings action found. I can still answer with the setup model.'

  return plan
}

export function parsePrivacyLocalOnly(input: string): boolean | undefined {
  const text = input.toLowerCase()
  const mentionsLocalOnly = /\blocal[-_\s]?only\b|только\s+локально|локальн/i.test(text)
  const mentionsPrivacy = /\bprivacy\b|приватн|конфиденц/i.test(text)
  if (!mentionsLocalOnly && !(mentionsPrivacy && /\blocal\b|локальн/i.test(text))) return undefined

  if (/\b(off|disable|disabled|false|no)\b|выключ|отключ|не\s+только\s+локально/i.test(text)) {
    return false
  }
  if (/\b(on|enable|enabled|true|yes)\b|включ|только\s+локально/i.test(text)) {
    return true
  }

  return undefined
}

export function parsePrivacyLocalOnlyMode(input: string): PrivacyLocalOnlyMode | undefined {
  const parsed = parsePrivacyLocalOnly(input)
  if (parsed === undefined) return undefined
  return parsed ? 'on' : 'off'
}

export function parseModelRouterMode(input: string): ModelRouterMode | undefined {
  const text = input.toLowerCase()
  const mentionsRouter = /\brouter\b|\brouting\b|\broute\b|маршрут|роутер|режим\s+модел/i.test(text)
  if (!mentionsRouter) return undefined

  const modes: Array<[ModelRouterMode, RegExp]> = [
    ['manual', /\bmanual\b|ручн/i],
    ['fast', /\bfast\b|быстр/i],
    ['smart', /\bsmart\b|умн/i],
    ['code', /\bcode\b|код/i],
    ['local', /\blocal\b|локальн/i]
  ]

  return modes.find(([, pattern]) => pattern.test(text))?.[0]
}

export function isProviderHealthRequest(input: string): boolean {
  const text = input.toLowerCase()
  const mentionsProvider =
    /\bprovider\b|провайдер|openai|anthropic|claude|deepseek|openrouter|groq|gemini|mistral|xai|zed|ollama|lm\s*studio|custom/i.test(
      text
    )
  const mentionsHealth = /\bhealth\b|\bstatus\b|\bcheck\b|\btest\b|\brefresh\b|провер|статус|здоров|обнов/i.test(text)

  return mentionsProvider && mentionsHealth
}

export function parseProviderHealthProviderId(input: string): string | undefined {
  const text = input.toLowerCase()
  const providers: Array<[string, RegExp]> = [
    ['openrouter', /\bopenrouter\b/],
    ['lmstudio', /\blm\s*studio\b|\blmstudio\b/],
    ['anthropic', /\banthropic\b|\bclaude\b/],
    ['deepseek', /\bdeepseek\b/],
    ['openai', /\bopenai\b|\bcodex\b/],
    ['gemini', /\bgemini\b|\bgoogle\b/],
    ['mistral', /\bmistral\b/],
    ['ollama', /\bollama\b/],
    ['custom', /\bcustom\b|кастом/i],
    ['groq', /\bgroq\b/],
    ['zed', /\bzed\b/],
    ['xai', /\bxai\b|\bgrok\b/]
  ]

  return providers.find(([, pattern]) => pattern.test(text))?.[0]
}

export function createRemoteSetupText(input: string): string {
  return redactSetupSecrets(input.trim())
}

export function redactSetupSecrets(input: string): string {
  return input
    .replace(/\b([A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*)([^\s,;)]+)/g, `$1${redactedSecret}`)
    .replace(/("?(?:api[_-]?key|apikey|token|secret|password)"?\s*:\s*"?)([^"\s,;}]{10,})("?)/gi, `$1${redactedSecret}$3`)
    .replace(/\b((?:api\s*key|api[_-]?key|apikey|key|ключ)\s*[:=]?\s*)([A-Za-z0-9._-]{10,})/gi, `$1${redactedSecret}`)
    .replace(/\b(authorization\s*:\s*(?:bearer\s+)?)([A-Za-z0-9._~-]{10,})/gi, `$1${redactedSecret}`)
    .replace(/\b(bearer\s+)([A-Za-z0-9._~-]{10,})/gi, `$1${redactedSecret}`)
    .replace(/\b(sk-[A-Za-z0-9._-]{10,}|sk_[A-Za-z0-9._-]{10,})\b/g, redactedSecret)
}

export function shouldAskRemoteSetupAgent(args: {
  allowRemoteSetupAgent: boolean
  localOnly: boolean
  planPrivacyLocalOnly?: boolean
  remoteSetupText: string
}): boolean {
  const localOnlyAfterPlan = args.planPrivacyLocalOnly ?? args.localOnly
  return args.allowRemoteSetupAgent && !localOnlyAfterPlan && Boolean(args.remoteSetupText)
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

function extractApiKey(text: string): string {
  return text.match(apiKeyPattern)?.[1] ?? text.match(envSecretPattern)?.[1] ?? ''
}

function extractEnvText(text: string): string {
  return text.match(envSecretLinePattern)?.[1]?.trim() ?? ''
}

function extractModelId(text: string): string {
  const explicitModel = text.match(explicitModelPattern)?.[1]
  if (explicitModel) return explicitModel

  const naturalModel = text.match(naturalModelPattern)?.[1]
  if (naturalModel && !isReservedModelToken(naturalModel)) {
    return naturalModel
  }

  return text.toLowerCase().includes('dugin400') ? 'dugin400' : ''
}

function isReservedModelToken(value: string): boolean {
  return /^(router|routing|route|mode|manual|fast|smart|code|local)$/i.test(value)
}

function isCancelSetupRequest(lowerText: string): boolean {
  return /^(нет|no|cancel|stop|отмена|отмени|не надо|ничего|ничего не меняй|без изменений)$/i.test(lowerText)
}

function createSetupActions(plan: SetupAgentPlan): SetupAgentAction[] {
  const actions: SetupAgentAction[] = []
  if (plan.mcpServer) actions.push({ type: 'mcp-server', label: `MCP: ${plan.mcpServer.name}` })
  if (plan.provider) actions.push({ type: 'provider', label: `provider: ${plan.provider.baseUrl}` })
  if (plan.selectedModelId) actions.push({ type: 'model', label: `model: ${plan.selectedModelId}` })
  if (plan.themeMode) actions.push({ type: 'theme', label: `theme: ${plan.themeMode}` })
  if (plan.locale) actions.push({ type: 'locale', label: `language: ${plan.locale}` })
  if (plan.privacyLocalOnly !== undefined) {
    actions.push({ type: 'privacy-local-only', label: `privacy local-only: ${plan.privacyLocalOnly ? 'on' : 'off'}` })
  }
  if (plan.modelRouterMode) {
    actions.push({ type: 'model-router-mode', label: `model router: ${plan.modelRouterMode}` })
  }
  if (plan.providerHealthCheck) {
    actions.push({
      type: 'provider-health',
      label: `provider health: ${plan.providerHealthProviderId ?? 'configured provider'}`
    })
  }
  return actions
}
