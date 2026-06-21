import { describe, expect, it } from 'vitest'
import {
  createDraftTitle,
  createNotificationBody,
  filterModelsByQuery,
  filterSkillsByQuery,
  formatBytes,
  getLeadingSkillMentionQuery,
  groupModelsByProvider
} from './utils'

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

describe('createNotificationBody', () => {
  it('normalizes streamed response whitespace', () => {
    expect(createNotificationBody('  Done.\n\nHere is   the answer.  ')).toBe('Done. Here is the answer.')
  })

  it('truncates long responses for desktop notifications', () => {
    expect(createNotificationBody('a'.repeat(20), 12)).toBe('aaaaaaaaa...')
  })
})

describe('groupModelsByProvider', () => {
  it('groups custom models under one provider heading', () => {
    const groups = groupModelsByProvider([
      { id: 'grace-balanced', provider: 'Grace', providerKind: 'demo', hint: 'Balanced' },
      { id: 'custom-a', provider: 'Custom provider', providerKind: 'custom', providerId: 'custom', hint: 'https://api.example.com/v1' },
      { id: 'custom-b', provider: 'Custom provider', providerKind: 'custom', providerId: 'custom', hint: 'https://api.example.com/v1' }
    ])

    expect(groups).toHaveLength(2)
    expect(groups[1]).toMatchObject({
      id: 'custom:custom',
      label: 'Custom provider',
      detail: 'https://api.example.com/v1'
    })
    expect(groups[1].models.map((model) => model.id)).toEqual(['custom-a', 'custom-b'])
  })

  it('keeps configured providers in separate groups', () => {
    const groups = groupModelsByProvider([
      { id: 'openai:gpt-4.1', provider: 'OpenAI / Codex', providerKind: 'custom', providerId: 'openai' },
      { id: 'anthropic:claude-sonnet', provider: 'Anthropic', providerKind: 'custom', providerId: 'anthropic' }
    ])

    expect(groups.map((group) => group.label)).toEqual(['OpenAI / Codex', 'Anthropic'])
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

describe('getLeadingSkillMentionQuery', () => {
  it('detects an @ skill query at the start of the composer', () => {
    expect(getLeadingSkillMentionQuery('@')).toBe('')
    expect(getLeadingSkillMentionQuery('@open')).toBe('open')
  })

  it('ignores regular messages and multiline text', () => {
    expect(getLeadingSkillMentionQuery('hello @open')).toBeNull()
    expect(getLeadingSkillMentionQuery('@open\nnext')).toBeNull()
  })
})

describe('filterSkillsByQuery', () => {
  const skills = [
    {
      id: 'open-dynamic-workflows',
      name: 'Open Dynamic Workflows',
      description: 'Fan out subtasks to coding agents.',
      appliesTo: ['Multi-agent fan-out', 'Review pipelines']
    },
    {
      id: 'release-notes',
      name: 'Release Notes',
      description: 'Write readable release copy.',
      appliesTo: ['Shipping', 'Changelog']
    }
  ]

  it('filters skills while the user types', () => {
    expect(filterSkillsByQuery(skills, 'open').map((skill) => skill.id)).toEqual(['open-dynamic-workflows'])
    expect(filterSkillsByQuery(skills, 'release copy').map((skill) => skill.id)).toEqual(['release-notes'])
  })
})
