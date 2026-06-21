import { describe, expect, it } from 'vitest'
import { createDraftTitle, filterModelsByQuery, formatBytes, groupModelsByProvider } from './utils'

describe('formatBytes', () => {
  it('formats bytes and kilobytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })
})

describe('createDraftTitle', () => {
  it('normalizes and truncates chat titles', () => {
    expect(createDraftTitle('   hello    world   ')).toBe('hello world')
    expect(createDraftTitle('a'.repeat(80))).toBe(`${'a'.repeat(39)}...`)
  })
})

describe('groupModelsByProvider', () => {
  it('groups custom models under one provider heading', () => {
    const groups = groupModelsByProvider([
      { id: 'grace-balanced', provider: 'Grace', providerKind: 'demo', hint: 'Balanced' },
      { id: 'custom-a', provider: 'Custom', providerKind: 'custom', hint: 'https://api.example.com/v1' },
      { id: 'custom-b', provider: 'Custom', providerKind: 'custom', hint: 'https://api.example.com/v1' }
    ])

    expect(groups).toHaveLength(2)
    expect(groups[1]).toMatchObject({
      id: 'custom',
      label: 'Custom provider',
      detail: 'https://api.example.com/v1'
    })
    expect(groups[1].models.map((model) => model.id)).toEqual(['custom-a', 'custom-b'])
  })
})

describe('filterModelsByQuery', () => {
  const models = [
    {
      id: 'custom:openai/gpt-4.1-mini',
      modelId: 'openai/gpt-4.1-mini',
      label: 'GPT 4.1 Mini',
      provider: 'Custom',
      providerKind: 'custom' as const,
      description: 'Fast small model',
      hint: 'https://api.example.com/v1'
    },
    {
      id: 'custom:deepseek-reasoner',
      modelId: 'deepseek-reasoner',
      label: 'DeepSeek Reasoner',
      provider: 'Custom',
      providerKind: 'custom' as const,
      description: 'Reasoning model',
      hint: 'https://api.example.com/v1'
    }
  ]

  it('matches partial model names while the user types', () => {
    expect(filterModelsByQuery(models, 'g').map((model) => model.modelId)).toEqual(['openai/gpt-4.1-mini'])
    expect(filterModelsByQuery(models, 'gpt').map((model) => model.modelId)).toEqual(['openai/gpt-4.1-mini'])
  })

  it('matches case-insensitive model ids and multi-token queries', () => {
    expect(filterModelsByQuery(models, 'DEEP reason').map((model) => model.modelId)).toEqual(['deepseek-reasoner'])
  })
})
