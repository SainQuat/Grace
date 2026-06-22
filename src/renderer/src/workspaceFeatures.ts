import type { CustomProviderSummary } from '../../shared/types'

export type MemoryScope = 'project' | 'space' | 'chat'
export type MemoryKind = 'decision' | 'fact' | 'instruction' | 'style'

export interface MemoryEntry {
  id: string
  scope: MemoryScope
  scopeId: string
  kind: MemoryKind
  title: string
  content: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface PromptTemplate {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface Checkpoint<TMessage, TWorkspace> {
  id: string
  chatId: string
  title: string
  createdAt: string
  messageCount: number
  snapshot: {
    messages: TMessage[]
    canvasValue: string
    codeWorkspace: TWorkspace
  }
}

export interface ArtifactDiff {
  id: string
  baseContent: string
  nextContent: string
  instruction: string
  status: 'pending' | 'applied' | 'rejected'
  addedLines: number
  removedLines: number
  createdAt: string
}

export interface PrivacySettings {
  localOnly: boolean
  allowNotifications: boolean
  allowRemoteSetupAgent: boolean
}

export type ModelRouterMode = 'manual' | 'fast' | 'smart' | 'code' | 'local'

export interface UsageRecord {
  id: string
  requestId: string
  chatId?: string
  chatTitle?: string
  providerKind: 'demo' | 'custom'
  providerId?: string
  providerLabel?: string
  modelId: string
  startedAt: string
  endedAt?: string
  status: 'running' | 'completed' | 'stopped' | 'error'
  promptChars: number
  completionChars: number
  inputTokensEstimate: number
  outputTokensEstimate: number
  latencyMs?: number
  error?: string
  localOnly: boolean
}

export interface UsageSummary {
  totalRequests: number
  completedRequests: number
  errorRequests: number
  stoppedRequests: number
  inputTokensEstimate: number
  outputTokensEstimate: number
  averageLatencyMs: number
  byModel: Array<{ modelId: string; count: number }>
}

export function getMemoryForScope(entries: MemoryEntry[], scopes: Array<{ scope: MemoryScope; scopeId?: string | null }>): MemoryEntry[] {
  return entries.filter(
    (entry) =>
      entry.enabled &&
      scopes.some((scope) => scope.scopeId && entry.scope === scope.scope && entry.scopeId === scope.scopeId)
  )
}

export function createMemoryContext(entries: MemoryEntry[]): string {
  const enabledEntries = entries.filter((entry) => entry.enabled && entry.content.trim())
  if (!enabledEntries.length) return ''

  return [
    'Project memory for this conversation:',
    ...enabledEntries.map((entry) => `- [${entry.kind}] ${entry.title.trim()}: ${entry.content.trim()}`)
  ].join('\n')
}

export function filterPromptTemplates(prompts: PromptTemplate[], query: string): PromptTemplate[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return prompts

  return prompts.filter((prompt) =>
    [prompt.title, prompt.content, prompt.tags.join(' ')].some((value) => value.toLowerCase().includes(normalizedQuery))
  )
}

export function createArtifactDiff(id: string, baseContent: string, nextContent: string, instruction: string, createdAt = new Date().toISOString()): ArtifactDiff {
  const baseLines = baseContent.split('\n')
  const nextLines = nextContent.split('\n')
  const maxLength = Math.max(baseLines.length, nextLines.length)
  let addedLines = 0
  let removedLines = 0

  for (let index = 0; index < maxLength; index += 1) {
    const baseLine = baseLines[index]
    const nextLine = nextLines[index]
    if (baseLine === nextLine) continue
    if (typeof nextLine === 'string') addedLines += 1
    if (typeof baseLine === 'string') removedLines += 1
  }

  return {
    id,
    baseContent,
    nextContent,
    instruction,
    status: 'pending',
    addedLines,
    removedLines,
    createdAt
  }
}

export function applyArtifactDiff(diff: ArtifactDiff): ArtifactDiff {
  return { ...diff, status: 'applied' }
}

export function rejectArtifactDiff(diff: ArtifactDiff): ArtifactDiff {
  return { ...diff, status: 'rejected' }
}

export function estimateTokensFromChars(chars: number): number {
  return Math.max(0, Math.ceil(chars / 4))
}

export function createUsageRecord(input: Omit<UsageRecord, 'completionChars' | 'inputTokensEstimate' | 'outputTokensEstimate' | 'status'>): UsageRecord {
  return {
    ...input,
    status: 'running',
    completionChars: 0,
    inputTokensEstimate: estimateTokensFromChars(input.promptChars),
    outputTokensEstimate: 0
  }
}

export function updateUsageCompletion(record: UsageRecord, completionChars: number): UsageRecord {
  return {
    ...record,
    completionChars,
    outputTokensEstimate: estimateTokensFromChars(completionChars)
  }
}

export function finalizeUsageRecord(record: UsageRecord, status: UsageRecord['status'], endedAt = new Date().toISOString(), error?: string): UsageRecord {
  return {
    ...record,
    status,
    endedAt,
    latencyMs: Math.max(0, new Date(endedAt).getTime() - new Date(record.startedAt).getTime()),
    error
  }
}

export function summarizeUsage(records: UsageRecord[]): UsageSummary {
  const completed = records.filter((record) => record.status === 'completed')
  const latencyRecords = records.filter((record) => typeof record.latencyMs === 'number')
  const byModelMap = new Map<string, number>()

  for (const record of records) {
    byModelMap.set(record.modelId, (byModelMap.get(record.modelId) ?? 0) + 1)
  }

  return {
    totalRequests: records.length,
    completedRequests: completed.length,
    errorRequests: records.filter((record) => record.status === 'error').length,
    stoppedRequests: records.filter((record) => record.status === 'stopped').length,
    inputTokensEstimate: records.reduce((sum, record) => sum + record.inputTokensEstimate, 0),
    outputTokensEstimate: records.reduce((sum, record) => sum + record.outputTokensEstimate, 0),
    averageLatencyMs: latencyRecords.length
      ? Math.round(latencyRecords.reduce((sum, record) => sum + (record.latencyMs ?? 0), 0) / latencyRecords.length)
      : 0,
    byModel: [...byModelMap.entries()].map(([modelId, count]) => ({ modelId, count })).sort((left, right) => right.count - left.count)
  }
}

export function isLocalProviderUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname)
  } catch {
    return false
  }
}

export function selectModelForRouter<T extends { id: string; label: string; providerKind: 'demo' | 'custom'; provider?: string; hint?: string; supportsEffort?: boolean }>(
  models: T[],
  mode: ModelRouterMode,
  providers: CustomProviderSummary[] = []
): T | undefined {
  if (mode === 'manual') return undefined

  if (mode === 'local') {
    return models.find((model) => {
      if ((model.provider ?? '').toLowerCase().includes('local')) return true
      if (model.providerKind !== 'custom') return false
      const provider = providers.find((candidate) => model.id.startsWith(`${candidate.id}:`))
      return Boolean(provider?.baseUrl && isLocalProviderUrl(provider.baseUrl))
    })
  }

  if (mode === 'code') {
    return models.find((model) => /code|codex|deepseek|reasoner/i.test(`${model.label} ${model.provider}`)) ?? models[0]
  }

  if (mode === 'smart') {
    return models.find((model) => /claude|reasoner|smart|opus|sonnet/i.test(`${model.label} ${model.provider}`)) ?? models[0]
  }

  return models.find((model) => /draft|fast|local|mini/i.test(`${model.label} ${model.provider} ${model.hint ?? ''}`)) ?? models[0]
}
