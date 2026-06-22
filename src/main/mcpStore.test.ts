import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRedactedMcpEnvText,
  getMcpServerRuntimeConfigs,
  getMcpServerSummaries,
  parseMcpEnvText,
  saveMcpServer,
  updateMcpServer
} from './mcpStore'

const electronMock = vi.hoisted(() => ({
  encryptionAvailable: true,
  userDataPath: ''
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath)
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => electronMock.encryptionAvailable),
    encryptString: vi.fn((value: string) =>
      Buffer.from(`secure:${Buffer.from(value, 'utf8').toString('base64')}`, 'utf8')
    ),
    decryptString: vi.fn((value: Buffer) => {
      const encodedValue = value.toString('utf8').replace(/^secure:/, '')
      return Buffer.from(encodedValue, 'base64').toString('utf8')
    })
  }
}))

describe('MCP store', () => {
  beforeEach(async () => {
    electronMock.encryptionAvailable = true
    electronMock.userDataPath = await mkdtemp(join(tmpdir(), 'grace-mcp-store-'))
  })

  afterEach(async () => {
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  it('parses env text and redacts values by key', () => {
    expect(parseMcpEnvText('NOTION_TOKEN=secret\nexport API_KEY=\"quoted\"\n# comment')).toEqual({
      env: {
        NOTION_TOKEN: 'secret',
        API_KEY: 'quoted'
      },
      keys: ['NOTION_TOKEN', 'API_KEY'],
      hasConfiguredValues: true
    })

    expect(createRedactedMcpEnvText(['NOTION_TOKEN', 'API_KEY'], true)).toBe(
      'NOTION_TOKEN=********\nAPI_KEY=********'
    )
  })

  it('stores MCP env values encrypted and returns redacted summaries', async () => {
    const summary = await saveMcpServer({
      id: 'mcp-notion',
      name: 'Notion',
      transport: 'command',
      command: 'npx @notionhq/notion-mcp-server',
      url: '',
      envText: 'NOTION_TOKEN=secret-token',
      enabled: true
    })

    expect(summary).toMatchObject({
      id: 'mcp-notion',
      envKeys: ['NOTION_TOKEN'],
      envConfigured: true,
      envRedactedText: 'NOTION_TOKEN=********'
    })

    const storedFile = await readFile(join(electronMock.userDataPath, 'mcp-servers.json'), 'utf8')
    expect(storedFile).not.toContain('secret-token')
    expect(storedFile).not.toContain('NOTION_TOKEN=secret-token')

    await updateMcpServer('mcp-notion', { enabled: false })

    expect(await getMcpServerSummaries()).toMatchObject([
      {
        id: 'mcp-notion',
        enabled: false,
        envRedactedText: 'NOTION_TOKEN=********'
      }
    ])
    expect(await getMcpServerRuntimeConfigs()).toMatchObject([
      {
        id: 'mcp-notion',
        enabled: false,
        env: {
          NOTION_TOKEN: 'secret-token'
        }
      }
    ])
  })

  it('tracks required env keys without encrypting empty values', async () => {
    const summary = await saveMcpServer({
      id: 'mcp-empty-env',
      name: 'Preset',
      transport: 'command',
      command: 'npx preset',
      url: '',
      envText: 'API_KEY=',
      enabled: true,
      requiredEnv: ['API_KEY']
    })

    expect(summary.envKeys).toEqual(['API_KEY'])
    expect(summary.envConfigured).toBe(false)
    expect(summary.envRedactedText).toBe('API_KEY=')

    const storedFile = await readFile(join(electronMock.userDataPath, 'mcp-servers.json'), 'utf8')
    expect(storedFile).not.toContain('encryptedEnvText')
  })
})
