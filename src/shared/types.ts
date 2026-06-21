export type Role = 'user' | 'assistant'

export interface ChatMessagePayload {
  role: Role
  content: string
}

export interface ChatRequestPayload {
  requestId: string
  providerKind: 'demo' | 'custom'
  providerId?: string
  modelId: string
  effort: 'low' | 'medium' | 'high'
  tools: string[]
  files: Array<{ name: string; size: number }>
  messages: ChatMessagePayload[]
}

export interface SetupAgentRequestPayload {
  providerId?: string
  modelId: string
  messages: ChatMessagePayload[]
}

export interface SetupAgentResponse {
  configured: boolean
  modelId: string
  content: string
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
  id?: string
  label?: string
  apiFormat?: ProviderApiFormat
  baseUrl: string
  configured: boolean
  models: ProviderModel[]
  selectedModelId?: string
  updatedAt?: string
  lastError?: string
}

export interface SaveCustomProviderPayload {
  providerId?: string
  baseUrl: string
  apiKey: string
}

export type ProviderApiFormat = 'openai' | 'anthropic'

export interface ProviderPreset {
  id: string
  label: string
  description: string
  baseUrl: string
  apiFormat: ProviderApiFormat
  modelHint: string
}

export interface SkillSummary {
  id: string
  name: string
  description: string
  sourceUrl: string
  appliesTo: string[]
  status: 'preset' | 'installed'
}
