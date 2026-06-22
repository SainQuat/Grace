import { contextBridge, ipcRenderer } from 'electron'
import type {
  ChatRequestPayload,
  ChatStreamEvent,
  CustomProviderSummary,
  ResponseNotificationPayload,
  ResponseNotificationResult,
  SaveCustomProviderPayload,
  SetupAgentRequestPayload,
  SetupAgentResponse
} from '../shared/types'

contextBridge.exposeInMainWorld('graceAI', {
  startChat(payload: ChatRequestPayload) {
    ipcRenderer.send('chat:start', payload)
  },
  stopChat(requestId: string) {
    ipcRenderer.send('chat:stop', requestId)
  },
  onChatEvent(callback: (event: ChatStreamEvent) => void) {
    const listener = (_event: Electron.IpcRendererEvent, payload: ChatStreamEvent) => callback(payload)
    ipcRenderer.on('chat:event', listener)
    return () => {
      ipcRenderer.removeListener('chat:event', listener)
    }
  },
  getCustomProvider(): Promise<CustomProviderSummary> {
    return ipcRenderer.invoke('provider:get-custom')
  },
  getProviders(): Promise<CustomProviderSummary[]> {
    return ipcRenderer.invoke('provider:get-all')
  },
  saveCustomProvider(payload: SaveCustomProviderPayload): Promise<CustomProviderSummary> {
    return ipcRenderer.invoke('provider:save-custom', payload)
  },
  refreshCustomProviderModels(providerId?: string): Promise<CustomProviderSummary> {
    return ipcRenderer.invoke('provider:refresh-custom-models', providerId)
  },
  showResponseNotification(payload: ResponseNotificationPayload): Promise<ResponseNotificationResult> {
    return ipcRenderer.invoke('notification:show-response', payload)
  },
  askSetupAgent(payload: SetupAgentRequestPayload): Promise<SetupAgentResponse> {
    return ipcRenderer.invoke('setup-agent:ask', payload)
  }
})
