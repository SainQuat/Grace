import {
  Archive,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  FileText,
  Folder,
  History,
  Image,
  Menu,
  Mic,
  Moon,
  MoreHorizontal,
  PanelRight,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Square,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { providerPresets } from '../../shared/providerPresets'
import type { ChatMessagePayload, ChatStreamEvent, CustomProviderSummary, ProviderModel, SkillSummary } from '../../shared/types'
import { locales, translate, type Locale, type Translate } from './i18n'
import { createSetupAgentPlan } from './setupAgent'
import { createDraftTitle, filterModelsByQuery, formatBytes, groupModelsByProvider, uid } from './utils'

type Role = 'user' | 'assistant'
type ThemeMode = 'light' | 'dark'

interface Message {
  id: string
  role: Role
  content: string
  pending?: boolean
}

interface Chat {
  id: string
  title: string
  project?: string
  projectId?: string
  pinned?: boolean
  messages: Message[]
  updatedAt: string
}

interface Project {
  id: string
  name: string
  icon: ProjectIconId
  color: string
}

type ProjectIconId = 'folder' | 'bot' | 'book' | 'file' | 'image' | 'zap' | 'settings' | 'archive'

interface McpServer {
  id: string
  name: string
  transport: 'http' | 'command'
  url: string
  command: string
  envText: string
  enabled: boolean
  createdAt: string
}

interface SetupAgentMessage {
  id: string
  role: Role
  content: string
}

interface AttachedFile {
  id: string
  name: string
  size: number
  status: 'ready' | 'uploading' | 'error'
}

interface ToolOption {
  id: string
  label: string
  description: string
  icon: typeof Paperclip
}

interface ModelOption {
  id: string
  modelId: string
  label: string
  provider: string
  description: string
  hint: string
  providerKind: 'demo' | 'custom'
  providerId?: string
  supportsEffort: boolean
}

interface SkillInstallDraft {
  url: string
  status: 'idle' | 'installed' | 'error'
  message?: string
}

const projectIconOptions: Array<{ id: ProjectIconId; label: string; icon: typeof Folder }> = [
  { id: 'folder', label: 'Folder', icon: Folder },
  { id: 'bot', label: 'Bot', icon: Bot },
  { id: 'book', label: 'Book', icon: BookOpen },
  { id: 'file', label: 'File', icon: FileText },
  { id: 'image', label: 'Image', icon: Image },
  { id: 'zap', label: 'Zap', icon: Zap },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'archive', label: 'Archive', icon: Archive }
]

const projectColors = ['#5cc8b7', '#8b5cf6', '#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#f97316', '#ec4899']

const initialProjects: Project[] = [
  { id: 'project-grace', name: 'Grace', icon: 'bot', color: '#5cc8b7' },
  { id: 'project-writing', name: 'Writing', icon: 'book', color: '#8b5cf6' }
]

const tools: ToolOption[] = [
  { id: 'attach', label: 'Attach file', description: 'Add docs, images, or notes', icon: Paperclip },
  { id: 'web', label: 'Search web', description: 'Use fresh sources', icon: Search },
  { id: 'image', label: 'Create image', description: 'Draft a visual prompt', icon: Image },
  { id: 'canvas', label: 'Open canvas', description: 'Work in a side document', icon: PanelRight },
  { id: 'voice', label: 'Voice', description: 'Dictate or read aloud', icon: Mic },
  { id: 'apps', label: 'Connect app', description: 'Prepare an integration', icon: Zap }
]

const builtInModels: ModelOption[] = [
  {
    id: 'grace-balanced',
    modelId: 'grace-balanced',
    label: 'Grace Balanced',
    provider: 'Grace',
    description: 'Default daily model for writing, code, and planning.',
    hint: 'Medium latency, balanced cost',
    providerKind: 'demo',
    supportsEffort: true
  },
  {
    id: 'openai-gpt',
    modelId: 'openai-gpt',
    label: 'OpenAI GPT',
    provider: 'OpenAI',
    description: 'Strong general reasoning and structured output.',
    hint: 'Fast to medium latency',
    providerKind: 'demo',
    supportsEffort: true
  },
  {
    id: 'claude',
    modelId: 'claude',
    label: 'Claude',
    provider: 'Anthropic',
    description: 'Long-form analysis, editing, and careful prose.',
    hint: 'Medium latency',
    providerKind: 'demo',
    supportsEffort: true
  },
  {
    id: 'deepseek-reasoner',
    modelId: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    provider: 'DeepSeek',
    description: 'Reasoning-heavy tasks and code walkthroughs.',
    hint: 'Variable latency',
    providerKind: 'demo',
    supportsEffort: true
  },
  {
    id: 'local-draft',
    modelId: 'local-draft',
    label: 'Local Draft',
    provider: 'Local',
    description: 'Private fast drafts through a local endpoint.',
    hint: 'No cloud request',
    providerKind: 'demo',
    supportsEffort: false
  }
]

const promptSuggestions = [
  'Draft a launch checklist for v0.1',
  'Rewrite this note in a clearer style',
  'Explain this code path step by step',
  'Plan a desktop app release',
  'Summarize a file I attach'
]

const presetSkills: SkillSummary[] = [
  {
    id: 'open-dynamic-workflows',
    name: 'Open Dynamic Workflows',
    description:
      'Write short JavaScript workflows that fan tasks out to Codex, Claude Code, Gemini, Qwen, Kimi, or custom CLIs outside the host context.',
    sourceUrl: 'https://github.com/agisota/open-dynamic-workflows/blob/main/skill/SKILL.md',
    appliesTo: ['Multi-agent fan-out', 'Review pipelines', 'Discovery loops', 'Large coding tasks'],
    status: 'preset'
  }
]

function toProviderModelOptions(providers: CustomProviderSummary[]): ModelOption[] {
  return providers.flatMap((provider) =>
    provider.configured
      ? provider.models.map((model) => toProviderModelOption(provider, model))
      : []
  )
}

function toProviderModelOption(provider: CustomProviderSummary, model: ProviderModel): ModelOption {
  const providerId = provider.id ?? 'custom'

  return {
    id: `${providerId}:${model.id}`,
    modelId: model.id,
    label: model.label || model.id,
    provider: provider.label ?? 'Custom provider',
    description: model.ownedBy ? `Owned by ${model.ownedBy}` : model.id,
    hint: provider.baseUrl || 'OpenAI-compatible endpoint',
    providerKind: 'custom',
    providerId,
    supportsEffort: false
  }
}

const initialChats: Chat[] = [
  {
    id: 'chat-product-plan',
    title: 'План Grace v0.1',
    pinned: true,
    project: 'Grace',
    projectId: 'project-grace',
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Набросай первую версию десктопного AI-чата.'
      },
      {
        id: 'm2',
        role: 'assistant',
        content:
          'Начни с local-first чат-клиента: история в сайдбаре, выбор модели, streaming-ответы, файлы как chips и canvas-панель для длинных документов. Ключи провайдеров держим в desktop runtime, не в renderer state.'
      }
    ]
  },
  {
    id: 'chat-release-notes',
    title: 'Шаблон релиз-нотов',
    updatedAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    messages: []
  },
  {
    id: 'chat-ui-copy',
    title: 'Улучшить onboarding copy',
    project: 'Writing',
    projectId: 'project-writing',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    messages: []
  }
]

const canvasInitialValue = `# Рабочий черновик

Используйте canvas для длинных ответов, спецификаций, кода и редактируемых документов.

- В будущей версии можно будет выделить текст и спросить Grace о фрагменте.
- Экспортируйте или копируйте текст, когда черновик готов.
- Держите чат открытым, пока дорабатываете документ.`

function resolveChatProjectId(chat: Chat, projects: Project[]): string | undefined {
  if (chat.projectId) return chat.projectId
  if (!chat.project) return undefined
  return projects.find((project) => project.name === chat.project)?.id
}

function getProjectIcon(iconId: ProjectIconId): typeof Folder {
  return projectIconOptions.find((option) => option.id === iconId)?.icon ?? Folder
}

function getNextProjectIcon(iconId: ProjectIconId): ProjectIconId {
  const currentIndex = projectIconOptions.findIndex((option) => option.id === iconId)
  const nextOption = projectIconOptions[(currentIndex + 1) % projectIconOptions.length]
  return nextOption.id
}

function getNextProjectColor(color: string): string {
  const currentIndex = projectColors.indexOf(color)
  return projectColors[(currentIndex + 1) % projectColors.length]
}

