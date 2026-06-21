import { describe, expect, it } from 'vitest'
import { buildProviderUrl, normalizeBaseUrl, parseOpenAIModelList } from './providerClient'

describe('normalizeBaseUrl', () => {
  it('trims trailing slashes and keeps /v1 path', () => {
    expect(normalizeBaseUrl(' https://api.example.com/v1/// ')).toBe('https://api.example.com/v1')
  })

  it('allows local http endpoints', () => {
    expect(normalizeBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1')
  })

  it('rejects non-local http endpoints', () => {
    expect(() => normalizeBaseUrl('http://api.example.com/v1')).toThrow('HTTPS')
  })
})

describe('buildProviderUrl', () => {
  it('builds OpenAI-compatible endpoint URLs', () => {
    expect(buildProviderUrl('https://api.example.com/v1/', '/models')).toBe('https://api.example.com/v1/models')
  })
})

describe('parseOpenAIModelList', () => {
  it('parses OpenAI-compatible data arrays', () => {
    expect(
      parseOpenAIModelList({
        data: [
          { id: 'model-a', owned_by: 'provider' },
          { id: 'model-b', name: 'Model B', created: 123 },
          { id: 'model-a' }
        ]
      })
    ).toEqual([
      { id: 'model-a', label: 'model-a', ownedBy: 'provider', created: undefined },
      { id: 'model-b', label: 'Model B', ownedBy: undefined, created: 123 }
    ])
  })

  it('parses direct arrays', () => {
    expect(parseOpenAIModelList([{ id: 'one' }])).toEqual([
      { id: 'one', label: 'one', ownedBy: undefined, created: undefined }
    ])
  })
})
