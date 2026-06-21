export type Role = 'user' | 'assistant'

export interface ChatMessagePayload {
  role: Role
  content: string
}

export interface ChatRequestPayload {
  requestId: string
  providerKind: 'demo' | 'custom'
  modelId: string
  effort: 'low' | 'medium' | 'high'
  tools: string[]
  files: Array<{ name: string; size: number }>
  messages: ChatMessagePayload[]
}

export type ChatStreamEvent =
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'done'; requestId: string }
  | { type: 'error'; requestId: string; message: string }

export interface ProviderModel {
  id: string
  label: string
  ownedBy?: string
  created?: number
}

export interface CustomProviderSummary {
  baseUrl: string
  configured: boolean
  models: ProviderModel[]
  selectedModelId?: string
  updatedAt?: string
  lastError?: string
}

export interface SaveCustomProviderPayload {
  baseUrl: string
  apiKey: string
}