export function App(): JSX.Element {
  const [chats, setChats] = usePersistentState<Chat[]>('grace.chats', initialChats)
  const [activeChatId, setActiveChatId] = usePersistentState<string>('grace.activeChatId', initialChats[0].id)
  const [sidebarOpen, setSidebarOpen] = usePersistentState('grace.sidebarOpen', true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = usePersistentState('grace.canvasOpen', true)
  const [canvasValue, setCanvasValue] = usePersistentState('grace.canvasValue', canvasInitialValue)
  const [composerValue, setComposerValue] = useState('')
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [modelId, setModelId] = usePersistentState('grace.modelId', builtInModels[0].id)
  const [effort, setEffort] = usePersistentState<'low' | 'medium' | 'high'>('grace.effort', 'medium')
  const [themeMode, setThemeMode] = usePersistentState<ThemeMode>('grace.themeMode', 'dark')
  const [locale, setLocale] = usePersistentState<Locale>('grace.locale', 'ru')
  const [projects, setProjects] = usePersistentState<Project[]>('grace.projects', initialProjects)
  const [activeProjectId, setActiveProjectId] = usePersistentState<string | null>(
    'grace.activeProjectId',
    null
  )
  const [mcpServers, setMcpServers] = usePersistentState<McpServer[]>('grace.mcpServers', [])
  const [setupAgentOpen, setSetupAgentOpen] = useState(false)
  const [setupAgentMessages, setSetupAgentMessages] = usePersistentState<SetupAgentMessage[]>(
    'grace.setupAgentMessages',
    [
      {
        id: 'setup-agent-welcome',
        role: 'assistant',
        content: 'Я могу помочь подключить MCP сервер, провайдера или выбрать модель. Для ответов использую Zed/custom provider и модель dugin400, если провайдер уже настроен.'
      }
    ]
  )
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [providers, setProviders] = useState<CustomProviderSummary[]>(
    providerPresets.map((provider) => ({
      id: provider.id,
      label: provider.label,
      apiFormat: provider.apiFormat,
      baseUrl: provider.baseUrl,
      configured: false,
      models: []
    }))
  )
  const [installedSkills, setInstalledSkills] = usePersistentState<SkillSummary[]>('grace.installedSkills', [])
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const requestChatRef = useRef<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const availableModels = useMemo(
    () => [...builtInModels, ...toProviderModelOptions(providers)],
    [providers]
  )
  const visibleSkills = useMemo(() => [...presetSkills, ...installedSkills], [installedSkills])
  const t: Translate = useMemo(() => (key) => translate(locale, key), [locale])
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0]
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const visibleChats = useMemo(
    () =>
      activeProjectId
        ? chats.filter((chat) => resolveChatProjectId(chat, projects) === activeProjectId)
        : chats,
    [activeProjectId, chats, projects]
  )
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0]
  const selectedTools = tools.filter((tool) => selectedToolIds.includes(tool.id))
  const canSend = composerValue.trim().length > 0 || attachedFiles.length > 0
  const isStreaming = activeRequestId !== null
  const nextThemeMode: ThemeMode = themeMode === 'dark' ? 'light' : 'dark'

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeMode
  }, [themeMode])

  useLayoutEffect(() => {
    document.documentElement.dataset.platform = navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'other'
  }, [])

  useEffect(() => {
    window.graceAI
      .getProviders()
      .then(setProviders)
      .catch((error) => {
        setProviders((currentProviders) =>
          currentProviders.map((provider) =>
            provider.id === 'custom'
              ? {
                  ...provider,
                  lastError: error instanceof Error ? error.message : 'Failed to load providers.'
                }
              : provider
          )
        )
      })
  }, [])

  useEffect(() => {
    if (!availableModels.some((model) => model.id === modelId)) {
      setModelId(builtInModels[0].id)
    }
  }, [availableModels, modelId, setModelId])

  useEffect(() => {
    if (activeProjectId && !projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(null)
    }
  }, [activeProjectId, projects, setActiveProjectId])

  useEffect(() => {
    setChats((currentChats) => {
      let changed = false
      const migratedChats = currentChats.map((chat) => {
        if (chat.projectId || !chat.project) return chat
        const project = projects.find((candidate) => candidate.name === chat.project)
        if (!project) return chat
        changed = true
        return { ...chat, projectId: project.id }
      })

      return changed ? migratedChats : currentChats
    })
  }, [projects, setChats])

  useEffect(() => {
    const unsubscribe = window.graceAI.onChatEvent((event) => handleStreamEvent(event))
    return unsubscribe
  }, [activeRequestId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setToolMenuOpen(false)
        setModelMenuOpen(false)
        setMobileSidebarOpen(false)
        setProviderSettingsOpen(false)
        setSkillsOpen(false)
        setSetupAgentOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function handleStreamEvent(event: ChatStreamEvent): void {
    const targetChatId = requestChatRef.current[event.requestId] ?? activeChatId

    if (event.type === 'delta') {
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === targetChatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.id === event.requestId
                    ? { ...message, content: `${message.content}${event.text}`, pending: true }
                    : message
                )
              }
            : chat
        )
      )
      return
    }

    if (event.type === 'done') {
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === targetChatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.id === event.requestId ? { ...message, pending: false } : message
                )
              }
            : chat
        )
      )
      setActiveRequestId((current) => (current === event.requestId ? null : current))
      delete requestChatRef.current[event.requestId]
      return
    }

    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === targetChatId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === event.requestId
                  ? { ...message, content: `Generation failed: ${event.message}`, pending: false }
                  : message
              )
            }
          : chat
      )
    )
    setActiveRequestId(null)
    delete requestChatRef.current[event.requestId]
  }

  function createNewChat(): void {
    const chat: Chat = {
      id: uid('chat'),
      title: t('newChat'),
      projectId: activeProjectId ?? undefined,
      project: activeProject?.name,
      messages: [],
      updatedAt: new Date().toISOString()
    }

    setChats((currentChats) => [chat, ...currentChats])
    setActiveChatId(chat.id)
    setMobileSidebarOpen(false)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function toggleChatPinned(chatId: string): void {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              pinned: !chat.pinned,
              updatedAt: new Date().toISOString()
            }
          : chat
      )
    )
  }

  function renameChat(chatId: string): void {
    const chat = chats.find((candidate) => candidate.id === chatId)
    if (!chat) return

    const nextTitle = window.prompt(t('renameChat'), chat.title)?.trim()
    if (!nextTitle) return

    setChats((currentChats) =>
      currentChats.map((candidate) =>
        candidate.id === chatId
          ? {
              ...candidate,
              title: nextTitle,
              updatedAt: new Date().toISOString()
            }
          : candidate
      )
    )
  }

  function deleteChat(chatId: string): void {
    const chat = chats.find((candidate) => candidate.id === chatId)
    if (!chat || !window.confirm(`${t('deleteChatConfirm')} "${chat.title}"?`)) return

    const nextChats = chats.filter((candidate) => candidate.id !== chatId)
    const fallbackChat: Chat = {
      id: uid('chat'),
      title: t('newChat'),
      projectId: activeProjectId ?? undefined,
      project: activeProject?.name,
      messages: [],
      updatedAt: new Date().toISOString()
    }
    const resolvedChats = nextChats.length > 0 ? nextChats : [fallbackChat]

    if (activeChatId === chatId) {
      setActiveChatId(resolvedChats[0].id)
    }

    setChats(resolvedChats)
  }

  function selectProject(projectId: string | null): void {
    setActiveProjectId(projectId)
    const nextVisibleChats = projectId
      ? chats.filter((chat) => resolveChatProjectId(chat, projects) === projectId)
      : chats
    const activeChatStillVisible = nextVisibleChats.some((chat) => chat.id === activeChatId)

    if (!activeChatStillVisible && nextVisibleChats[0]) {
      setActiveChatId(nextVisibleChats[0].id)
    }

    setMobileSidebarOpen(false)
  }

  function selectChat(chatId: string): void {
    const chat = chats.find((candidate) => candidate.id === chatId)
    if (!chat) return

    setActiveChatId(chatId)
    setActiveProjectId(resolveChatProjectId(chat, projects) ?? null)
    setMobileSidebarOpen(false)
  }

  function createProject(): void {
    const name = window.prompt(t('newProject'))?.trim()
    if (!name) return

    const project: Project = {
      id: uid('project'),
      name,
      icon: 'folder',
      color: projectColors[projects.length % projectColors.length]
    }

    setProjects((currentProjects) => [...currentProjects, project])
    setActiveProjectId(project.id)
  }

  function renameProject(projectId: string): void {
    const project = projects.find((candidate) => candidate.id === projectId)
    if (!project) return

    const name = window.prompt(t('renameProject'), project.name)?.trim()
    if (!name) return

    setProjects((currentProjects) =>
      currentProjects.map((candidate) => (candidate.id === projectId ? { ...candidate, name } : candidate))
    )
    setChats((currentChats) =>
      currentChats.map((chat) =>
        resolveChatProjectId(chat, projects) === projectId ? { ...chat, project: name } : chat
      )
    )
  }

  function cycleProjectIcon(projectId: string): void {
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId ? { ...project, icon: getNextProjectIcon(project.icon) } : project
      )
    )
  }

  function cycleProjectColor(projectId: string): void {
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId ? { ...project, color: getNextProjectColor(project.color) } : project
      )
    )
  }

  function moveChatToProject(chatId: string, projectId: string | null): void {
    const project = projectId ? projects.find((candidate) => candidate.id === projectId) : null
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              projectId: project?.id,
              project: project?.name,
              updatedAt: new Date().toISOString()
            }
          : chat
      )
    )
    if (chatId === activeChatId) {
      setActiveProjectId(project?.id ?? null)
    }
  }

  function sendMessage(value = composerValue): void {
    const trimmedValue = value.trim()
    if ((!trimmedValue && attachedFiles.length === 0) || isStreaming) {
      return
    }

    const requestId = uid('assistant')
    requestChatRef.current[requestId] = activeChat.id
    const userMessage: Message = {
      id: uid('user'),
      role: 'user',
      content: trimmedValue || `Attached ${attachedFiles.length} file${attachedFiles.length === 1 ? '' : 's'}`
    }
    const assistantMessage: Message = {
      id: requestId,
      role: 'assistant',
      content: '',
      pending: true
    }

    const nextMessages = [...activeChat.messages, userMessage, assistantMessage]
    const nextTitle = activeChat.messages.length === 0 ? createDraftTitle(userMessage.content) : activeChat.title

    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === activeChat.id
          ? {
              ...chat,
              title: nextTitle,
              messages: nextMessages,
              updatedAt: new Date().toISOString()
            }
          : chat
      )
    )

    if (selectedToolIds.includes('canvas')) {
      setCanvasOpen(true)
    }

    const payloadMessages: ChatMessagePayload[] = nextMessages
      .filter((message) => message.id !== requestId)
      .map((message) => ({ role: message.role, content: message.content }))

    window.graceAI.startChat({
      requestId,
      providerKind: selectedModel.providerKind,
      providerId: selectedModel.providerId,
      modelId: selectedModel.modelId,
      effort,
      tools: selectedToolIds,
      files: attachedFiles.map((file) => ({ name: file.name, size: file.size })),
      messages: payloadMessages
    })

    setActiveRequestId(requestId)
    setComposerValue('')
    setAttachedFiles([])
  }

  function stopStreaming(): void {
    if (!activeRequestId) return
    window.graceAI.stopChat(activeRequestId)
    setActiveRequestId(null)
  }

  function toggleTool(toolId: string): void {
    if (toolId === 'attach') {
      fileInputRef.current?.click()
      setToolMenuOpen(false)
      return
    }

    if (toolId === 'canvas') {
      setCanvasOpen(true)
    }

    setSelectedToolIds((current) =>
      current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId]
    )
  }

  function onFileChange(files: FileList | null): void {
    if (!files) return
    const nextFiles: AttachedFile[] = Array.from(files).map((file) => ({
      id: uid('file'),
      name: file.name,
      size: file.size,
      status: 'ready'
    }))
    setAttachedFiles((current) => [...current, ...nextFiles])
  }

  function upsertMcpServer(server: Omit<McpServer, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): void {
    const nextServer: McpServer = {
      id: server.id ?? uid('mcp'),
      name: server.name.trim() || 'Custom MCP',
      transport: server.transport,
      url: server.url.trim(),
      command: server.command.trim(),
      envText: server.envText.trim(),
      enabled: server.enabled,
      createdAt: server.createdAt ?? new Date().toISOString()
    }

    setMcpServers((currentServers) => {
      const exists = currentServers.some((candidate) => candidate.id === nextServer.id)
      return exists
        ? currentServers.map((candidate) => (candidate.id === nextServer.id ? nextServer : candidate))
        : [nextServer, ...currentServers]
    })
  }

  function updateMcpServer(serverId: string, patch: Partial<McpServer>): void {
    setMcpServers((currentServers) =>
      currentServers.map((server) => (server.id === serverId ? { ...server, ...patch } : server))
    )
  }

  function deleteMcpServer(serverId: string): void {
    setMcpServers((currentServers) => currentServers.filter((server) => server.id !== serverId))
  }

  async function runSetupAgent(input: string): Promise<void> {
    const trimmedInput = input.trim()
    if (!trimmedInput) return

    const userMessage: SetupAgentMessage = {
      id: uid('setup-user'),
      role: 'user',
      content: trimmedInput
    }
    setSetupAgentMessages((currentMessages) => [...currentMessages, userMessage])

    const plan = createSetupAgentPlan(trimmedInput)
    const localNotes: string[] = []

    if (plan.cancelled) {
      setSetupAgentMessages((currentMessages) => [
        ...currentMessages,
        {
          id: uid('setup-assistant'),
          role: 'assistant',
          content: plan.summary
        }
      ])
      return
    }

    if (plan.themeMode) {
      setThemeMode(plan.themeMode)
      localNotes.push(`тема: ${plan.themeMode === 'light' ? 'светлая' : 'темная'}`)
    }

    if (plan.locale) {
      setLocale(plan.locale)
      localNotes.push(`язык: ${plan.locale === 'ru' ? 'русский' : 'английский'}`)
    }

    if (plan.mcpServer) {
      upsertMcpServer({
        name: plan.mcpServer.name,
        transport: plan.mcpServer.transport,
        url: plan.mcpServer.url,
        command: plan.mcpServer.command,
        envText: plan.mcpServer.envText,
        enabled: true
      })
      localNotes.push(`MCP: ${plan.mcpServer.name}`)
    }

    if (plan.provider) {
      try {
        const provider = await window.graceAI.saveCustomProvider({
          providerId: plan.provider.providerId,
          baseUrl: plan.provider.baseUrl,
          apiKey: plan.provider.apiKey
        })
        setProviders((currentProviders) =>
          currentProviders.map((currentProvider) => (currentProvider.id === provider.id ? provider : currentProvider))
        )
        const targetModel = provider.models.find((model) => model.id === plan.provider?.modelId) ?? provider.models[0]
        if (targetModel && provider.id) {
          setModelId(`${provider.id}:${targetModel.id}`)
        }
        localNotes.push(`provider: ${provider.baseUrl}`)
      } catch (error) {
        localNotes.push(error instanceof Error ? error.message : 'Provider setup failed.')
      }
    } else if (plan.selectedModelId) {
      const targetModel = availableModels.find((model) => model.modelId === plan.selectedModelId)
      if (targetModel) {
        setModelId(targetModel.id)
        localNotes.push(`model: ${targetModel.label}`)
      }
    }

    const setupProvider =
      providers.find((provider) => provider.id === 'zed' && provider.configured) ??
      providers.find((provider) => provider.configured && provider.baseUrl.includes('api.zed.md')) ??
      providers.find((provider) => provider.id === 'custom' && provider.configured)
    let remoteAnswer = ''
    try {
      const answer = await window.graceAI.askSetupAgent({
        providerId: setupProvider?.id ?? 'zed',
        modelId: 'dugin400',
        messages: [{ role: 'user', content: trimmedInput }]
      })
      remoteAnswer = answer.configured || localNotes.length === 0 ? answer.content : ''
    } catch (error) {
      remoteAnswer = localNotes.length === 0 ? (error instanceof Error ? error.message : 'Setup agent request failed.') : ''
    }

    const assistantContent = [
      localNotes.length > 0 ? `Готово. Локально применено: ${localNotes.join(', ')}.` : plan.summary,
      remoteAnswer
    ]
      .filter(Boolean)
      .join('\n\n')

    setSetupAgentMessages((currentMessages) => [
      ...currentMessages,
      {
        id: uid('setup-assistant'),
        role: 'assistant',
        content: assistantContent
      }
    ])
  }

  return (
    <div className="app-shell">
      <ProjectSidebar
        chats={visibleChats}
        allChats={chats}
        projects={projects}
        activeProjectId={activeProjectId}
        activeChatId={activeChat.id}
        open={sidebarOpen}
        mobileOpen={mobileSidebarOpen}
        translate={t}
        onToggle={() => setSidebarOpen((open) => !open)}
        onMobileClose={() => setMobileSidebarOpen(false)}
        onNewChat={createNewChat}
        onNewProject={createProject}
        onSelectProject={selectProject}
        onRenameProject={renameProject}
        onCycleProjectIcon={cycleProjectIcon}
        onCycleProjectColor={cycleProjectColor}
        onMoveChatToProject={moveChatToProject}
        onToggleChatPinned={toggleChatPinned}
        onRenameChat={renameChat}
        onDeleteChat={deleteChat}
        onSelectChat={selectChat}
        skillsCount={visibleSkills.length}
        onOpenSkills={() => setSkillsOpen(true)}
        onOpenSetupAgent={() => setSetupAgentOpen(true)}
        onOpenProviderSettings={() => setProviderSettingsOpen(true)}
      />

      <main className={`main-pane ${canvasOpen ? 'with-canvas' : ''}`}>
        <TopBar
          title={activeChat.title}
          project={activeProject}
          model={selectedModel}
          themeMode={themeMode}
          translate={t}
          sidebarOpen={sidebarOpen}
          canvasOpen={canvasOpen}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onToggleCanvas={() => setCanvasOpen((open) => !open)}
          onToggleTheme={() => setThemeMode(nextThemeMode)}
        />

        <ChatThread
          chat={activeChat}
          isStreaming={isStreaming}
          translate={t}
          onPromptClick={sendMessage}
          onCopy={(content) => navigator.clipboard?.writeText(content)}
          onRetry={() => activeChat.messages.at(-2)?.content && sendMessage(activeChat.messages.at(-2)!.content)}
        />

        <Composer
          value={composerValue}
          textareaRef={textareaRef}
          translate={t}
          canSend={canSend}
          isStreaming={isStreaming}
          toolMenuOpen={toolMenuOpen}
          modelMenuOpen={modelMenuOpen}
          selectedModel={selectedModel}
          effort={effort}
          selectedTools={selectedTools}
          attachedFiles={attachedFiles}
          onValueChange={setComposerValue}
          onSend={() => sendMessage()}
          onStop={stopStreaming}
          onToggleToolMenu={() => setToolMenuOpen((open) => !open)}
          onToggleModelMenu={() => setModelMenuOpen((open) => !open)}
          onSelectModel={(nextModel) => {
            setModelId(nextModel.id)
            setModelMenuOpen(false)
          }}
          onEffortChange={setEffort}
          onToggleTool={toggleTool}
          onRemoveTool={(toolId) => setSelectedToolIds((current) => current.filter((id) => id !== toolId))}
          onRemoveFile={(fileId) => setAttachedFiles((current) => current.filter((file) => file.id !== fileId))}
          availableModels={availableModels}
          onOpenProviderSettings={() => setProviderSettingsOpen(true)}
        />

        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          multiple
          onChange={(event) => onFileChange(event.target.files)}
        />
      </main>

      {canvasOpen ? (
        <CanvasPanel
          value={canvasValue}
          translate={t}
          onChange={setCanvasValue}
          onClose={() => setCanvasOpen(false)}
        />
      ) : null}

      {providerSettingsOpen ? (
        <ProviderSettingsModal
          providers={providers}
          themeMode={themeMode}
          locale={locale}
          mcpServers={mcpServers}
          translate={t}
          onClose={() => setProviderSettingsOpen(false)}
          onThemeChange={setThemeMode}
          onLocaleChange={setLocale}
          onUpsertMcpServer={upsertMcpServer}
          onUpdateMcpServer={updateMcpServer}
          onDeleteMcpServer={deleteMcpServer}
          onSaved={(provider) => {
            setProviders((currentProviders) =>
              currentProviders.map((currentProvider) => (currentProvider.id === provider.id ? provider : currentProvider))
            )
            const firstProviderModel = provider.models[0]
            if (firstProviderModel && provider.id) {
              setModelId(`${provider.id}:${firstProviderModel.id}`)
            }
          }}
        />
      ) : null}
      {setupAgentOpen ? (
        <SetupAgentModal
          messages={setupAgentMessages}
          translate={t}
          onClose={() => setSetupAgentOpen(false)}
          onSend={runSetupAgent}
        />
      ) : null}
      {skillsOpen ? (
        <SkillsModal
          skills={visibleSkills}
          translate={t}
          onClose={() => setSkillsOpen(false)}
          onInstallSkill={(skill) => {
            setInstalledSkills((currentSkills) =>
              currentSkills.some((currentSkill) => currentSkill.sourceUrl === skill.sourceUrl)
                ? currentSkills
                : [...currentSkills, skill]
            )
          }}
        />
      ) : null}
    </div>
  )
}

