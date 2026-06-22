import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { McpServerSummary, McpServerTransport, SaveMcpServerPayload, UpdateMcpServerPayload } from '../shared/types'

interface StoredMcpServer {
  id: string
  name: string
  transport: McpServerTransport
  url: string
  command: string
  encryptedEnvText?: string
  envKeys: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
  sourcePresetId?: string
  description?: string
  requiredEnv?: string[]
}

export interface ParsedMcpEnv {
  env: Record<string, string>
  keys: string[]
  hasConfiguredValues: boolean
}

export interface McpServerRuntimeConfig {
  id: string
  name: string
  transport: McpServerTransport
  url: string
  command: string
  env: Record<string, string>
  enabled: boolean
}

const mcpServersFilePath = (): string => join(app.getPath('userData'), 'mcp-servers.json')
const redactedValue = '********'
const envKeyPattern = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/

export async function getMcpServerSummaries(): Promise<McpServerSummary[]> {
  const servers = await readStoredMcpServers()
  return servers.map(toSummary)
}

export async function saveMcpServer(payload: SaveMcpServerPayload): Promise<McpServerSummary> {
  const servers = await readStoredMcpServers()
  const existingServer = payload.id ? servers.find((server) => server.id === payload.id) : undefined
  const nextServer = createStoredMcpServer(payload, existingServer)
  const nextServers = servers.filter((server) => server.id !== nextServer.id).concat(nextServer)

  await writeStoredMcpServers(nextServers)

  return toSummary(nextServer)
}

export async function updateMcpServer(serverId: string, patch: UpdateMcpServerPayload): Promise<McpServerSummary> {
  const servers = await readStoredMcpServers()
  const server = servers.find((candidate) => candidate.id === serverId)

  if (!server) {
    throw new Error('MCP server is not configured.')
  }

  const nextServer = createStoredMcpServer({ ...server, ...patch, id: server.id, createdAt: server.createdAt }, server)
  await writeStoredMcpServers(servers.map((candidate) => (candidate.id === serverId ? nextServer : candidate)))

  return toSummary(nextServer)
}

export async function deleteMcpServer(serverId: string): Promise<void> {
  const servers = await readStoredMcpServers()
  await writeStoredMcpServers(servers.filter((server) => server.id !== serverId))
}

export async function getMcpServerRuntimeConfigs(): Promise<McpServerRuntimeConfig[]> {
  const servers = await readStoredMcpServers()

  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    transport: server.transport,
    url: server.url,
    command: server.command,
    env: parseMcpEnvText(decryptEnvText(server)).env,
    enabled: server.enabled
  }))
}

export function parseMcpEnvText(envText: string): ParsedMcpEnv {
  const env: Record<string, string> = {}
  const keys: string[] = []
  let hasConfiguredValues = false

  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(envKeyPattern)
    if (!match) continue

    const key = match[1]
    const value = stripEnvValueQuotes(match[2].trim())
    env[key] = value

    if (!keys.includes(key)) {
      keys.push(key)
    }

    if (value.length > 0) {
      hasConfiguredValues = true
    }
  }

  return { env, keys, hasConfiguredValues }
}

export function createRedactedMcpEnvText(envKeys: string[], configured: boolean): string {
  if (envKeys.length === 0) {
    return configured ? redactedValue : ''
  }

  return envKeys.map((key) => `${key}=${configured ? redactedValue : ''}`).join('\n')
}

async function readStoredMcpServers(): Promise<StoredMcpServer[]> {
  try {
    const parsed = JSON.parse(await readFile(mcpServersFilePath(), 'utf8')) as { servers?: unknown[] }
    if (!Array.isArray(parsed.servers)) return []

    const servers: StoredMcpServer[] = []
    for (const value of parsed.servers) {
      const server = normalizeStoredMcpServer(value)
      if (server) servers.push(server)
    }
    return servers
  } catch {
    return []
  }
}

async function writeStoredMcpServers(servers: StoredMcpServer[]): Promise<void> {
  const filePath = mcpServersFilePath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify({ servers }, null, 2), 'utf8')
}

