import { describe, expect, it } from 'vitest'
import {
  applyArtifactDiff,
  createArtifactDiff,
  createMemoryContext,
  createUsageRecord,
  estimateTokensFromChars,
  filterPromptTemplates,
  finalizeUsageRecord,
  getMemoryForScope,
  isLocalProviderUrl,
  rejectArtifactDiff,
  selectModelForRouter,
  summarizeUsage,
  updateUsageCompletion,
  type MemoryEntry,
  type PromptTemplate
} from './workspaceFeatures'

describe('project memory', () => {
  const entries: MemoryEntry[] = [
    {
      id: 'm1',
      scope: 'project',
      scopeId: 'p1',
      kind: 'decision',
      title: 'Stack',
      content: 'Use Electron and React.',
      enabled: true,
      createdAt: '',
      updatedAt: ''
    },
    {
      id: 'm2',
      scope: 'project',
      scopeId: 'p2',
      kind: 'style',
      title: 'Tone',
      content: 'Strict UI.',
      enabled: true,
      createdAt: '',
      updatedAt: ''
    },
    {
      id: 'm3',
      scope: 'chat',
      scopeId: 'c1',
      kind: 'fact',
      title: 'Hidden',
      content: 'Disabled fact.',
      enabled: false,
      createdAt: '',
      updatedAt: ''
    }
  ]

  it('filters memory by active scopes and formats enabled context', () => {
    const scoped = getMemoryForScope(entries, [
      { scope: 'project', scopeId: 'p1' },
      { scope: 'chat', scopeId: 'c1' }
    ])

    expect(scoped.map((entry) => entry.id)).toEqual(['m1'])
    expect(createMemoryContext(scoped)).toContain('[decision] Stack: Use Electron and React.')
  })
})

describe('prompt templates', () => {
  const prompts: PromptTemplate[] = [
    { id: 'p1', title: 'Release', content: 'Write release notes', tags: ['ship'], createdAt: '', updatedAt: '' },
    { id: 'p2', title: 'Code Review', content: 'Find risks', tags: ['qa'], createdAt: '', updatedAt: '' }
  ]

  it('filters by title, content, and tags', () => {
    expect(filterPromptTemplates(prompts, 'ship').map((prompt) => prompt.id)).toEqual(['p1'])
    expect(filterPromptTemplates(prompts, 'risks').map((prompt) => prompt.id)).toEqual(['p2'])
  })
})

describe('artifact diff', () => {
  it('tracks changed lines and status transitions', () => {
    const diff = createArtifactDiff('d1', 'a\nb', 'a\nc\nd', 'change')

    expect(diff.addedLines).toBe(2)
    expect(diff.removedLines).toBe(1)
    expect(applyArtifactDiff(diff).status).toBe('applied')
    expect(rejectArtifactDiff(diff).status).toBe('rejected')
  })
})

describe('usage and privacy helpers', () => {
  it('estimates usage and summarizes records', () => {
    const startedAt = '2026-06-22T00:00:00.000Z'
    const record = createUsageRecord({
      id: 'u1',
      requestId: 'r1',
      modelId: 'grace-balanced',
      providerKind: 'demo',
      startedAt,
      promptChars: 18,
      localOnly: false
    })
    const completed = finalizeUsageRecord(updateUsageCompletion(record, 20), 'completed', '2026-06-22T00:00:01.000Z')

    expect(estimateTokensFromChars(18)).toBe(5)
    expect(completed.outputTokensEstimate).toBe(5)
    expect(summarizeUsage([completed])).toMatchObject({ totalRequests: 1, completedRequests: 1, averageLatencyMs: 1000 })
  })

  it('detects local provider URLs', () => {
    expect(isLocalProviderUrl('http://localhost:11434/v1')).toBe(true)
    expect(isLocalProviderUrl('http://127.0.0.1:8080/v1')).toBe(true)
    expect(isLocalProviderUrl('https://api.example.com/v1')).toBe(false)
  })

  it('selects router models by mode', () => {
    const models = [
      { id: 'slow', label: 'Claude', provider: 'Anthropic', providerKind: 'demo' as const },
      { id: 'code', label: 'DeepSeek Reasoner', provider: 'DeepSeek', providerKind: 'demo' as const },
      { id: 'local', label: 'Local Draft', provider: 'Local', providerKind: 'demo' as const }
    ]

    expect(selectModelForRouter(models, 'code')?.id).toBe('code')
    expect(selectModelForRouter(models, 'local')?.id).toBe('local')
    expect(selectModelForRouter(models, 'manual')).toBeUndefined()
  })
})
