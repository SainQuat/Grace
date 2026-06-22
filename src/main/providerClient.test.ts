import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildProviderUrl, checkProviderHealth, normalizeBaseUrl, parseOpenAIModelList } from './providerClient'

afterEach(() => {
  vi.unstubAllGlobals()
})

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

describe('checkProviderHealth', () => {
  it('reports healthy model discovery with latency and selected model availability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'dugin400' }, { id: 'other' }] }), { status: 200 }))
    )

    const result = await checkProviderHealth({
      providerId: 'zed',
      label: 'Zed',
      baseUrl: 'https://api.zed.md/v1',
      apiKey: 'sk-test_123456789',
      selectedModelId: 'dugin400'
    })

    expect(result).toMatchObject({
      providerId: 'zed',
      label: 'Zed',
      baseUrl: 'https://api.zed.md/v1',
      status: 'healthy',
      modelCount: 2,
      selectedModelAvailable: true
    })
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('reports unhealthy model discovery errors without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }))
    )

    const result = await checkProviderHealth({
      providerId: 'custom',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test_123456789'
    })

    expect(result.status).toBe('unhealthy')
    expect(result.message).toContain('bad key')
  })
})
