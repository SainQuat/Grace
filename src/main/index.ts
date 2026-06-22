import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { createDemoStream } from '../shared/demoStream'
import type { ChatRequestPayload, SaveCustomProviderPayload } from '../shared/types'
import { fetchProviderModels, normalizeBaseUrl, streamProviderChat } from './providerClient'
import {
  getCustomProviderSecret,
  getCustomProviderSummary,
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
    backgroundColor: '#0b0f17',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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

  ipcMain.handle('provider:save-custom', async (_event, payload: SaveCustomProviderPayload) => {
    const baseUrl = normalizeBaseUrl(payload.baseUrl)
    const apiKey = payload.apiKey.trim()
    const models = await fetchProviderModels(baseUrl, apiKey)

    return saveCustomProvider({
      baseUrl,
      apiKey,
      models
    })
  })

  ipcMain.handle('provider:refresh-custom-models', async () => {
    const secret = await getCustomProviderSecret()
    if (!secret) {
      throw new Error('Свой провайдер не настроен.')
    }

    const models = await fetchProviderModels(secret.baseUrl, secret.apiKey)
    return updateCustomProviderModels(models)
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

  const secret = await getCustomProviderSecret()
  if (!secret) {
    throw new Error('Свой провайдер не настроен.')
  }

  requestState.abortController = new AbortController()
  yield* streamProviderChat(secret.baseUrl, secret.apiKey, payload, requestState.abortController.signal)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
