import { describe, expect, it } from 'vitest'
import { createSetupAgentPlan } from './setupAgent'

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
  })

  it('creates a Notion MCP draft from natural language', () => {
    const plan = createSetupAgentPlan('подключи Notion MCP через npx @notionhq/notion-mcp-server')

    expect(plan.mcpServer).toMatchObject({
      name: 'Notion',
      transport: 'command',
      command: 'npx @notionhq/notion-mcp-server'
    })
  })

  it('creates an HTTP MCP draft when only a url is provided', () => {
    const plan = createSetupAgentPlan('add mcp server https://mcp.example.com')

    expect(plan.mcpServer).toMatchObject({
      name: 'mcp.example.com',
      transport: 'http',
      url: 'https://mcp.example.com'
    })
  })
})