function ProjectSidebar(props: {
  chats: Chat[]
  allChats: Chat[]
  projects: Project[]
  activeProjectId: string | null
  activeChatId: string
  open: boolean
  mobileOpen: boolean
  translate: Translate
  onToggle: () => void
  onMobileClose: () => void
  onNewChat: () => void
  onNewProject: () => void
  onSelectProject: (projectId: string | null) => void
  onRenameProject: (projectId: string) => void
  onCycleProjectIcon: (projectId: string) => void
  onCycleProjectColor: (projectId: string) => void
  onMoveChatToProject: (chatId: string, projectId: string | null) => void
  onSelectChat: (chatId: string) => void
  onToggleChatPinned: (chatId: string) => void
  onRenameChat: (chatId: string) => void
  onDeleteChat: (chatId: string) => void
  skillsCount: number
  onOpenSkills: () => void
  onOpenSetupAgent: () => void
  onOpenProviderSettings: () => void
}): JSX.Element {
  const t = props.translate
  const pinnedChats = props.chats.filter((chat) => chat.pinned)
  const recentChats = props.chats.filter((chat) => !chat.pinned)

  return (
    <>
      <aside className={`sidebar ${props.open ? 'expanded' : 'collapsed'} ${props.mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-top">
          <button className="icon-button" type="button" aria-label={t('toggleSidebar')} title={t('toggleSidebar')} onClick={props.onToggle}>
            <Menu size={18} />
          </button>
          {props.open ? (
            <button className="new-chat-button" type="button" onClick={props.onNewChat}>
              <Plus size={17} />
              {t('newChat')}
            </button>
          ) : null}
        </div>

        {props.open ? (
          <>
            <label className="search-box">
              <Search size={16} />
              <input type="search" placeholder={t('searchChats')} aria-label={t('searchChats')} />
            </label>

            <button className={`sidebar-row primary-nav-row ${props.activeProjectId === null ? 'active' : ''}`} type="button" onClick={() => props.onSelectProject(null)}>
              <History size={15} />
              <span>{t('allChats')}</span>
              <small>{props.allChats.length}</small>
            </button>

            <SidebarSection title={t('pinned')} icon={<Pin size={14} />}>
              {pinnedChats.map((chat) => (
                <SidebarRow
                  key={chat.id}
                  chat={chat}
                  active={chat.id === props.activeChatId}
                  projects={props.projects}
                  translate={t}
                  onSelect={props.onSelectChat}
                  onMoveToProject={props.onMoveChatToProject}
                  onTogglePinned={props.onToggleChatPinned}
                  onRename={props.onRenameChat}
                  onDelete={props.onDeleteChat}
                />
              ))}
            </SidebarSection>

            <SidebarSection title={t('projects')} icon={<Folder size={14} />}>
              {props.projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  active={project.id === props.activeProjectId}
                  chatCount={props.allChats.filter((chat) => resolveChatProjectId(chat, props.projects) === project.id).length}
                  translate={t}
                  onSelect={props.onSelectProject}
                  onRename={props.onRenameProject}
                  onCycleIcon={props.onCycleProjectIcon}
                  onCycleColor={props.onCycleProjectColor}
                />
              ))}
              <button className="sidebar-row muted-row" type="button" onClick={props.onNewProject}>
                <Plus size={15} />
                <span>{t('newProject')}</span>
              </button>
            </SidebarSection>

            <SidebarSection title={props.activeProjectId ? t('projectChats') : t('recents')} icon={<History size={14} />}>
              {recentChats.map((chat) => (
                <SidebarRow
                  key={chat.id}
                  chat={chat}
                  active={chat.id === props.activeChatId}
                  projects={props.projects}
                  translate={t}
                  onSelect={props.onSelectChat}
                  onMoveToProject={props.onMoveChatToProject}
                  onTogglePinned={props.onToggleChatPinned}
                  onRename={props.onRenameChat}
                  onDelete={props.onDeleteChat}
                />
              ))}
            </SidebarSection>
          </>
        ) : (
          <div className="icon-rail" aria-label="Collapsed navigation">
            <button className="icon-button" type="button" aria-label={t('newChat')} title={t('newChat')} onClick={props.onNewChat}>
              <Plus size={18} />
            </button>
            <button className="icon-button" type="button" aria-label={t('searchChats')} title={t('searchChats')}>
              <Search size={18} />
            </button>
            <button className="icon-button" type="button" aria-label={t('pinned')} title={t('pinned')}>
              <Pin size={18} />
            </button>
            <button className="icon-button" type="button" aria-label={t('files')} title={t('files')}>
              <FileText size={18} />
            </button>
          </div>
        )}

        {props.open ? (
          <div className="sidebar-bottom">
            <button className="account-row" type="button" onClick={props.onOpenSkills}>
              <BookOpen size={18} />
              <span>
                <strong>{t('skills')}</strong>
                <small>{props.skillsCount} preset / installed</small>
              </span>
              <ChevronDown size={15} />
            </button>
            <button className="sidebar-row" type="button" onClick={props.onOpenSetupAgent}>
              <Bot size={15} />
              <span>{t('setupAgent')}</span>
            </button>
            <button className="sidebar-row" type="button">
              <Archive size={15} />
              <span>{t('libraryFiles')}</span>
            </button>
            <button className="sidebar-row" type="button">
              <Clock3 size={15} />
              <span>{t('scheduledTasks')}</span>
            </button>
            <button className="sidebar-row" type="button" onClick={props.onOpenProviderSettings}>
              <Settings size={15} />
              <span>{t('settings')}</span>
            </button>
          </div>
        ) : null}
      </aside>
      {props.mobileOpen ? <button className="scrim" aria-label={t('close')} type="button" onClick={props.onMobileClose} /> : null}
    </>
  )
}

function SidebarSection(props: { title: string; icon: JSX.Element; children: React.ReactNode }): JSX.Element {
  return (
    <section className="sidebar-section">
      <div className="section-title">
        {props.icon}
        {props.title}
      </div>
      <div className="section-list">{props.children}</div>
    </section>
  )
}

function ProjectRow(props: {
  project: Project
  active: boolean
  chatCount: number
  translate: Translate
  onSelect: (projectId: string) => void
  onRename: (projectId: string) => void
  onCycleIcon: (projectId: string) => void
  onCycleColor: (projectId: string) => void
}): JSX.Element {
  const [actionsOpen, setActionsOpen] = useState(false)
  const shellRef = useCloseOnOutsideClick<HTMLDivElement>(actionsOpen, () => setActionsOpen(false))
  const Icon = getProjectIcon(props.project.icon)

  return (
    <div ref={shellRef} className={`sidebar-row-shell project-row-shell ${props.active ? 'active' : ''}`}>
      <button className="sidebar-row-main project-row-main" type="button" onClick={() => props.onSelect(props.project.id)}>
        <span className="project-icon-dot" style={{ color: props.project.color, backgroundColor: `${props.project.color}22` }}>
          <Icon size={15} />
        </span>
        <span>{props.project.name}</span>
        <small>{props.chatCount}</small>
      </button>
      <button
        className="row-action-button"
        type="button"
        aria-label={props.translate('projectIcon')}
        title={props.translate('projectIcon')}
        onClick={() => setActionsOpen((open) => !open)}
      >
        <MoreHorizontal size={15} />
      </button>
      {actionsOpen ? (
        <div className="row-action-menu project-action-menu">
          <button
            type="button"
            onClick={() => {
              props.onRename(props.project.id)
              setActionsOpen(false)
            }}
          >
            <Pencil size={14} />
            {props.translate('renameProject')}
          </button>
          <button
            type="button"
            onClick={() => {
              props.onCycleIcon(props.project.id)
              setActionsOpen(false)
            }}
          >
            <Folder size={14} />
            {props.translate('projectIcon')}
          </button>
          <button
            type="button"
            onClick={() => {
              props.onCycleColor(props.project.id)
              setActionsOpen(false)
            }}
          >
            <span className="project-color-dot" style={{ backgroundColor: props.project.color }} />
            {props.translate('projectColor')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function SidebarRow(props: {
  chat: Chat
  active: boolean
  projects?: Project[]
  translate?: Translate
  onSelect: (chatId: string) => void
  onMoveToProject?: (chatId: string, projectId: string | null) => void
  onTogglePinned: (chatId: string) => void
  onRename: (chatId: string) => void
  onDelete: (chatId: string) => void
}): JSX.Element {
  const [actionsOpen, setActionsOpen] = useState(false)
  const shellRef = useCloseOnOutsideClick<HTMLDivElement>(actionsOpen, () => setActionsOpen(false))
  const fallbackTranslate: Translate = (key) => translate('en', key)
  const t = props.translate ?? fallbackTranslate
  const projects = props.projects ?? []

  return (
    <div ref={shellRef} className={`sidebar-row-shell ${props.active ? 'active' : ''}`}>
      <button className="sidebar-row-main" type="button" onClick={() => props.onSelect(props.chat.id)}>
        <span className="row-dot" />
        <span>{props.chat.title}</span>
      </button>
      <button
        className="row-action-button"
        type="button"
        aria-label={`Open actions for ${props.chat.title}`}
        title="Chat actions"
        onClick={() => setActionsOpen((open) => !open)}
      >
        <MoreHorizontal size={15} />
      </button>
      {actionsOpen ? (
        <div className="row-action-menu">
          <button
            type="button"
            onClick={() => {
              props.onTogglePinned(props.chat.id)
              setActionsOpen(false)
            }}
          >
            <Pin size={14} />
            {props.chat.pinned ? t('unpinChat') : t('pinChat')}
          </button>
          {projects.length > 0 ? (
            <>
              <div className="row-action-label">{t('moveToProject')}</div>
              {projects.map((project) => {
                const Icon = getProjectIcon(project.icon)
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      props.onMoveToProject?.(props.chat.id, project.id)
                      setActionsOpen(false)
                    }}
                  >
                    <Icon size={14} />
                    {project.name}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  props.onMoveToProject?.(props.chat.id, null)
                  setActionsOpen(false)
                }}
              >
                <History size={14} />
                {t('allChats')}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              props.onRename(props.chat.id)
              setActionsOpen(false)
            }}
          >
            <Pencil size={14} />
            {t('rename')}
          </button>
          <button
            type="button"
            onClick={() => {
              props.onDelete(props.chat.id)
              setActionsOpen(false)
            }}
          >
            <Trash2 size={14} />
            {t('delete')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function TopBar(props: {
  title: string
  project: Project | null
  model: ModelOption
  themeMode: ThemeMode
  translate: Translate
  sidebarOpen: boolean
  canvasOpen: boolean
  onOpenMobileSidebar: () => void
  onToggleSidebar: () => void
  onToggleCanvas: () => void
  onToggleTheme: () => void
}): JSX.Element {
  const themeLabel = props.themeMode === 'dark' ? props.translate('light') : props.translate('dark')

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button mobile-menu-button" type="button" aria-label={props.translate('toggleSidebar')} title={props.translate('toggleSidebar')} onClick={props.onOpenMobileSidebar}>
          <Menu size={18} />
        </button>
        <button className="icon-button desktop-only" type="button" aria-label={props.translate('toggleSidebar')} title={props.translate('toggleSidebar')} onClick={props.onToggleSidebar}>
          <Menu size={18} />
        </button>
        <div className="title-block">
          <strong>{props.title}</strong>
          <span>{props.project ? `${props.project.name} · ${props.model.label}` : props.model.label}</span>
        </div>
      </div>
      <div className="topbar-actions">
        <button className="text-button" type="button">
          <ShareIcon />
          {props.translate('share')}
        </button>
        <button className="icon-button" type="button" aria-label={themeLabel} title={themeLabel} onClick={props.onToggleTheme}>
          {props.themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          className={`icon-button ${props.canvasOpen ? 'active' : ''}`}
          type="button"
          aria-label={props.translate('toggleCanvas')}
          title={props.translate('toggleCanvas')}
          onClick={props.onToggleCanvas}
        >
          <PanelRight size={18} />
        </button>
      </div>
    </header>
  )
}

function ChatThread(props: {
  chat: Chat
  isStreaming: boolean
  translate: Translate
  onPromptClick: (value: string) => void
  onCopy: (content: string) => void
  onRetry: () => void
}): JSX.Element {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [props.chat.messages])

  if (props.chat.messages.length === 0) {
    return (
      <section className="chat-thread empty-state" aria-label="Empty chat">
        <div className="empty-content">
          <div className="mark" aria-hidden="true">
            <Bot size={28} />
          </div>
          <h1>{props.translate('howCanHelp')}</h1>
          <div className="suggestion-grid">
            {promptSuggestions.map((suggestion) => (
              <button key={suggestion} className="suggestion-card" type="button" onClick={() => props.onPromptClick(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="chat-thread" aria-label="Conversation">
      <div className="message-list">
        {props.chat.messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            translate={props.translate}
            onCopy={props.onCopy}
            onRetry={props.onRetry}
          />
        ))}
        {props.isStreaming ? (
          <div className="stream-status" aria-live="polite">
            Grace отвечает<span className="cursor-dot" />
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
    </section>
  )
}

function MessageBubble(props: {
  message: Message
  translate: Translate
  onCopy: (content: string) => void
  onRetry: () => void
}): JSX.Element {
  const { message, onCopy, onRetry } = props

  return (
    <article className={`message ${message.role}`}>
      <div className="message-body">
        {message.role === 'assistant' ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children }) {
                const language = /language-(\w+)/.exec(className || '')?.[1]
                return language ? <CodeBlock language={language} value={String(children).replace(/\n$/, '')} /> : <code>{children}</code>
              }
            }}
          >
            {message.content || ' '}
          </ReactMarkdown>
        ) : (
          <p>{message.content}</p>
        )}
      </div>
      <div className="message-actions">
        <button className="icon-button small" type="button" aria-label={props.translate('copy')} title={props.translate('copy')} onClick={() => onCopy(message.content)}>
          <Copy size={15} />
        </button>
        {message.role === 'assistant' ? (
          <>
            <button className="icon-button small" type="button" aria-label={props.translate('regenerate')} title={props.translate('regenerate')} onClick={onRetry}>
              <RefreshCw size={15} />
            </button>
            <button className="icon-button small" type="button" aria-label={props.translate('goodResponse')} title={props.translate('goodResponse')}>
              <ThumbsUp size={15} />
            </button>
            <button className="icon-button small" type="button" aria-label="Bad response" title="Bad response">
              <ThumbsDown size={15} />
            </button>
          </>
        ) : null}
        <button className="icon-button small" type="button" aria-label="More message actions" title="More">
          <MoreHorizontal size={15} />
        </button>
      </div>
    </article>
  )
}

function CodeBlock(props: { language: string; value: string }): JSX.Element {
  const [wrapped, setWrapped] = useState(false)
  return (
    <div className="code-block">
      <div className="code-header">
        <span>{props.language}</span>
        <div>
          <button className="code-action" type="button" onClick={() => setWrapped((value) => !value)}>
            {wrapped ? 'No wrap' : 'Wrap'}
          </button>
          <button className="code-action" type="button" onClick={() => navigator.clipboard?.writeText(props.value)}>
            Copy
          </button>
        </div>
      </div>
      <pre className={wrapped ? 'wrapped' : ''}>
        <code>{props.value}</code>
      </pre>
    </div>
  )
}

function Composer(props: {
  value: string
  textareaRef: React.RefObject<HTMLTextAreaElement>
  translate: Translate
  canSend: boolean
  isStreaming: boolean
  toolMenuOpen: boolean
  modelMenuOpen: boolean
  selectedModel: ModelOption
  effort: 'low' | 'medium' | 'high'
  selectedTools: ToolOption[]
  attachedFiles: AttachedFile[]
  onValueChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onToggleToolMenu: () => void
  onToggleModelMenu: () => void
  onSelectModel: (model: ModelOption) => void
  onEffortChange: (effort: 'low' | 'medium' | 'high') => void
  onToggleTool: (toolId: string) => void
  onRemoveTool: (toolId: string) => void
  onRemoveFile: (fileId: string) => void
  availableModels: ModelOption[]
  onOpenProviderSettings: () => void
}): JSX.Element {
  return (
    <section className="composer-zone" aria-label={props.translate('messageGrace')}>
      <div className="composer-shell">
        <div className="composer-chips">
          {props.selectedTools.map((tool) => (
            <Chip key={tool.id} label={tool.label} onRemove={() => props.onRemoveTool(tool.id)} />
          ))}
          {props.attachedFiles.map((file) => (
            <Chip
              key={file.id}
              label={`${file.name} · ${formatBytes(file.size)}`}
              icon={<FileText size={14} />}
              onRemove={() => props.onRemoveFile(file.id)}
            />
          ))}
        </div>

        <textarea
          ref={props.textareaRef}
          value={props.value}
          rows={1}
          aria-label={props.translate('messageGrace')}
          placeholder={props.translate('messageGrace')}
          onChange={(event) => props.onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              props.onSend()
            }
          }}
        />

        <div className="composer-footer">
          <div className="composer-left">
            <button className="icon-button" type="button" aria-label={props.translate('connectApp')} title={props.translate('connectApp')} onClick={props.onToggleToolMenu}>
              <Plus size={18} />
            </button>
            <button className="model-chip" type="button" onClick={props.onToggleModelMenu}>
              {props.selectedModel.label}
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="composer-right">
            <button className="icon-button" type="button" aria-label={props.translate('voice')} title={props.translate('voice')}>
              <Mic size={18} />
            </button>
            {props.isStreaming ? (
              <button className="send-button" type="button" aria-label={props.translate('stop')} title={props.translate('stop')} onClick={props.onStop}>
                <Square size={16} />
              </button>
            ) : (
              <button className="send-button" type="button" aria-label={props.translate('send')} title={props.translate('send')} disabled={!props.canSend} onClick={props.onSend}>
                <Send size={16} />
              </button>
            )}
          </div>
        </div>

        {props.toolMenuOpen ? <ToolMenu selectedToolIds={props.selectedTools.map((tool) => tool.id)} onToggleTool={props.onToggleTool} /> : null}
        {props.modelMenuOpen ? (
          <ModelMenu
            selectedModel={props.selectedModel}
            models={props.availableModels}
            effort={props.effort}
            translate={props.translate}
            onSelectModel={props.onSelectModel}
            onEffortChange={props.onEffortChange}
            onOpenProviderSettings={props.onOpenProviderSettings}
          />
        ) : null}
      </div>
    </section>
  )
}

function ToolMenu(props: { selectedToolIds: string[]; onToggleTool: (toolId: string) => void }): JSX.Element {
  return (
    <div className="floating-menu tool-menu" role="menu" aria-label="Composer tools">
      {tools.map((tool) => {
        const Icon = tool.icon
        const selected = props.selectedToolIds.includes(tool.id)
        return (
          <button key={tool.id} className="menu-row" role="menuitem" type="button" onClick={() => props.onToggleTool(tool.id)}>
            <Icon size={17} />
            <span>
              <strong>{tool.label}</strong>
              <small>{tool.description}</small>
            </span>
            {selected ? <Check size={16} /> : null}
          </button>
        )
      })}
    </div>
  )
}

function ModelMenu(props: {
  selectedModel: ModelOption
  models: ModelOption[]
  effort: 'low' | 'medium' | 'high'
  translate: Translate
  onSelectModel: (model: ModelOption) => void
  onEffortChange: (effort: 'low' | 'medium' | 'high') => void
  onOpenProviderSettings: () => void
}): JSX.Element {
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const filteredModels = filterModelsByQuery(props.models, modelSearchQuery)
  const modelGroups = groupModelsByProvider(filteredModels)
  const firstFilteredModel = filteredModels[0]

  return (
    <div className="floating-menu model-menu" role="menu" aria-label={props.translate('chooseModel')}>
      <div className="menu-heading">{props.translate('chooseModel')}</div>
      <label className="model-search">
        <Search size={15} />
        <input
          autoFocus
          value={modelSearchQuery}
          type="search"
          placeholder={props.translate('modelSearch')}
          aria-label={props.translate('searchModels')}
          onChange={(event) => setModelSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && firstFilteredModel) {
              event.preventDefault()
              props.onSelectModel(firstFilteredModel)
            }
          }}
        />
      </label>
      <div className="model-list-scroll">
        {modelGroups.length > 0 ? (
          modelGroups.map((group) => (
            <section className="model-group" key={group.id} aria-label={group.label}>
              <div className="model-group-heading">
                <strong>{group.label}</strong>
                {group.detail ? <span>{group.detail}</span> : null}
              </div>
              {group.models.map((model) => (
                <button key={model.id} className="model-row" type="button" role="menuitemradio" aria-checked={props.selectedModel.id === model.id} onClick={() => props.onSelectModel(model)}>
                  <span>
                    <strong>{model.label}</strong>
                    <small>{model.description}</small>
                    {model.providerKind === 'custom' ? null : <em>{model.hint}</em>}
                  </span>
                  {props.selectedModel.id === model.id ? <Check size={17} /> : null}
                </button>
              ))}
            </section>
          ))
        ) : (
          <p className="model-empty-state">{props.translate('noModelsFound')}</p>
        )}
      </div>
      {props.selectedModel.supportsEffort ? (
        <div className="effort-control" aria-label="Reasoning effort">
          {(['low', 'medium', 'high'] as const).map((value) => (
            <button
              key={value}
              className={props.effort === value ? 'active' : ''}
              type="button"
              onClick={() => props.onEffortChange(value)}
            >
              {props.translate(value === 'low' ? 'effortLow' : value === 'medium' ? 'effortMedium' : 'effortHigh')}
            </button>
          ))}
        </div>
      ) : null}
      <button className="menu-secondary-action" type="button" onClick={props.onOpenProviderSettings}>
        <Settings size={16} />
        {props.translate('providerSettings')}
      </button>
    </div>
  )
}

function ProviderSettingsModal(props: {
  providers: CustomProviderSummary[]
  themeMode: ThemeMode
  locale: Locale
  mcpServers: McpServer[]
  translate: Translate
  onClose: () => void
  onThemeChange: (themeMode: ThemeMode) => void
  onLocaleChange: (locale: Locale) => void
  onUpsertMcpServer: (server: Omit<McpServer, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => void
  onUpdateMcpServer: (serverId: string, patch: Partial<McpServer>) => void
  onDeleteMcpServer: (serverId: string) => void
  onSaved: (provider: CustomProviderSummary) => void
}): JSX.Element {
  const [selectedProviderId, setSelectedProviderId] = useState(props.providers.find((provider) => provider.configured)?.id ?? 'openai')
  const selectedProvider =
    props.providers.find((provider) => provider.id === selectedProviderId) ??
    props.providers[0] ?? {
      id: providerPresets[0].id,
      label: providerPresets[0].label,
      apiFormat: providerPresets[0].apiFormat,
      baseUrl: providerPresets[0].baseUrl,
      configured: false,
      models: []
    }
  const selectedPreset = providerPresets.find((provider) => provider.id === selectedProvider.id) ?? providerPresets[0]
  const [baseUrl, setBaseUrl] = useState(selectedProvider.baseUrl || selectedPreset.baseUrl)
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'refreshing'>('idle')
  const [error, setError] = useState<string | null>(selectedProvider.lastError ?? null)
  const [mcpDraft, setMcpDraft] = useState({
    name: '',
    transport: 'command' as McpServer['transport'],
    url: '',
    command: '',
    envText: ''
  })

  useEffect(() => {
    const provider = props.providers.find((candidate) => candidate.id === selectedProviderId)
    const preset = providerPresets.find((candidate) => candidate.id === selectedProviderId)
    setBaseUrl(provider?.baseUrl || preset?.baseUrl || '')
    setApiKey('')
    setError(provider?.lastError ?? null)
  }, [props.providers, selectedProviderId])

  const hasStoredKey = Boolean(selectedProvider.configured)
  const baseUrlMatchesStored = baseUrl.trim().replace(/\/+$/, '') === selectedProvider.baseUrl.trim().replace(/\/+$/, '')
  const canSave = baseUrl.trim().length > 0 && (apiKey.trim().length > 0 || (hasStoredKey && baseUrlMatchesStored))

  async function saveProvider(): Promise<void> {
    if (!apiKey.trim() && hasStoredKey) {
      await refreshModels()
      return
    }

    setStatus('saving')
    setError(null)

    try {
      const provider = await window.graceAI.saveCustomProvider({
        providerId: selectedProvider.id,
        baseUrl,
        apiKey
      })
      props.onSaved(provider)
      setApiKey('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save provider.')
    } finally {
      setStatus('idle')
    }
  }

  async function refreshModels(): Promise<void> {
    setStatus('refreshing')
    setError(null)

    try {
      const provider = await window.graceAI.refreshCustomProviderModels(selectedProvider.id)
      props.onSaved(provider)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh models.')
    } finally {
      setStatus('idle')
    }
  }

  function addMcpServer(): void {
    const hasTarget = mcpDraft.transport === 'http' ? mcpDraft.url.trim() : mcpDraft.command.trim()
    if (!mcpDraft.name.trim() || !hasTarget) return

    props.onUpsertMcpServer({
      name: mcpDraft.name,
      transport: mcpDraft.transport,
      url: mcpDraft.url,
      command: mcpDraft.command,
      envText: mcpDraft.envText,
      enabled: true
    })
    setMcpDraft({
      name: '',
      transport: 'command',
      url: '',
      command: '',
      envText: ''
    })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <div>
            <h2 id="settings-title">{props.translate('settings')}</h2>
            <p>{props.translate('providerSettingsHelp')}</p>
          </div>
          <button className="icon-button" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>

        <section className="settings-section" aria-labelledby="appearance-settings-title">
          <div>
            <strong id="appearance-settings-title">{props.translate('appearance')}</strong>
            <p>{props.translate('appearanceHelp')}</p>
          </div>
          <div className="settings-inline-controls">
            <div className="theme-segmented" role="group" aria-label={props.translate('theme')}>
              <button className={props.themeMode === 'light' ? 'active' : ''} type="button" aria-pressed={props.themeMode === 'light'} onClick={() => props.onThemeChange('light')}>
                <Sun size={15} />
                {props.translate('light')}
              </button>
              <button className={props.themeMode === 'dark' ? 'active' : ''} type="button" aria-pressed={props.themeMode === 'dark'} onClick={() => props.onThemeChange('dark')}>
                <Moon size={15} />
                {props.translate('dark')}
              </button>
            </div>
            <div className="theme-segmented language-segmented" role="group" aria-label={props.translate('language')}>
              {locales.map((item) => (
                <button
                  key={item.id}
                  className={props.locale === item.id ? 'active' : ''}
                  type="button"
                  aria-pressed={props.locale === item.id}
                  onClick={() => props.onLocaleChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="settings-subheader">
          <strong>{props.translate('providerSettings')}</strong>
          <p>Models load from the provider after the key is saved.</p>
        </div>

        <div className="provider-grid">
          {props.providers.map((provider) => (
            <button
              key={provider.id}
              className={`provider-card ${provider.id === selectedProvider.id ? 'active' : ''}`}
              type="button"
              onClick={() => setSelectedProviderId(provider.id ?? 'custom')}
            >
              <strong>{provider.label}</strong>
              <span>{provider.configured ? `${provider.models.length} models` : providerPresets.find((preset) => preset.id === provider.id)?.modelHint}</span>
            </button>
          ))}
        </div>

        <div className="settings-form">
          <label>
            <span>{props.translate('baseUrl')}</span>
            <input value={baseUrl} type="url" placeholder={selectedPreset.baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <label>
            <span>{props.translate('apiKey')}</span>
            <input
              value={apiKey}
              type="password"
              placeholder={hasStoredKey ? props.translate('apiKeyPlaceholder') : `${selectedProvider.label} API key`}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
        </div>

        {error ? <div className="settings-error" role="alert">{error}</div> : null}

        <div className="settings-actions">
          <button className="text-button" type="button" onClick={refreshModels} disabled={!hasStoredKey || status !== 'idle'}>
            <RefreshCw size={15} />
            {props.translate('refreshModels')}
          </button>
          <button className="primary-button" type="button" onClick={saveProvider} disabled={!canSave || status !== 'idle'}>
            {status === 'saving' ? 'Checking...' : status === 'refreshing' ? 'Refreshing...' : props.translate('saveProvider')}
          </button>
        </div>

        <div className="settings-models">
          <div className="settings-models-header">
            <strong>{selectedProvider.models.length} models</strong>
            {selectedProvider.updatedAt ? <span>Updated {new Date(selectedProvider.updatedAt).toLocaleString()}</span> : null}
          </div>
          <div className="settings-model-list">
            {selectedProvider.models.length > 0 ? (
              selectedProvider.models.map((model) => (
                <div className="settings-model-row" key={model.id}>
                  <strong>{model.label}</strong>
                  <span>{model.id}</span>
                </div>
              ))
            ) : (
              <p>No models loaded for {selectedProvider.label} yet.</p>
            )}
          </div>
        </div>

        <div className="settings-subheader">
          <strong>{props.translate('mcpServers')}</strong>
          <p>{props.translate('mcpServersHelp')}</p>
        </div>

        <div className="mcp-list">
          {props.mcpServers.map((server) => (
            <article className="mcp-card" key={server.id}>
              <div>
                <strong>{server.name}</strong>
                <span>{server.transport === 'http' ? server.url : server.command}</span>
              </div>
              <div className="mcp-card-actions">
                <button
                  className={`mini-toggle ${server.enabled ? 'active' : ''}`}
                  type="button"
                  onClick={() => props.onUpdateMcpServer(server.id, { enabled: !server.enabled })}
                >
                  {server.enabled ? props.translate('enabled') : props.translate('disabled')}
                </button>
                <button className="icon-button small" type="button" aria-label={props.translate('delete')} title={props.translate('delete')} onClick={() => props.onDeleteMcpServer(server.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="settings-form mcp-form">
          <label>
            <span>{props.translate('name')}</span>
            <input value={mcpDraft.name} placeholder="Notion" onChange={(event) => setMcpDraft((draft) => ({ ...draft, name: event.target.value }))} />
          </label>
          <label>
            <span>{props.translate('transport')}</span>
            <select value={mcpDraft.transport} onChange={(event) => setMcpDraft((draft) => ({ ...draft, transport: event.target.value as McpServer['transport'] }))}>
              <option value="command">Command</option>
              <option value="http">HTTP</option>
            </select>
          </label>
          {mcpDraft.transport === 'http' ? (
            <label>
              <span>URL</span>
              <input value={mcpDraft.url} type="url" placeholder="https://mcp.example.com" onChange={(event) => setMcpDraft((draft) => ({ ...draft, url: event.target.value }))} />
            </label>
          ) : (
            <label>
              <span>{props.translate('command')}</span>
              <input value={mcpDraft.command} placeholder="npx @notionhq/notion-mcp-server" onChange={(event) => setMcpDraft((draft) => ({ ...draft, command: event.target.value }))} />
            </label>
          )}
          <label>
            <span>{props.translate('env')}</span>
            <textarea value={mcpDraft.envText} placeholder="NOTION_TOKEN=..." onChange={(event) => setMcpDraft((draft) => ({ ...draft, envText: event.target.value }))} />
          </label>
          <div className="settings-actions">
            <button className="primary-button" type="button" onClick={addMcpServer}>
              {props.translate('mcpAdd')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function SetupAgentModal(props: {
  messages: SetupAgentMessage[]
  translate: Translate
  onClose: () => void
  onSend: (value: string) => Promise<void>
}): JSX.Element {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [props.messages])

  async function submit(): Promise<void> {
    const trimmedValue = value.trim()
    if (!trimmedValue || sending) return
    setSending(true)
    setValue('')
    try {
      await props.onSend(trimmedValue)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal setup-agent-modal" role="dialog" aria-modal="true" aria-labelledby="setup-agent-title">
        <header className="settings-header">
          <div>
            <h2 id="setup-agent-title">{props.translate('setupAgent')}</h2>
            <p>{props.translate('setupAgentHelp')}</p>
          </div>
          <button className="icon-button" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="setup-agent-route">
          <Bot size={16} />
          <span>{props.translate('setupAgentRoute')}</span>
        </div>

        <div className="setup-agent-thread">
          {props.messages.map((message) => (
            <article className={`setup-agent-message ${message.role}`} key={message.id}>
              {message.content}
            </article>
          ))}
          {sending ? <article className="setup-agent-message assistant">...</article> : null}
          <div ref={bottomRef} />
        </div>

        <div className="setup-agent-composer">
          <textarea
            value={value}
            rows={3}
            placeholder={props.translate('setupAgentPlaceholder')}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <button className="send-button" type="button" aria-label={props.translate('send')} title={props.translate('send')} disabled={!value.trim() || sending} onClick={() => void submit()}>
            <Send size={16} />
          </button>
        </div>
      </section>
    </div>
  )
}

function SkillsModal(props: {
  skills: SkillSummary[]
  translate: Translate
  onClose: () => void
  onInstallSkill: (skill: SkillSummary) => void
}): JSX.Element {
  const [draft, setDraft] = useState<SkillInstallDraft>({ url: '', status: 'idle' })

  function installFromUrl(): void {
    const url = draft.url.trim()

    try {
      const parsedUrl = new URL(url)
      if (parsedUrl.hostname !== 'github.com' && parsedUrl.hostname !== 'raw.githubusercontent.com') {
        throw new Error('Use a GitHub skill URL.')
      }

      const pathParts = parsedUrl.pathname.split('/').filter(Boolean)
      const repoName = pathParts[1] ?? 'Imported skill'
      const fileName = pathParts.at(-1) ?? 'SKILL.md'
      const skillName = fileName.toLowerCase() === 'skill.md' ? repoName : fileName.replace(/\.[^.]+$/, '')

      props.onInstallSkill({
        id: `installed-${Date.now().toString(36)}`,
        name: skillName,
        description: 'Imported from a GitHub skill URL. Agent installation can fetch the full skill files from this source.',
        sourceUrl: url,
        appliesTo: ['Imported workflow', 'Agent-assisted installation'],
        status: 'installed'
      })
      setDraft({ url: '', status: 'installed', message: 'Skill URL added.' })
    } catch (error) {
      setDraft({
        url,
        status: 'error',
        message: error instanceof Error ? error.message : 'Invalid skill URL.'
      })
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal skills-modal" role="dialog" aria-modal="true" aria-labelledby="skills-title">
        <header className="settings-header">
          <div>
            <h2 id="skills-title">{props.translate('skills')}</h2>
            <p>Preset skills and GitHub skill links available to Grace.</p>
          </div>
          <button className="icon-button" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="skill-install-box">
          <label>
            <span>Install from GitHub URL</span>
            <input
              value={draft.url}
              type="url"
              placeholder="https://github.com/org/repo/blob/main/skill/SKILL.md"
              onChange={(event) => setDraft({ url: event.target.value, status: 'idle' })}
            />
          </label>
          <button className="primary-button" type="button" disabled={!draft.url.trim()} onClick={installFromUrl}>
            Add skill URL
          </button>
          {draft.message ? <p className={`skill-install-message ${draft.status}`}>{draft.message}</p> : null}
        </div>

        <div className="skill-list">
          {props.skills.map((skill) => (
            <article className="skill-card" key={`${skill.status}:${skill.sourceUrl}`}>
              <div className="skill-card-header">
                <strong>{skill.name}</strong>
                <span>{skill.status}</span>
              </div>
              <p>{skill.description}</p>
              <div className="skill-tags">
                {skill.appliesTo.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <a href={skill.sourceUrl} target="_blank" rel="noreferrer">
                Source
              </a>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function Chip(props: { label: string; icon?: JSX.Element; onRemove: () => void }): JSX.Element {
  return (
    <span className="chip">
      {props.icon}
      {props.label}
      <button type="button" aria-label={`Remove ${props.label}`} onClick={props.onRemove}>
        <X size={13} />
      </button>
    </span>
  )
}

function CanvasPanel(props: { value: string; translate: Translate; onChange: (value: string) => void; onClose: () => void }): JSX.Element {
  return (
    <aside className="canvas-panel" aria-label="Canvas editor">
      <header className="canvas-header">
        <button className="icon-button mobile-only" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
          <X size={18} />
        </button>
        <div>
          <strong>{props.translate('workingCanvas')}</strong>
          <span>Version 1 · Editable draft</span>
        </div>
        <div className="canvas-actions">
          <button className="text-button" type="button" onClick={() => navigator.clipboard?.writeText(props.value)}>
            <Copy size={15} />
            {props.translate('copy')}
          </button>
          <button className="icon-button" type="button" aria-label={props.translate('delete')} title={props.translate('delete')}>
            <Trash2 size={17} />
          </button>
          <button className="icon-button" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="canvas-toolbar">
        <button type="button">{props.translate('askSelection')}</button>
        <button type="button">{props.translate('export')}</button>
        <button type="button">{props.translate('history')}</button>
      </div>
      <textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} aria-label="Canvas document" />
    </aside>
  )
}

function ShareIcon(): JSX.Element {
  return <Copy size={15} />
}

function useCloseOnOutsideClick<T extends HTMLElement>(
  open: boolean,
  onClose: () => void
): React.RefObject<T> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent): void {
      const target = event.target
      if (target instanceof Node && ref.current && !ref.current.contains(target)) {
        onClose()
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, open])

  return ref
}

function usePersistentState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const storedValue = localStorage.getItem(key)
      return storedValue ? (JSON.parse(storedValue) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue]
}
