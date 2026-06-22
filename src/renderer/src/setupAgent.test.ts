import { describe, expect, it } from 'vitest'
import {
  createRemoteSetupText,
  createSetupAgentPlan,
  parseModelRouterMode,
  parsePrivacyLocalOnly,
  parsePrivacyLocalOnlyMode,
  redactSetupSecrets,
  shouldAskRemoteSetupAgent
} from './setupAgent'

describe('createSetupAgentPlan', () => {
  it('extracts custom provider credentials and model', () => {
    const plan = createSetupAgentPlan('Base URL: https://api.zed.md/v1 key sk-test_123456789 model dugin400')

    expect(plan.provider).toMatchObject({
      providerId: 'zed',
      baseUrl: 'https://api.zed.md/v1',
      apiKey: 'sk-test_123456789',
      modelId: 'dugin400'
    })
    expect(plan.selectedModelId).toBe('dugin400')
    expect(plan.hasActions).toBe(true)
    expect(plan.actions.map((action) => action.type)).toEqual(['provider', 'model'])
    expect(plan.summary).toContain('Actions found:')
    expect(plan.remoteSetupText).not.toContain('sk-test_123456789')
    expect(plan.remoteSetupText).toContain('[REDACTED_SECRET]')
  })

  it('creates a Notion MCP draft from natural language', () => {
    const plan = createSetupAgentPlan('подключи Notion MCP через npx @notionhq/notion-mcp-server')

    expect(plan.mcpServer).toMatchObject({
      name: 'Notion',
      transport: 'command',
      command: 'npx @notionhq/notion-mcp-server'
    })
  })

  it('preserves MCP env variable names while redacting remote setup text', () => {
    const plan = createSetupAgentPlan('подключи Notion MCP через npx @notionhq/notion-mcp-server NOTION_TOKEN=secret_123456789')

    expect(plan.mcpServer?.envText).toBe('NOTION_TOKEN=secret_123456789')
    expect(plan.remoteSetupText).toContain('NOTION_TOKEN=[REDACTED_SECRET]')
    expect(plan.remoteSetupText).not.toContain('secret_123456789')
  })

  it('creates an HTTP MCP draft when only a url is provided', () => {
    const plan = createSetupAgentPlan('add mcp server https://mcp.example.com')

    expect(plan.mcpServer).toMatchObject({
      name: 'mcp.example.com',
      transport: 'http',
      url: 'https://mcp.example.com'
    })
  })

  it('detects theme and language commands', () => {
    expect(createSetupAgentPlan('смени тему на светлую')).toMatchObject({
      themeMode: 'light'
    })
    expect(createSetupAgentPlan('переключи язык на английский')).toMatchObject({
      locale: 'en'
    })
  })

  it('detects privacy local-only commands deterministically', () => {
    expect(parsePrivacyLocalOnly('set privacy local-only on')).toBe(true)
    expect(parsePrivacyLocalOnlyMode('set privacy local-only off')).toBe('off')
    expect(createSetupAgentPlan('включи только локально')).toMatchObject({
      privacyLocalOnly: true,
      hasActions: true
    })
    expect(createSetupAgentPlan('отключи local-only')).toMatchObject({
      privacyLocalOnly: false
    })
  })

  it('detects model router modes without treating router as a model id', () => {
    const modes = ['manual', 'fast', 'smart', 'code', 'local'] as const

    for (const mode of modes) {
      expect(parseModelRouterMode(`model router mode ${mode}`)).toBe(mode)
      const plan = createSetupAgentPlan(`model router mode ${mode}`)
      expect(plan.modelRouterMode).toBe(mode)
      expect(plan.selectedModelId).toBeUndefined()
    }
  })

  it('redacts secrets before optional remote setup text', () => {
    const remoteText = createRemoteSetupText(
      'Base URL: https://api.example.com/v1 OPENAI_API_KEY=sk-test_123456789 Authorization: Bearer abcDEF123456789'
    )

    expect(remoteText).not.toContain('sk-test_123456789')
    expect(remoteText).not.toContain('abcDEF123456789')
    expect(remoteText).toContain('OPENAI_API_KEY=[REDACTED_SECRET]')
    expect(remoteText).toContain('Authorization: Bearer [REDACTED_SECRET]')
    expect(redactSetupSecrets('{"apiKey":"sk-json_123456789"}')).toBe('{"apiKey":"[REDACTED_SECRET]"}')
  })

  it('blocks remote setup when local-only is active or enabled by the current plan', () => {
    expect(
      shouldAskRemoteSetupAgent({
        allowRemoteSetupAgent: true,
        localOnly: false,
        planPrivacyLocalOnly: true,
        remoteSetupText: 'safe setup text'
      })
    ).toBe(false)
    expect(
      shouldAskRemoteSetupAgent({
        allowRemoteSetupAgent: true,
        localOnly: true,
        remoteSetupText: 'safe setup text'
      })
    ).toBe(false)
    expect(
      shouldAskRemoteSetupAgent({
        allowRemoteSetupAgent: true,
        localOnly: false,
        remoteSetupText: 'safe setup text'
      })
    ).toBe(true)
  })

  it('reports no actions when no deterministic local action is found', () => {
    const plan = createSetupAgentPlan('что умеет setup agent?')

    expect(plan.hasActions).toBe(false)
    expect(plan.actions).toEqual([])
    expect(plan.summary).toBe('No local settings action found. I can still answer with the setup model.')
  })

  it('detects cancel responses without remote-only actions', () => {
    expect(createSetupAgentPlan('без изменений')).toEqual({
      cancelled: true,
      summary: 'Ок, без изменений.',
      actions: [],
      hasActions: false,
      remoteSetupText: ''
    })
  })
})