function createStoredMcpServer(payload: SaveMcpServerPayload, existingServer?: StoredMcpServer): StoredMcpServer {
  const now = new Date().toISOString()
  const envPatch = Object.prototype.hasOwnProperty.call(payload, 'envText')
    ? encryptEnvText(payload.envText ?? '', payload.requiredEnv ?? existingServer?.requiredEnv)
    : {
        encryptedEnvText: existingServer?.encryptedEnvText,
        envKeys: existingServer?.envKeys ?? normalizeEnvKeys(payload.requiredEnv)
      }

  return {
    id: payload.id ?? existingServer?.id ?? randomUUID(),
    name: payload.name.trim() || existingServer?.name || 'Custom MCP',
    transport: payload.transport,
    url: payload.url.trim(),
    command: payload.command.trim(),
    encryptedEnvText: envPatch.encryptedEnvText,
    envKeys: envPatch.envKeys,
    enabled: payload.enabled ?? existingServer?.enabled ?? true,
    createdAt: payload.createdAt ?? existingServer?.createdAt ?? now,
    updatedAt: now,
    sourcePresetId: payload.sourcePresetId ?? existingServer?.sourcePresetId,
    description: payload.description ?? existingServer?.description,
    requiredEnv: payload.requiredEnv ?? existingServer?.requiredEnv
  }
}

function encryptEnvText(
  envText: string,
  requiredEnv?: string[]
): { encryptedEnvText?: string; envKeys: string[] } {
  const normalizedEnvText = envText.trim()
  const parsedEnv = parseMcpEnvText(normalizedEnvText)
  const envKeys = normalizeEnvKeys([...parsedEnv.keys, ...(requiredEnv ?? [])])
  const shouldEncrypt = parsedEnv.hasConfiguredValues || (normalizedEnvText.length > 0 && parsedEnv.keys.length === 0)

  if (!shouldEncrypt) {
    return { envKeys }
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is not available on this machine.')
  }

  return {
    encryptedEnvText: safeStorage.encryptString(normalizedEnvText).toString('base64'),
    envKeys
  }
}

function decryptEnvText(server: StoredMcpServer): string {
  if (!server.encryptedEnvText) {
    return ''
  }

  return safeStorage.decryptString(Buffer.from(server.encryptedEnvText, 'base64'))
}

function toSummary(server: StoredMcpServer): McpServerSummary {
  const envConfigured = Boolean(server.encryptedEnvText)

  return {
    id: server.id,
    name: server.name,
    transport: server.transport,
    url: server.url,
    command: server.command,
    enabled: server.enabled,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    sourcePresetId: server.sourcePresetId,
    description: server.description,
    requiredEnv: server.requiredEnv,
    envKeys: server.envKeys,
    envConfigured,
    envRedactedText: createRedactedMcpEnvText(server.envKeys, envConfigured)
  }
}

function normalizeStoredMcpServer(value: unknown): StoredMcpServer | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<StoredMcpServer>
  const transport = candidate.transport === 'http' ? 'http' : 'command'
  const envKeys = normalizeEnvKeys(candidate.envKeys ?? candidate.requiredEnv)
  const now = new Date().toISOString()

  return {
    id: String(candidate.id || randomUUID()),
    name: String(candidate.name || 'Custom MCP'),
    transport,
    url: String(candidate.url || ''),
    command: String(candidate.command || ''),
    encryptedEnvText: typeof candidate.encryptedEnvText === 'string' ? candidate.encryptedEnvText : undefined,
    envKeys,
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    createdAt: String(candidate.createdAt || now),
    updatedAt: String(candidate.updatedAt || candidate.createdAt || now),
    sourcePresetId: typeof candidate.sourcePresetId === 'string' ? candidate.sourcePresetId : undefined,
    description: typeof candidate.description === 'string' ? candidate.description : undefined,
    requiredEnv: Array.isArray(candidate.requiredEnv) ? normalizeEnvKeys(candidate.requiredEnv) : undefined
  }
}

function normalizeEnvKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) {
    return []
  }

  const normalizedKeys: string[] = []

  for (const key of keys) {
    const normalizedKey = String(key || '').trim()
    if (normalizedKey && !normalizedKeys.includes(normalizedKey)) {
      normalizedKeys.push(normalizedKey)
    }
  }

  return normalizedKeys
}

function stripEnvValueQuotes(value: string): string {
  if (value.length < 2) {
    return value
  }

  const firstCharacter = value[0]
  const lastCharacter = value[value.length - 1]

  if ((firstCharacter === '"' && lastCharacter === '"') || (firstCharacter === "'" && lastCharacter === "'")) {
    return value.slice(1, -1)
  }

  return value
}
