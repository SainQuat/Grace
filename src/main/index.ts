import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import { join } from 'node:path'
import { createDemoStream } from '../shared/demoStream'
import { getProviderPreset } from '../shared/providerPresets'
import type {
  ChatRequestPayload,
  ResponseNotificationPayload,
  ResponseNotificationResult,
  SaveCustomProviderPayload,
  SetupAgentRequestPayload
} from '../shared/types'
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

if (process.platform === 'win32') {
  app.setAppUserModelId('com.sainquat.grace')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    title: 'Grace',
    backgroundColor: '#0b0f17',
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
        message: 'Некорректный запрос чата.'
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
          message: error instanceof Error ? error.message : 'Неизвестная ошибка генерации.'
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
      throw new Error('Свой провайдер не настроен.')
    }

    const models = await fetchProviderModels(secret.baseUrl, secret.apiKey, secret.apiFormat)
    return updateCustomProviderModels(providerId, models)
  })

  ipcMain.handle(
    'notification:show-response',
    (event, payload: ResponseNotificationPayload): ResponseNotificationResult => {
      const sourceWindow = BrowserWindow.fromWebContents(event.sender)
      const title = String(payload?.title || 'Grace').trim().slice(0, 90) || 'Grace'
      const body = String(payload?.body || '').trim()

      if (!body) {
        return { shown: false, reason: 'empty' }
      }

      if (sourceWindow?.isFocused()) {
        return { shown: false, reason: 'focused' }
      }

      if (!Notification.isSupported()) {
        return { shown: false, reason: 'unsupported' }
      }

      try {
        const notification = new Notification({ title, body })

        notification.on('click', () => {
          if (!sourceWindow || sourceWindow.isDestroyed()) {
            return
          }

          if (sourceWindow.isMinimized()) {
            sourceWindow.restore()
          }

          sourceWindow.show()
          sourceWindow.focus()
        })

        notification.show()
        return { shown: true }
      } catch {
        return { shown: false, reason: 'unsupported' }
      }
    }
  )

  ipcMain.handle('setup-agent:ask', async (_event, payload: SetupAgentRequestPayload) => {
    const providerId = payload.providerId ?? 'custom'
    const secret = await getCustomProviderSecret(providerId)
    const modelId = payload.modelId || 'dugin400'

    if (!secret) {
      return {
        configured: false,
        modelId,
        content: 'Провайдер setup-агента пока не настроен.'
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
    throw new Error('Свой провайдер не настроен.')
  }

  requestState.abortController = new AbortController()
  yield* streamProviderChat(secret.baseUrl, secret.apiKey, payload, requestState.abortController.signal, secret.apiFormat)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
