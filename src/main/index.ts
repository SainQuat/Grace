import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type { ChatRequestPayload, SaveCustomProviderPayload, SetupAgentRequestPayload } from '../shared/types'
import { getProviderPreset } from '../shared/providerPresets'
import { fetchProviderModels, normalizeBaseUrl, streamProviderChat } from './providerClient'
import {
  getCustomProviderSecret,
  getCustomProviderSummary,
  getProviderSummaries,
  saveCustomProvider,
  updateCustomProviderModels
} from './providerStore'

const activeRequests = new Map<string, { stopped: boolean; abortController?: AbortController }>()

const isDevUrl = process.env.ELECTRON_RENDERER_URL

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    title: 'Grace',
    backgroundColor: '#11100f',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (isDevUrl) {
    mainWindow.loadURL(isDevUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.on('chat:start', async (event, payload: ChatRequestPayload) => {
    const requestId = payload?.requestId

    if (!requestId || !Array.isArray(payload.messages)) {
      event.sender.send('chat:event', {
        type: 'error',
        requestId: requestId || 'unknown',
        message: 'Invalid chat request.'
      })
      return
    }

    const requestState = { stopped: false }
    activeRequests.set(requestId, requestState)

    try {
      for await (const chunk of createStream(payload, requestState)) {
        if (requestState.stopped || event.sender.isDestroyed()) {
          break
        }

        event.sender.send('chat:event', { type: 'delta', requestId, text: chunk })
      }

      if (!event.sender.isDestroyed()) {
        event.sender.send('chat:event', { type: 'done', requestId })
      }
    } catch (error) {
      if (isAbortError(error)) {
        if (!event.sender.isDestroyed()) {
          event.sender.send('chat:event', { type: 'done', requestId })
        }
        return
      }

      if (!event.sender.isDestroyed()) {
        event.sender.send('chat:event', {
          type: 'error',
          requestId,
          message: error instanceof Error ? error.message : 'Unknown generation error.'
        })
      }
    } finally {
      activeRequests.delete(requestId)
    }
  })

  ipcMain.on('chat:stop', (_event, requestId: string) => {
    const requestState = activeRequests.get(requestId)
    if (requestState) {
      requestState.stopped = true
      requestState.abortController?.abort()
    }
  })

  ipcMain.handle('provider:get-custom', async () => getCustomProviderSummary())
  ipcMain.handle('provider:get-all', async () => getProviderSummaries())

  ipcMain.handle('provider:save-custom', async (_event, payload: SaveCustomProviderPayload) => {
    const preset = getProviderPreset(payload.providerId)
    const baseUrl = normalizeBaseUrl(payload.baseUrl)
    const apiKey = payload.apiKey.trim()
    const models = await fetchProviderModels(baseUrl, apiKey, preset.apiFormat)

    return saveCustomProvider({
      providerId: preset.id,
      label: preset.label,
      apiFormat: preset.apiFormat,
      baseUrl,
      apiKey,
      models
    })
  })

  ipcMain.handle('provider:refresh-custom-models', async (_event, providerId = 'custom') => {
    const secret = await getCustomProviderSecret(providerId)
    if (!secret) {
      throw new Error('Provider is not configured.')
    }

    const models = await fetchProviderModels(secret.baseUrl, secret.apiKey, secret.apiFormat)
    return updateCustomProviderModels(providerId, models)
  })

  ipcMain.handle('setup-agent:ask', async (_event, payload: SetupAgentRequestPayload) => {
    const providerId = payload.providerId ?? 'custom'
    const secret = await getCustomProviderSecret(providerId)
    const modelId = payload.modelId || 'dugin400'

    if (!secret) {
      return {
        configured: false,
        modelId,
        content: 'Setup agent provider is not configured yet.'
      }
    }

    const requestPayload: ChatRequestPayload = {
      requestId: `setup-agent-${Date.now()}`,
      providerKind: 'custom',
      providerId,
      modelId,
      effort: 'medium',
      tools: [],
      files: [],
      messages: [
        {
          role: 'user',
          content:
            'You are Grace setup agent. Answer briefly in Russian. Help configure providers, models, skills, and MCP servers. Never print API keys back.'
        },
        ...payload.messages
      ]
    }

    const abortController = new AbortController()
    let content = ''

    for await (const chunk of streamProviderChat(
      secret.baseUrl,
      secret.apiKey,
      requestPayload,
      abortController.signal,
      secret.apiFormat
    )) {
      content += chunk
    }

    return {
      configured: true,
      modelId,
      content: content || 'Готово.'
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

async function* createStream(
  payload: ChatRequestPayload,
  requestState: { stopped: boolean; abortController?: AbortController }
): AsyncGenerator<string> {
  if (payload.providerKind !== 'custom') {
    yield* createDemoStream(payload)
    return
  }

  const secret = await getCustomProviderSecret(payload.providerId ?? 'custom')
  if (!secret) {
    throw new Error('Provider is not configured.')
  }

  requestState.abortController = new AbortController()
  yield* streamProviderChat(secret.baseUrl, secret.apiKey, payload, requestState.abortController.signal, secret.apiFormat)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

async function* createDemoStream(payload: ChatRequestPayload): AsyncGenerator<string> {
  const latestUserMessage = [...payload.messages].reverse().find((message) => message.role === 'user')
  const prompt = latestUserMessage?.content.trim() || 'new conversation'
  const selectedTools = payload.tools.length > 0 ? payload.tools.join(', ') : 'no tools'
  const attachedFiles =
    payload.files.length > 0 ? payload.files.map((file) => file.name).join(', ') : 'no attached files'

  const response = [
    `I can help with "${prompt}". `,
    `For this demo response I am using ${payload.modelId} with ${payload.effort} reasoning effort. `,
    `Selected tools: ${selectedTools}. Attached files: ${attachedFiles}.`,
    '\n\nHere is a practical first pass:\n\n',
    '1. Clarify the output you need.\n',
    '2. Draft the smallest useful version.\n',
    '3. Iterate with concrete examples or files.\n\n',
    '```ts\n',
    'type NextStep = "draft" | "review" | "ship"\n',
    'const nextStep: NextStep = "draft"\n',
    '```\n\n',
    'When provider keys are connected, this stream will come from the selected model through the Electron main process.'
  ].join('')

  for (const chunk of splitIntoChunks(response, 18)) {
    await delay(42)
    yield chunk
  }
}

function splitIntoChunks(value: string, size: number): string[] {
  const chunks: string[] = []
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size))
  }
  return chunks
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
