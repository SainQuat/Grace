import {
  Archive,
  BarChart3,
  BookOpen,
  Bot,
  Code2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  FileText,
  Folder,
  History,
  Image,
  Mail,
  Menu,
  Moon,
  MoreHorizontal,
  PanelRight,
  Paperclip,
  Palette,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Settings,
  Square,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserPlus,
  Users,
  X,
  Zap
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { mcpMarketplacePresets } from '../../shared/mcpMarketplace'
import { providerPresets } from '../../shared/providerPresets'
import type { ChatMessagePayload, ChatStreamEvent, CustomProviderSummary, ProviderModel, SkillSummary } from '../../shared/types'
import { advanceAgentRun, createAgentRun, getAgentRunProgress, setAgentRunExpanded, type AgentRun } from './agentWorkflow'
import { locales, translate, type Locale, type Translate, type TranslationKey } from './i18n'
import { createPersistentStateEnvelope, ensureArrayNonEmpty, safeParsePersistentValue } from './persistentState'
import { createSetupAgentPlan, redactSetupSecrets, shouldAskRemoteSetupAgent } from './setupAgent'
import {
  createDraftTitle,
  createNotificationBody,
  detectCodeIntent,
  extractFirstCodeBlock,
  filterModelsByQuery,
  filterSkillsByQuery,
  formatBytes,
  getLeadingSkillMentionQuery,
  groupModelsByProvider,
  uid
} from './utils'
import {
  applyArtifactDiff,
  createArtifactDiff,
  createMemoryContext,
  createUsageRecord,
  filterPromptTemplates,
  finalizeUsageRecord,
  getMemoryForScope,
  isLocalProviderUrl,
  rejectArtifactDiff,
  selectModelForRouter,
  summarizeUsage,
  updateUsageCompletion,
  type ArtifactDiff,
  type MemoryEntry,
  type ModelRouterMode,
  type PrivacySettings,
  type PromptTemplate,
  type UsageRecord
} from './workspaceFeatures'

type Role = 'user' | 'assistant'
type ThemeMode = 'light' | 'dark'
type RightPanelMode = 'canvas' | 'library' | 'tasks' | 'code' | 'memory' | 'checkpoints' | 'usage'

interface Message {
  id: string
  role: Role
  content: string
  skill?: SkillSummary
  pending?: boolean
  agentRun?: AgentRun
}

interface Chat {
  id: string
  title: string
  project?: string
  projectId?: string
  spaceId?: string
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

interface SpaceMember {
  id: string
  name: string
  email: string
  role: 'owner' | 'member'
  status: 'active' | 'invited'
}

interface Space {
  id: string
  name: string
  icon: ProjectIconId
  color: string
  members: SpaceMember[]
  createdAt: string
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
  sourcePresetId?: string
  description?: string
  requiredEnv?: string[]
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

interface LibraryFile {
  id: string
  name: string
  size: number
  addedAt: string
}

interface ScheduledTask {
  id: string
  title: string
  schedule: string
  done: boolean
  createdAt: string
  prompt?: string
  enabled?: boolean
  status?: 'idle' | 'running' | 'done' | 'error'
  runHistory?: Array<{ id: string; status: 'done' | 'error'; at: string; chatId?: string }>
}

interface CodeWorkspace {
  content: string
  language: string
  selectedText: string
  instruction: string
  sourceRequestId?: string
  version?: number
  pendingDiff?: ArtifactDiff
}

interface ChatCheckpoint {
  id: string
  chatId: string
  title: string
  createdAt: string
  messageCount: number
  snapshot: {
    messages: Message[]
    canvasValue: string
    codeWorkspace: CodeWorkspace
  }
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

const projectColors = ['#f97316', '#ea580c', '#d97706', '#92400e', '#78716c', '#57534e', '#44403c', '#302c25']

const initialProjects: Project[] = [
  { id: 'project-grace', name: 'Grace', icon: 'bot', color: '#f97316' },
  { id: 'project-writing', name: 'Writing', icon: 'book', color: '#78716c' }
]

const initialSpaces: Space[] = [
  {
    id: 'space-grace-team',
    name: 'Grace Team',
    icon: 'bot',
    color: '#d97706',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    members: [
      {
        id: 'member-owner',
        name: 'You',
        email: 'you@grace.local',
        role: 'owner',
        status: 'active'
      },
      {
        id: 'member-demo-invite',
        name: 'Friend',
        email: 'friend@example.com',
        role: 'member',
        status: 'invited'
      }
    ]
  }
]

const tools: ToolOption[] = [
  { id: 'attach', label: 'Attach file', description: 'Add docs, images, or notes', icon: Paperclip },
  { id: 'canvas', label: 'Open canvas', description: 'Work in a side document', icon: PanelRight }
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

const promptSuggestions: TranslationKey[] = [
  'promptReleaseChecklist',
  'promptRewriteNote',
  'promptExplainCode',
  'promptPlanRelease',
  'promptSummarizeFile'
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

function isModelLocal(model: ModelOption, providers: CustomProviderSummary[]): boolean {
  if (model.provider.toLowerCase().includes('local')) return true
  if (model.providerKind !== 'custom') return false

  const provider = providers.find((candidate) => candidate.id === model.providerId)
  return Boolean(provider?.baseUrl && isLocalProviderUrl(provider.baseUrl))
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
    id: 'chat-shared-space',
    title: 'Общий чат команды',
    spaceId: 'space-grace-team',
    updatedAt: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
    messages: [
      {
        id: 'shared-m1',
        role: 'assistant',
        content:
          'Это общий чат внутри пространства. Пока приглашения хранятся локально, без отправки почты и без backend-синхронизации.'
      }
    ]
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

const initialScheduledTasks: ScheduledTask[] = [
  {
    id: 'task-release-check',
    title: 'Проверить релиз перед публикацией',
    schedule: 'Перед каждым tag v*',
    done: false,
    prompt: 'Проверь готовность следующего релиза Grace и составь короткий checklist.',
    enabled: true,
    status: 'idle',
    runHistory: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString()
  }
]

const initialCodeWorkspace: CodeWorkspace = {
  content: '',
  language: 'text',
  selectedText: '',
  instruction: '',
  version: 1
}

const initialPromptTemplates: PromptTemplate[] = [
  {
    id: 'prompt-release-notes',
    title: 'Release notes',
    content: 'Напиши понятные release notes: что добавили, что исправили, что проверить перед установкой.',
    tags: ['release', 'ship'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'prompt-design-review',
    title: 'Strict UI review',
    content: 'Проверь интерфейс на строгий Conductor-like стиль: плотность, контраст, реальные controls, отсутствие AI slop.',
    tags: ['design', 'qa'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

const initialPrivacySettings: PrivacySettings = {
  localOnly: false,
  allowNotifications: true,
  allowRemoteSetupAgent: false
}

function resolveChatProjectId(chat: Chat, projects: Project[]): string | undefined {
  if (chat.projectId) return chat.projectId
  if (!chat.project) return undefined
  return projects.find((project) => project.name === chat.project)?.id
}

function getProjectIcon(iconId: ProjectIconId): typeof Folder {
  return projectIconOptions.find((option) => option.id === iconId)?.icon ?? Folder
}

function createOwnerMember(): SpaceMember {
  return {
    id: uid('member'),
    name: 'You',
    email: 'you@grace.local',
    role: 'owner',
    status: 'active'
  }
}

function createInvitedMember(email: string): SpaceMember {
  const name = email.split('@')[0]?.trim() || 'Member'
  return {
    id: uid('member'),
    name,
    email,
    role: 'member',
    status: 'invited'
  }
}

function getMemberLabel(count: number, translateFn: Translate): string {
  return count === 1 ? translateFn('member') : translateFn('members')
}

function createSkillContext(skill: SkillSummary): string {
  const appliesTo = skill.appliesTo.length > 0 ? skill.appliesTo.join(', ') : 'General assistance'

  return [
    'Use the selected Grace skill for this response.',
    `Skill: ${skill.name}`,
    `Description: ${skill.description}`,
    `Applies to: ${appliesTo}`,
    `Source: ${skill.sourceUrl}`
  ].join('\n')
}

function getCodeWorkspaceFromAssistantContent(content: string, current: CodeWorkspace): CodeWorkspace {
  const extracted = extractFirstCodeBlock(content)

  if (!extracted) {
    return {
      ...current,
      content,
      language: current.language === 'text' ? 'text' : current.language
    }
  }

  return {
    ...current,
    content: extracted.code,
    language: extracted.language || 'text'
  }
}

function createCodeRevisionPrompt(code: string, selectedText: string, instruction: string): string {
  const target = selectedText.trim() ? selectedText.trim() : code.trim()
  const scope = selectedText.trim() ? 'выделенный фрагмент' : 'весь текущий код'

  return [
    `Доработай ${scope}.`,
    `Правка: ${instruction.trim() || 'улучши код по контексту чата'}`,
    '',
    'Верни обновленный код в одном fenced code block.',
    '',
    '```',
    target,
    '```'
  ].join('\n')
}

export function App(): JSX.Element {
  const [chats, setChats] = usePersistentState<Chat[]>('grace.chats', initialChats, ensureArrayNonEmpty)
  const [activeChatId, setActiveChatId] = usePersistentState<string>('grace.activeChatId', initialChats[0].id)
  const [sidebarOpen, setSidebarOpen] = usePersistentState('grace.sidebarOpen', true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = usePersistentState('grace.canvasOpen', false)
  const [rightPanelMode, setRightPanelMode] = usePersistentState<RightPanelMode>('grace.rightPanelMode', 'canvas')
  const [canvasValue, setCanvasValue] = usePersistentState('grace.canvasValue', canvasInitialValue)
  const [libraryFiles, setLibraryFiles] = usePersistentState<LibraryFile[]>('grace.libraryFiles', [])
  const [scheduledTasks, setScheduledTasks] = usePersistentState<ScheduledTask[]>(
    'grace.scheduledTasks',
    initialScheduledTasks
  )
  const [codeWorkspace, setCodeWorkspace] = usePersistentState<CodeWorkspace>(
    'grace.codeWorkspace',
    initialCodeWorkspace
  )
  const [composerValue, setComposerValue] = useState('')
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [modelId, setModelId] = usePersistentState('grace.modelId', builtInModels[0].id)
  const [effort, setEffort] = usePersistentState<'low' | 'medium' | 'high'>('grace.effort', 'medium')
  const [themeMode, setThemeMode] = usePersistentState<ThemeMode>('grace.themeMode', 'dark')
  const [locale, setLocale] = usePersistentState<Locale>('grace.locale', 'ru')
  const [responseNotificationsEnabled, setResponseNotificationsEnabled] = usePersistentState(
    'grace.responseNotificationsEnabled',
    true
  )
  const [projects, setProjects] = usePersistentState<Project[]>('grace.projects', initialProjects)
  const [spaces, setSpaces] = usePersistentState<Space[]>('grace.spaces', initialSpaces)
  const [projectsCollapsed, setProjectsCollapsed] = usePersistentState('grace.projectsCollapsed', false)
  const [spacesCollapsed, setSpacesCollapsed] = usePersistentState('grace.spacesCollapsed', false)
  const [activeProjectId, setActiveProjectId] = usePersistentState<string | null>(
    'grace.activeProjectId',
    null
  )
  const [activeSpaceId, setActiveSpaceId] = usePersistentState<string | null>('grace.activeSpaceId', null)
  const [mcpServers, setMcpServers] = usePersistentState<McpServer[]>('grace.mcpServers', [])
  const [memoryEntries, setMemoryEntries] = usePersistentState<MemoryEntry[]>('grace.memoryEntries', [])
  const [promptTemplates, setPromptTemplates] = usePersistentState<PromptTemplate[]>('grace.promptTemplates', initialPromptTemplates)
  const [checkpoints, setCheckpoints] = usePersistentState<ChatCheckpoint[]>('grace.checkpoints', [])
  const [usageRecords, setUsageRecords] = usePersistentState<UsageRecord[]>('grace.usageRecords', [])
  const [privacySettings, setPrivacySettings] = usePersistentState<PrivacySettings>('grace.privacySettings', initialPrivacySettings)
  const [modelRouterMode, setModelRouterMode] = usePersistentState<ModelRouterMode>('grace.modelRouterMode', 'manual')
  const [sidebarSearch, setSidebarSearch] = useState('')
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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [projectDialog, setProjectDialog] = useState<{ mode: 'create' | 'edit'; projectId?: string } | null>(null)
  const [spaceDialog, setSpaceDialog] = useState<{ mode: 'create' | 'edit'; spaceId?: string } | null>(null)
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
  const [activeRequests, setActiveRequests] = useState<Record<string, string>>({})
  const requestChatRef = useRef<Record<string, string>>({})
  const responseContentRef = useRef<Record<string, string>>({})
  const usageByRequestRef = useRef<Record<string, string>>({})
  const nextRevisionBaseRef = useRef<string | null>(null)
  const revisionBaseByRequestRef = useRef<Record<string, string>>({})
  const stoppedRequestRef = useRef<Set<string>>(new Set())
  const chatsRef = useRef(chats)
  const activeChatIdRef = useRef(activeChatId)
  const responseNotificationsEnabledRef = useRef(responseNotificationsEnabled)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const availableModels = useMemo(
    () => [...builtInModels, ...toProviderModelOptions(providers)],
    [providers]
  )
  const visibleSkills = useMemo(() => [...presetSkills, ...installedSkills], [installedSkills])
  const t: Translate = useMemo(() => (key) => translate(locale, key), [locale])
  const selectedSkill = visibleSkills.find((skill) => skill.id === selectedSkillId) ?? null
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0]
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) ?? null
  const activeMemoryEntries = useMemo(
    () =>
      getMemoryForScope(memoryEntries, [
        { scope: 'project', scopeId: activeChat.projectId ?? activeProjectId },
        { scope: 'space', scopeId: activeChat.spaceId ?? activeSpaceId },
        { scope: 'chat', scopeId: activeChat.id }
      ]),
    [activeChat.id, activeChat.projectId, activeChat.spaceId, activeProjectId, activeSpaceId, memoryEntries]
  )
  const scopedChats = useMemo(
    () =>
      activeSpaceId
        ? chats.filter((chat) => chat.spaceId === activeSpaceId)
        : activeProjectId
        ? chats.filter((chat) => resolveChatProjectId(chat, projects) === activeProjectId)
        : chats,
    [activeProjectId, activeSpaceId, chats, projects]
  )
  const normalizedSidebarSearch = sidebarSearch.trim().toLowerCase()
  const visibleChats = useMemo(
    () =>
      normalizedSidebarSearch
        ? scopedChats.filter((chat) =>
            [chat.title, chat.project, chat.messages.at(-1)?.content ?? ''].some((value) =>
              value?.toLowerCase().includes(normalizedSidebarSearch)
            )
          )
        : scopedChats,
    [normalizedSidebarSearch, scopedChats]
  )
  const visibleProjects = useMemo(
    () =>
      normalizedSidebarSearch
        ? projects.filter((project) => project.name.toLowerCase().includes(normalizedSidebarSearch))
        : projects,
    [normalizedSidebarSearch, projects]
  )
  const visibleSpaces = useMemo(
    () =>
      normalizedSidebarSearch
        ? spaces.filter((space) => space.name.toLowerCase().includes(normalizedSidebarSearch))
        : spaces,
    [normalizedSidebarSearch, spaces]
  )
  const routedModel = modelRouterMode === 'manual' ? undefined : selectModelForRouter(availableModels, modelRouterMode, providers)
  const selectedModel = routedModel ?? availableModels.find((model) => model.id === modelId) ?? availableModels[0]
  const selectedTools = tools.filter((tool) => selectedToolIds.includes(tool.id))
  const canSend = composerValue.trim().length > 0 || attachedFiles.length > 0
  const activeChatRequestId = Object.entries(activeRequests).find(([, chatId]) => chatId === activeChat.id)?.[0] ?? null
  const isStreaming = Boolean(activeChatRequestId)
  const runningChatIds = useMemo(() => new Set(Object.values(activeRequests)), [activeRequests])
  const usageSummary = useMemo(() => summarizeUsage(usageRecords), [usageRecords])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = 'dark'
  }, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.platform = navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'other'
  }, [])

  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  useEffect(() => {
    responseNotificationsEnabledRef.current = responseNotificationsEnabled
  }, [responseNotificationsEnabled])

  useEffect(() => {
    if (selectedSkillId && !visibleSkills.some((skill) => skill.id === selectedSkillId)) {
      setSelectedSkillId(null)
    }
  }, [selectedSkillId, visibleSkills])

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
    if (activeSpaceId && !spaces.some((space) => space.id === activeSpaceId)) {
      setActiveSpaceId(null)
    }
  }, [activeSpaceId, spaces, setActiveSpaceId])

  useEffect(() => {
    if (!chats.some((chat) => chat.id === activeChatId)) {
      setActiveChatId((chats[0] ?? initialChats[0]).id)
    }
  }, [activeChatId, chats, setActiveChatId])

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
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false)
          return
        }
        if (providerSettingsOpen) {
          setProviderSettingsOpen(false)
          return
        }
        if (setupAgentOpen) {
          setSetupAgentOpen(false)
          return
        }
        if (skillsOpen) {
          setSkillsOpen(false)
          return
        }
        if (projectDialog) {
          setProjectDialog(null)
          return
        }
        if (spaceDialog) {
          setSpaceDialog(null)
          return
        }
        if (toolMenuOpen) {
          setToolMenuOpen(false)
          return
        }
        if (modelMenuOpen) {
          setModelMenuOpen(false)
          return
        }
        if (mobileSidebarOpen) {
          setMobileSidebarOpen(false)
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((open) => !open)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commandPaletteOpen, mobileSidebarOpen, modelMenuOpen, projectDialog, providerSettingsOpen, setupAgentOpen, skillsOpen, spaceDialog, toolMenuOpen])

  function handleStreamEvent(event: ChatStreamEvent): void {
    const targetChatId = requestChatRef.current[event.requestId] ?? activeChatIdRef.current

    if (event.type === 'delta') {
      responseContentRef.current[event.requestId] = `${responseContentRef.current[event.requestId] ?? ''}${event.text}`
      const nextResponseContent = responseContentRef.current[event.requestId]
      setCodeWorkspace((currentWorkspace) =>
        currentWorkspace.sourceRequestId === event.requestId
          ? getCodeWorkspaceFromAssistantContent(nextResponseContent, currentWorkspace)
          : currentWorkspace
      )
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === targetChatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.id === event.requestId
                    ? {
                        ...message,
                        content: `${message.content}${event.text}`,
                        pending: true,
                        agentRun: message.agentRun ? advanceAgentRun(message.agentRun, 'delta') : undefined
                      }
                    : message
                )
              }
            : chat
        )
      )
      setUsageRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.id === usageByRequestRef.current[event.requestId]
            ? updateUsageCompletion(record, responseContentRef.current[event.requestId]?.length ?? 0)
            : record
        )
      )
      return
    }

    if (event.type === 'done') {
      notifyResponseComplete(event.requestId, targetChatId)
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === targetChatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.id === event.requestId
                    ? {
                        ...message,
                        pending: false,
                        agentRun: message.agentRun ? advanceAgentRun(message.agentRun, 'done') : undefined
                      }
                    : message
                )
              }
            : chat
        )
      )
      setUsageRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.id === usageByRequestRef.current[event.requestId] ? finalizeUsageRecord(record, 'completed') : record
        )
      )
      setActiveRequests((current) => {
        const next = { ...current }
        delete next[event.requestId]
        return next
      })
      setCodeWorkspace((currentWorkspace) => {
        if (currentWorkspace.sourceRequestId !== event.requestId) return currentWorkspace
        const revisionBase = revisionBaseByRequestRef.current[event.requestId]
        if (revisionBase && currentWorkspace.content.trim() && currentWorkspace.content !== revisionBase) {
          return {
            ...currentWorkspace,
            content: revisionBase,
            sourceRequestId: undefined,
            pendingDiff: createArtifactDiff(uid('diff'), revisionBase, currentWorkspace.content, 'Targeted code edit'),
            version: currentWorkspace.version ?? 1
          }
        }

        return { ...currentWorkspace, sourceRequestId: undefined, version: currentWorkspace.version ?? 1 }
      })
      delete requestChatRef.current[event.requestId]
      delete responseContentRef.current[event.requestId]
      delete usageByRequestRef.current[event.requestId]
      delete revisionBaseByRequestRef.current[event.requestId]
      stoppedRequestRef.current.delete(event.requestId)
      return
    }

    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === targetChatId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === event.requestId
                  ? {
                      ...message,
                      content: `Generation failed: ${event.message}`,
                      pending: false,
                      agentRun: message.agentRun ? advanceAgentRun(message.agentRun, 'error') : undefined
                    }
                  : message
              )
            }
          : chat
      )
    )
    setUsageRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.id === usageByRequestRef.current[event.requestId] ? finalizeUsageRecord(record, 'error', undefined, event.message) : record
      )
    )
    setActiveRequests((current) => {
      const next = { ...current }
      delete next[event.requestId]
      return next
    })
    setCodeWorkspace((currentWorkspace) =>
      currentWorkspace.sourceRequestId === event.requestId ? { ...currentWorkspace, sourceRequestId: undefined } : currentWorkspace
    )
    delete requestChatRef.current[event.requestId]
    delete responseContentRef.current[event.requestId]
    delete usageByRequestRef.current[event.requestId]
    delete revisionBaseByRequestRef.current[event.requestId]
    stoppedRequestRef.current.delete(event.requestId)
  }

  function notifyResponseComplete(requestId: string, chatId: string): void {
    if (!responseNotificationsEnabledRef.current || stoppedRequestRef.current.has(requestId)) {
      return
    }

    const body = createNotificationBody(responseContentRef.current[requestId] ?? '')
    if (!body) {
      return
    }

    const chat = chatsRef.current.find((candidate) => candidate.id === chatId)
    void window.graceAI
      .showResponseNotification({
        title: chat?.title || 'Grace',
        body
      })
      .catch((error) => {
        console.warn('Could not show response notification', error)
      })
  }

  function createNewChat(): void {
    const chat: Chat = {
      id: uid('chat'),
      title: t('newChat'),
      projectId: activeSpaceId ? undefined : activeProjectId ?? undefined,
      project: activeSpaceId ? undefined : activeProject?.name,
      spaceId: activeSpaceId ?? undefined,
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
    setActiveSpaceId(null)
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
    setActiveSpaceId(chat.spaceId ?? null)
    setActiveProjectId(chat.spaceId ? null : resolveChatProjectId(chat, projects) ?? null)
    setMobileSidebarOpen(false)
  }

  function createProject(): void {
    setProjectDialog({ mode: 'create' })
  }

  function renameProject(projectId: string): void {
    setProjectDialog({ mode: 'edit', projectId })
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
              spaceId: undefined,
              updatedAt: new Date().toISOString()
            }
          : chat
      )
    )
    if (chatId === activeChatId) {
      setActiveProjectId(project?.id ?? null)
      setActiveSpaceId(null)
    }
  }

  function saveProjectDraft(draft: { name: string; icon: ProjectIconId; color: string; projectId?: string }): void {
    if (!draft.name.trim()) return

    if (draft.projectId) {
      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === draft.projectId
            ? {
                ...project,
                name: draft.name.trim(),
                icon: draft.icon,
                color: draft.color
              }
            : project
        )
      )
      setChats((currentChats) =>
        currentChats.map((chat) =>
          resolveChatProjectId(chat, projects) === draft.projectId ? { ...chat, project: draft.name.trim() } : chat
        )
      )
      setProjectDialog(null)
      return
    }

    const project: Project = {
      id: uid('project'),
      name: draft.name.trim(),
      icon: draft.icon,
      color: draft.color
    }
    const chat: Chat = {
      id: uid('chat'),
      title: draft.name.trim(),
      projectId: project.id,
      project: project.name,
      messages: [],
      updatedAt: new Date().toISOString()
    }

    setProjects((currentProjects) => [...currentProjects, project])
    setChats((currentChats) => [chat, ...currentChats])
    setActiveProjectId(project.id)
    setActiveSpaceId(null)
    setActiveChatId(chat.id)
    setProjectDialog(null)
  }

  function createSpace(): void {
    setSpaceDialog({ mode: 'create' })
  }

  function selectSpace(spaceId: string): void {
    setActiveSpaceId(spaceId)
    setActiveProjectId(null)
    const nextVisibleChats = chats.filter((chat) => chat.spaceId === spaceId)
    const activeChatStillVisible = nextVisibleChats.some((chat) => chat.id === activeChatId)

    if (!activeChatStillVisible && nextVisibleChats[0]) {
      setActiveChatId(nextVisibleChats[0].id)
    }

    setMobileSidebarOpen(false)
  }

  function editSpace(spaceId: string): void {
    setSpaceDialog({ mode: 'edit', spaceId })
  }

  function saveSpaceDraft(draft: {
    name: string
    icon: ProjectIconId
    color: string
    members: SpaceMember[]
    spaceId?: string
  }): void {
    if (!draft.name.trim()) return

    if (draft.spaceId) {
      setSpaces((currentSpaces) =>
        currentSpaces.map((space) =>
          space.id === draft.spaceId
            ? {
                ...space,
                name: draft.name.trim(),
                icon: draft.icon,
                color: draft.color,
                members: draft.members
              }
            : space
        )
      )
      setSpaceDialog(null)
      return
    }

    const spaceId = uid('space')
    const space: Space = {
      id: spaceId,
      name: draft.name.trim(),
      icon: draft.icon,
      color: draft.color,
      members: draft.members.length > 0 ? draft.members : [createOwnerMember()],
      createdAt: new Date().toISOString()
    }
    const chat: Chat = {
      id: uid('chat'),
      title: draft.name.trim(),
      spaceId,
      messages: [],
      updatedAt: new Date().toISOString()
    }

    setSpaces((currentSpaces) => [...currentSpaces, space])
    setChats((currentChats) => [chat, ...currentChats])
    setActiveSpaceId(space.id)
    setActiveProjectId(null)
    setActiveChatId(chat.id)
    setSpaceDialog(null)
  }

  function moveChatToSpace(chatId: string, spaceId: string): void {
    const space = spaces.find((candidate) => candidate.id === spaceId)
    if (!space) return

    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              projectId: undefined,
              project: undefined,
              spaceId: space.id,
              updatedAt: new Date().toISOString()
            }
          : chat
      )
    )

    if (chatId === activeChatId) {
      setActiveSpaceId(space.id)
      setActiveProjectId(null)
    }
  }

  function sendMessage(value = composerValue): void {
    const trimmedValue = value.trim()
    if ((!trimmedValue && attachedFiles.length === 0) || isStreaming) {
      return
    }

    const codeIntent = detectCodeIntent(trimmedValue)
    const skillForMessage = selectedSkill
    const requestId = uid('assistant')
    const startedAt = new Date().toISOString()
    requestChatRef.current[requestId] = activeChat.id
    responseContentRef.current[requestId] = ''
    if (nextRevisionBaseRef.current) {
      revisionBaseByRequestRef.current[requestId] = nextRevisionBaseRef.current
      nextRevisionBaseRef.current = null
    }
    stoppedRequestRef.current.delete(requestId)
    const userMessage: Message = {
      id: uid('user'),
      role: 'user',
      content: trimmedValue || `Attached ${attachedFiles.length} file${attachedFiles.length === 1 ? '' : 's'}`,
      skill: skillForMessage ?? undefined
    }
    const assistantMessage: Message = {
      id: requestId,
      role: 'assistant',
      content: '',
      pending: true,
      agentRun: createAgentRun({
        id: uid('run'),
        requestId,
        skillName: skillForMessage?.name,
        hasCodeIntent: codeIntent,
        memoryCount: activeMemoryEntries.length,
        toolCount: selectedToolIds.length,
        fileCount: attachedFiles.length,
        startedAt
      })
    }

    const nextMessages = [...activeChat.messages, userMessage, assistantMessage]
    const nextTitle = activeChat.messages.length === 0 ? createDraftTitle(userMessage.content) : activeChat.title

    if (privacySettings.localOnly && !isModelLocal(selectedModel, providers)) {
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === activeChat.id
            ? {
                ...chat,
                title: nextTitle,
                messages: [
                  ...activeChat.messages,
                  userMessage,
                  {
                    ...assistantMessage,
                    pending: false,
                    content: 'Локальный режим включен. Выберите локального провайдера или отключите Local Privacy Mode.',
                    agentRun: assistantMessage.agentRun ? advanceAgentRun(assistantMessage.agentRun, 'error') : undefined
                  }
                ],
                updatedAt: new Date().toISOString()
              }
            : chat
        )
      )
      setComposerValue('')
      return
    }

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

    if (codeIntent) {
      setCanvasOpen(true)
      setRightPanelMode('code')
      setCodeWorkspace({
        ...initialCodeWorkspace,
        sourceRequestId: requestId
      })
    } else if (selectedToolIds.includes('canvas')) {
      setCanvasOpen(true)
      setRightPanelMode('canvas')
    }

    const payloadMessages: ChatMessagePayload[] = nextMessages
      .filter((message) => message.id !== requestId)
      .map((message) => ({ role: message.role, content: message.content }))
    const memoryContext = createMemoryContext(activeMemoryEntries)
    const systemMessages: ChatMessagePayload[] = [
      memoryContext ? { role: 'system', content: memoryContext } : null,
      skillForMessage ? { role: 'system', content: createSkillContext(skillForMessage) } : null
    ].filter((message): message is ChatMessagePayload => Boolean(message))
    const messagesWithSkillContext: ChatMessagePayload[] = [...systemMessages, ...payloadMessages]
    const usageRecord = createUsageRecord({
      id: uid('usage'),
      requestId,
      chatId: activeChat.id,
      chatTitle: nextTitle,
      providerKind: selectedModel.providerKind,
      providerId: selectedModel.providerId,
      providerLabel: selectedModel.provider,
      modelId: selectedModel.modelId,
      startedAt,
      promptChars: messagesWithSkillContext.reduce((sum, message) => sum + message.content.length, 0),
      localOnly: privacySettings.localOnly
    })
    usageByRequestRef.current[requestId] = usageRecord.id
    setUsageRecords((currentRecords) => [usageRecord, ...currentRecords].slice(0, 200))

    window.graceAI.startChat({
      requestId,
      providerKind: selectedModel.providerKind,
      providerId: selectedModel.providerId,
      modelId: selectedModel.modelId,
      effort,
      tools: selectedToolIds,
      files: attachedFiles.map((file) => ({ name: file.name, size: file.size })),
      messages: messagesWithSkillContext
    })

    setActiveRequests((current) => ({ ...current, [requestId]: activeChat.id }))
    setComposerValue('')
    setSelectedSkillId(null)
    setAttachedFiles([])
  }

  function stopStreaming(): void {
    if (!activeChatRequestId) return
    stoppedRequestRef.current.add(activeChatRequestId)
    window.graceAI.stopChat(activeChatRequestId)
    setUsageRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.id === usageByRequestRef.current[activeChatRequestId] ? finalizeUsageRecord(record, 'stopped') : record
      )
    )
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === activeChat.id
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === activeChatRequestId
                  ? {
                      ...message,
                      pending: false,
                      content: message.content || 'Остановлено пользователем.',
                      agentRun: message.agentRun ? advanceAgentRun(message.agentRun, 'done') : undefined
                    }
                  : message
              )
            }
          : chat
      )
    )
    setActiveRequests((current) => {
      const next = { ...current }
      delete next[activeChatRequestId]
      return next
    })
  }

  function toggleAgentRunExpanded(messageId: string): void {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === activeChat.id
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId && message.agentRun
                  ? { ...message, agentRun: setAgentRunExpanded(message.agentRun, !message.agentRun.expanded) }
                  : message
              )
            }
          : chat
      )
    )
  }

  function toggleTool(toolId: string): void {
    if (toolId === 'attach') {
      fileInputRef.current?.click()
      setToolMenuOpen(false)
      return
    }

    if (toolId === 'canvas') {
      setCanvasOpen(true)
      setRightPanelMode('canvas')
    }

    setSelectedToolIds((current) =>
      current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId]
    )
  }

  function onFileChange(files: FileList | null): void {
    if (!files) return
    const addedAt = new Date().toISOString()
    const nextFiles: AttachedFile[] = Array.from(files).map((file) => ({
      id: uid('file'),
      name: file.name,
      size: file.size,
      status: 'ready'
    }))
    const nextLibraryFiles: LibraryFile[] = nextFiles.map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      addedAt
    }))
    setAttachedFiles((current) => [...current, ...nextFiles])
    setLibraryFiles((current) => [...nextLibraryFiles, ...current])
  }

  function deleteLibraryFile(fileId: string): void {
    setLibraryFiles((currentFiles) => currentFiles.filter((file) => file.id !== fileId))
    setAttachedFiles((currentFiles) => currentFiles.filter((file) => file.id !== fileId))
  }

  function createScheduledTask(title: string, schedule: string): void {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    setScheduledTasks((currentTasks) => [
      {
        id: uid('task'),
        title: trimmedTitle,
        schedule: schedule.trim() || t('manualSchedule'),
        done: false,
        createdAt: new Date().toISOString()
      },
      ...currentTasks
    ])
  }

  function toggleScheduledTask(taskId: string): void {
    setScheduledTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task))
    )
  }

  function deleteScheduledTask(taskId: string): void {
    setScheduledTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId))
  }

  function runScheduledTask(taskId: string): void {
    const task = scheduledTasks.find((candidate) => candidate.id === taskId)
    if (!task) return

    setScheduledTasks((currentTasks) =>
      currentTasks.map((candidate) =>
        candidate.id === taskId
          ? {
              ...candidate,
              status: 'running',
              runHistory: [
                { id: uid('task-run'), status: 'done', at: new Date().toISOString(), chatId: activeChat.id },
                ...(candidate.runHistory ?? [])
              ]
            }
          : candidate
      )
    )
    sendMessage(task.prompt?.trim() || task.title)
  }

  function saveMemoryEntry(entry: Partial<MemoryEntry> & Pick<MemoryEntry, 'title' | 'content' | 'kind'>): void {
    const scope: MemoryEntry['scope'] = activeSpaceId ? 'space' : activeProjectId || activeChat.projectId ? 'project' : 'chat'
    const scopeId = activeSpaceId ?? activeProjectId ?? activeChat.projectId ?? activeChat.id
    const now = new Date().toISOString()
    const nextEntry: MemoryEntry = {
      id: entry.id ?? uid('memory'),
      scope: entry.scope ?? scope,
      scopeId: entry.scopeId ?? scopeId,
      kind: entry.kind,
      title: entry.title.trim() || 'Memory',
      content: entry.content.trim(),
      enabled: entry.enabled ?? true,
      createdAt: entry.createdAt ?? now,
      updatedAt: now
    }

    setMemoryEntries((currentEntries) => {
      const exists = currentEntries.some((candidate) => candidate.id === nextEntry.id)
      return exists
        ? currentEntries.map((candidate) => (candidate.id === nextEntry.id ? nextEntry : candidate))
        : [nextEntry, ...currentEntries]
    })
  }

  function deleteMemoryEntry(entryId: string): void {
    setMemoryEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== entryId))
  }

  function toggleMemoryEntry(entryId: string): void {
    setMemoryEntries((currentEntries) =>
      currentEntries.map((entry) => (entry.id === entryId ? { ...entry, enabled: !entry.enabled, updatedAt: new Date().toISOString() } : entry))
    )
  }

  function savePromptTemplate(template: Pick<PromptTemplate, 'title' | 'content'> & Partial<PromptTemplate>): void {
    const now = new Date().toISOString()
    const nextTemplate: PromptTemplate = {
      id: template.id ?? uid('prompt'),
      title: template.title.trim() || 'Prompt',
      content: template.content.trim(),
      tags: template.tags ?? [],
      createdAt: template.createdAt ?? now,
      updatedAt: now
    }

    setPromptTemplates((currentTemplates) => {
      const exists = currentTemplates.some((candidate) => candidate.id === nextTemplate.id)
      return exists
        ? currentTemplates.map((candidate) => (candidate.id === nextTemplate.id ? nextTemplate : candidate))
        : [nextTemplate, ...currentTemplates]
    })
  }

  function deletePromptTemplate(templateId: string): void {
    setPromptTemplates((currentTemplates) => currentTemplates.filter((template) => template.id !== templateId))
  }

  function insertPromptTemplate(template: PromptTemplate): void {
    setComposerValue(template.content)
    setSkillsOpen(false)
    setCommandPaletteOpen(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
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

  function installMcpPreset(presetId: string): void {
    const preset = mcpMarketplacePresets.find((candidate) => candidate.id === presetId)
    if (!preset) return

    upsertMcpServer({
      name: preset.name,
      transport: preset.transport,
      url: preset.url ?? '',
      command: preset.command ?? '',
      envText: preset.requiredEnv.map((name) => `${name}=`).join('\n'),
      enabled: true,
      sourcePresetId: preset.id,
      description: preset.description,
      requiredEnv: preset.requiredEnv
    })
  }

  function createCheckpoint(title = activeChat.title): void {
    const checkpoint: ChatCheckpoint = {
      id: uid('checkpoint'),
      chatId: activeChat.id,
      title: title.trim() || activeChat.title,
      createdAt: new Date().toISOString(),
      messageCount: activeChat.messages.length,
      snapshot: {
        messages: activeChat.messages,
        canvasValue,
        codeWorkspace
      }
    }

    setCheckpoints((currentCheckpoints) => [checkpoint, ...currentCheckpoints])
  }

  function restoreCheckpoint(checkpointId: string): void {
    const checkpoint = checkpoints.find((candidate) => candidate.id === checkpointId)
    if (!checkpoint) return

    createCheckpoint(`Before restore · ${activeChat.title}`)
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === checkpoint.chatId
          ? {
              ...chat,
              messages: checkpoint.snapshot.messages,
              updatedAt: new Date().toISOString()
            }
          : chat
      )
    )
    setCanvasValue(checkpoint.snapshot.canvasValue)
    setCodeWorkspace(checkpoint.snapshot.codeWorkspace)
    setActiveChatId(checkpoint.chatId)
  }

  function deleteCheckpoint(checkpointId: string): void {
    setCheckpoints((currentCheckpoints) => currentCheckpoints.filter((checkpoint) => checkpoint.id !== checkpointId))
  }

  async function runSetupAgent(input: string): Promise<void> {
    const trimmedInput = input.trim()
    if (!trimmedInput) return

    const userMessage: SetupAgentMessage = {
      id: uid('setup-user'),
      role: 'user',
      content: redactSetupSecrets(trimmedInput)
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
      setThemeMode('dark')
      localNotes.push(plan.themeMode === 'light' ? 'тема: темная (светлая тема отключена в этом релизе)' : 'тема: темная')
    }

    if (plan.locale) {
      setLocale(plan.locale)
      localNotes.push(`язык: ${plan.locale === 'ru' ? 'русский' : 'английский'}`)
    }

    if (typeof plan.privacyLocalOnly === 'boolean') {
      const localOnly = plan.privacyLocalOnly
      setPrivacySettings((currentSettings) => ({
        ...currentSettings,
        localOnly
      }))
      localNotes.push(`приватность: ${localOnly ? 'только локальные модели' : 'удаленные модели разрешены'}`)
    }

    if (plan.modelRouterMode) {
      setModelRouterMode(plan.modelRouterMode)
      localNotes.push(`роутер моделей: ${plan.modelRouterMode}`)
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
    if (
      shouldAskRemoteSetupAgent({
        allowRemoteSetupAgent: privacySettings.allowRemoteSetupAgent,
        localOnly: privacySettings.localOnly,
        planPrivacyLocalOnly: plan.privacyLocalOnly,
        remoteSetupText: plan.remoteSetupText
      })
    ) {
      try {
        const answer = await window.graceAI.askSetupAgent({
          providerId: setupProvider?.id ?? 'zed',
          modelId: 'dugin400',
          messages: [{ role: 'user', content: plan.remoteSetupText }]
        })
        remoteAnswer = answer.configured || localNotes.length === 0 ? answer.content : ''
      } catch (error) {
        remoteAnswer = localNotes.length === 0 ? (error instanceof Error ? error.message : 'Setup agent request failed.') : ''
      }
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
        projects={visibleProjects}
        spaces={visibleSpaces}
        activeProjectId={activeProjectId}
        activeSpaceId={activeSpaceId}
        activeChatId={activeChat.id}
        open={sidebarOpen}
        mobileOpen={mobileSidebarOpen}
        rightPanelMode={rightPanelMode}
        searchQuery={sidebarSearch}
        projectsCollapsed={projectsCollapsed}
        spacesCollapsed={spacesCollapsed}
        runningChatIds={runningChatIds}
        translate={t}
        onToggle={() => setSidebarOpen((open) => !open)}
        onMobileClose={() => setMobileSidebarOpen(false)}
        onToggleProjectsCollapsed={() => setProjectsCollapsed((collapsed) => !collapsed)}
        onToggleSpacesCollapsed={() => setSpacesCollapsed((collapsed) => !collapsed)}
        onSearchChange={setSidebarSearch}
        onNewChat={createNewChat}
        onNewProject={createProject}
        onNewSpace={createSpace}
        onSelectProject={selectProject}
        onSelectSpace={selectSpace}
        onRenameProject={renameProject}
        onEditSpace={editSpace}
        onMoveChatToProject={moveChatToProject}
        onMoveChatToSpace={moveChatToSpace}
        onToggleChatPinned={toggleChatPinned}
        onRenameChat={renameChat}
        onDeleteChat={deleteChat}
        onSelectChat={selectChat}
        skillsCount={visibleSkills.length}
        onOpenSkills={() => setSkillsOpen(true)}
        onOpenSetupAgent={() => setSetupAgentOpen(true)}
        onOpenLibrary={() => {
          setRightPanelMode('library')
          setCanvasOpen(true)
        }}
        onOpenTasks={() => {
          setRightPanelMode('tasks')
          setCanvasOpen(true)
        }}
        onOpenMemory={() => {
          setRightPanelMode('memory')
          setCanvasOpen(true)
        }}
        onOpenUsage={() => {
          setRightPanelMode('usage')
          setCanvasOpen(true)
        }}
        onOpenCheckpoints={() => {
          setRightPanelMode('checkpoints')
          setCanvasOpen(true)
        }}
        onOpenProviderSettings={() => setProviderSettingsOpen(true)}
      />

      <main className={`main-pane ${canvasOpen ? 'with-canvas' : ''}`}>
        <TopBar
          title={activeChat.title}
          project={activeProject}
          space={activeSpace}
          model={selectedModel}
          translate={t}
          sidebarOpen={sidebarOpen}
          canvasOpen={canvasOpen}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
          onToggleCanvas={() => setCanvasOpen((open) => !open)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />

        <ChatThread
          chat={activeChat}
          isStreaming={isStreaming}
          translate={t}
          onPromptClick={sendMessage}
          onCopy={(content) => navigator.clipboard?.writeText(content)}
          onRetry={() => activeChat.messages.at(-2)?.content && sendMessage(activeChat.messages.at(-2)!.content)}
          onToggleAgentRun={toggleAgentRunExpanded}
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
          selectedSkill={selectedSkill}
          effort={effort}
          selectedTools={selectedTools}
          attachedFiles={attachedFiles}
          availableSkills={visibleSkills}
          onValueChange={setComposerValue}
          onSend={() => sendMessage()}
          onStop={stopStreaming}
          onSelectSkill={(skill) => setSelectedSkillId(skill.id)}
          onRemoveSkill={() => setSelectedSkillId(null)}
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
        <RightPanel
          mode={rightPanelMode}
          canvasValue={canvasValue}
          libraryFiles={libraryFiles}
          scheduledTasks={scheduledTasks}
          codeWorkspace={codeWorkspace}
          memoryEntries={activeMemoryEntries}
          checkpoints={checkpoints.filter((checkpoint) => checkpoint.chatId === activeChat.id)}
          usageRecords={usageRecords}
          usageSummary={usageSummary}
          isStreaming={isStreaming}
          translate={t}
          onCanvasChange={setCanvasValue}
          onModeChange={setRightPanelMode}
          onClose={() => setCanvasOpen(false)}
          onAddFiles={() => fileInputRef.current?.click()}
          onDeleteLibraryFile={deleteLibraryFile}
          onCreateScheduledTask={createScheduledTask}
          onToggleScheduledTask={toggleScheduledTask}
          onDeleteScheduledTask={deleteScheduledTask}
          onRunScheduledTask={runScheduledTask}
          onSaveMemoryEntry={saveMemoryEntry}
          onToggleMemoryEntry={toggleMemoryEntry}
          onDeleteMemoryEntry={deleteMemoryEntry}
          onCreateCheckpoint={createCheckpoint}
          onRestoreCheckpoint={restoreCheckpoint}
          onDeleteCheckpoint={deleteCheckpoint}
          onClearUsage={() => setUsageRecords([])}
          onCodeWorkspaceChange={setCodeWorkspace}
          onApplyArtifactDiff={() => {
            if (!codeWorkspace.pendingDiff) return
            const appliedDiff = applyArtifactDiff(codeWorkspace.pendingDiff)
            setCodeWorkspace((currentWorkspace) => ({
              ...currentWorkspace,
              content: appliedDiff.nextContent,
              pendingDiff: undefined,
              version: (currentWorkspace.version ?? 1) + 1
            }))
          }}
          onRejectArtifactDiff={() => {
            if (!codeWorkspace.pendingDiff) return
            const rejectedDiff = rejectArtifactDiff(codeWorkspace.pendingDiff)
            setCodeWorkspace((currentWorkspace) => ({
              ...currentWorkspace,
              pendingDiff: rejectedDiff.status === 'rejected' ? undefined : currentWorkspace.pendingDiff
            }))
          }}
          onAskCodeRevision={(instruction, selectedText) => {
            if (isStreaming) return
            const prompt = createCodeRevisionPrompt(codeWorkspace.content, selectedText, instruction)
            nextRevisionBaseRef.current = codeWorkspace.content
            sendMessage(prompt)
          }}
        />
      ) : null}

      {providerSettingsOpen ? (
        <ProviderSettingsModal
          providers={providers}
          themeMode={themeMode}
          locale={locale}
          responseNotificationsEnabled={responseNotificationsEnabled}
          privacySettings={privacySettings}
          modelRouterMode={modelRouterMode}
          mcpServers={mcpServers}
          usageSummary={usageSummary}
          translate={t}
          onClose={() => setProviderSettingsOpen(false)}
          onThemeChange={setThemeMode}
          onLocaleChange={setLocale}
          onResponseNotificationsChange={setResponseNotificationsEnabled}
          onPrivacyChange={setPrivacySettings}
          onModelRouterModeChange={setModelRouterMode}
          onUpsertMcpServer={upsertMcpServer}
          onInstallMcpPreset={installMcpPreset}
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
      {projectDialog ? (
        <ProjectDialog
          mode={projectDialog.mode}
          project={projectDialog.projectId ? projects.find((project) => project.id === projectDialog.projectId) : undefined}
          projectIndex={projects.length}
          translate={t}
          onClose={() => setProjectDialog(null)}
          onSave={saveProjectDraft}
        />
      ) : null}
      {spaceDialog ? (
        <SpaceDialog
          mode={spaceDialog.mode}
          space={spaceDialog.spaceId ? spaces.find((space) => space.id === spaceDialog.spaceId) : undefined}
          spaceIndex={spaces.length}
          translate={t}
          onClose={() => setSpaceDialog(null)}
          onSave={saveSpaceDraft}
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
          prompts={promptTemplates}
          translate={t}
          onClose={() => setSkillsOpen(false)}
          onSavePrompt={savePromptTemplate}
          onDeletePrompt={deletePromptTemplate}
          onInsertPrompt={insertPromptTemplate}
          onInstallSkill={(skill) => {
            setInstalledSkills((currentSkills) =>
              currentSkills.some((currentSkill) => currentSkill.sourceUrl === skill.sourceUrl)
                ? currentSkills
                : [...currentSkills, skill]
            )
          }}
        />
      ) : null}
      {commandPaletteOpen ? (
        <CommandPalette
          translate={t}
          prompts={promptTemplates}
          modelRouterMode={modelRouterMode}
          onClose={() => setCommandPaletteOpen(false)}
          onNewChat={createNewChat}
          onOpenSettings={() => setProviderSettingsOpen(true)}
          onOpenSkills={() => setSkillsOpen(true)}
          onOpenSetupAgent={() => setSetupAgentOpen(true)}
          onOpenPanel={(mode: RightPanelMode) => {
            setRightPanelMode(mode)
            setCanvasOpen(true)
          }}
          onModelRouterModeChange={setModelRouterMode}
          onInsertPrompt={insertPromptTemplate}
        />
      ) : null}
    </div>
  )
}

function CommandPalette(props: {
  translate: Translate
  prompts: PromptTemplate[]
  modelRouterMode: ModelRouterMode
  onClose: () => void
  onNewChat: () => void
  onOpenSettings: () => void
  onOpenSkills: () => void
  onOpenSetupAgent: () => void
  onOpenPanel: (mode: RightPanelMode) => void
  onModelRouterModeChange: (mode: ModelRouterMode) => void
  onInsertPrompt: (template: PromptTemplate) => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const routerModes: Array<{ id: ModelRouterMode; label: string }> = [
    { id: 'manual', label: props.translate('routerManual') },
    { id: 'fast', label: props.translate('routerFast') },
    { id: 'smart', label: props.translate('routerSmart') },
    { id: 'code', label: props.translate('routerCode') },
    { id: 'local', label: props.translate('routerLocal') }
  ]
  const commands: Array<{ id: string; label: string; detail: string; icon: JSX.Element; action: () => void }> = [
    { id: 'new-chat', label: props.translate('newChat'), detail: 'Start a clean thread', icon: <Plus size={16} />, action: props.onNewChat },
    { id: 'settings', label: props.translate('settings'), detail: 'Providers, MCP, privacy', icon: <Settings size={16} />, action: props.onOpenSettings },
    { id: 'setup-agent', label: props.translate('setupAgent'), detail: 'Ask agent to configure Grace', icon: <Bot size={16} />, action: props.onOpenSetupAgent },
    { id: 'skills', label: props.translate('skills'), detail: 'Skills and prompt library', icon: <BookOpen size={16} />, action: props.onOpenSkills },
    { id: 'memory', label: props.translate('memory'), detail: props.translate('memoryHelp'), icon: <BookOpen size={16} />, action: () => props.onOpenPanel('memory') },
    { id: 'code', label: props.translate('codeWorkspace'), detail: props.translate('codeWorkspaceHelp'), icon: <Code2 size={16} />, action: () => props.onOpenPanel('code') },
    { id: 'checkpoints', label: props.translate('checkpoints'), detail: props.translate('checkpointsHelp'), icon: <History size={16} />, action: () => props.onOpenPanel('checkpoints') },
    { id: 'usage', label: props.translate('usage'), detail: props.translate('usageHelp'), icon: <BarChart3 size={16} />, action: () => props.onOpenPanel('usage') }
  ]
  const visibleCommands = commands.filter((command) =>
    normalizedQuery ? `${command.label} ${command.detail}`.toLowerCase().includes(normalizedQuery) : true
  )
  const visiblePrompts = filterPromptTemplates(props.prompts, query).slice(0, 5)

  function run(action: () => void): void {
    action()
    props.onClose()
  }

  return (
    <div className="modal-backdrop command-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="command-header">
          <Search size={17} />
          <input
            autoFocus
            value={query}
            placeholder={props.translate('commandPalettePlaceholder')}
            aria-label={props.translate('commandPalette')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') props.onClose()
              if (event.key === 'Enter' && visibleCommands[0]) run(visibleCommands[0].action)
            }}
          />
        </header>

        <div className="command-section-title" id="command-palette-title">{props.translate('commandPalette')}</div>
        <div className="command-list">
          {visibleCommands.map((command) => (
            <button key={command.id} className="command-row" type="button" onClick={() => run(command.action)}>
              {command.icon}
              <span>
                <strong>{command.label}</strong>
                <small>{command.detail}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="command-section-title">{props.translate('modelRouter')}</div>
        <div className="router-mode-row">
          {routerModes.map((mode) => (
            <button
              key={mode.id}
              className={props.modelRouterMode === mode.id ? 'active' : ''}
              type="button"
              onClick={() => run(() => props.onModelRouterModeChange(mode.id))}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {visiblePrompts.length > 0 ? (
          <>
            <div className="command-section-title">{props.translate('promptLibrary')}</div>
            <div className="command-list">
              {visiblePrompts.map((prompt) => (
                <button key={prompt.id} className="command-row" type="button" onClick={() => run(() => props.onInsertPrompt(prompt))}>
                  <FileText size={16} />
                  <span>
                    <strong>{prompt.title}</strong>
                    <small>{prompt.tags.join(', ') || prompt.content.slice(0, 54)}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}

function ProjectSidebar(props: {
  chats: Chat[]
  allChats: Chat[]
  projects: Project[]
  spaces: Space[]
  activeProjectId: string | null
  activeSpaceId: string | null
  activeChatId: string
  open: boolean
  mobileOpen: boolean
  rightPanelMode: RightPanelMode
  searchQuery: string
  projectsCollapsed: boolean
  spacesCollapsed: boolean
  runningChatIds: Set<string>
  translate: Translate
  onToggle: () => void
  onMobileClose: () => void
  onToggleProjectsCollapsed: () => void
  onToggleSpacesCollapsed: () => void
  onSearchChange: (query: string) => void
  onNewChat: () => void
  onNewProject: () => void
  onNewSpace: () => void
  onSelectProject: (projectId: string | null) => void
  onSelectSpace: (spaceId: string) => void
  onRenameProject: (projectId: string) => void
  onEditSpace: (spaceId: string) => void
  onMoveChatToProject: (chatId: string, projectId: string | null) => void
  onMoveChatToSpace: (chatId: string, spaceId: string) => void
  onSelectChat: (chatId: string) => void
  onToggleChatPinned: (chatId: string) => void
  onRenameChat: (chatId: string) => void
  onDeleteChat: (chatId: string) => void
  skillsCount: number
  onOpenSkills: () => void
  onOpenSetupAgent: () => void
  onOpenLibrary: () => void
  onOpenTasks: () => void
  onOpenMemory: () => void
  onOpenUsage: () => void
  onOpenCheckpoints: () => void
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
              <input
                type="search"
                value={props.searchQuery}
                placeholder={t('searchChats')}
                aria-label={t('searchChats')}
                onChange={(event) => props.onSearchChange(event.target.value)}
              />
            </label>

            <button
              className={`sidebar-row primary-nav-row ${props.activeProjectId === null && props.activeSpaceId === null ? 'active' : ''}`}
              type="button"
              onClick={() => props.onSelectProject(null)}
            >
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
                  isRunning={props.runningChatIds.has(chat.id)}
                  onSelect={props.onSelectChat}
                  onMoveToProject={props.onMoveChatToProject}
                  onTogglePinned={props.onToggleChatPinned}
                  onRename={props.onRenameChat}
                  onDelete={props.onDeleteChat}
                />
              ))}
            </SidebarSection>

            <SidebarSection
              title={t('projects')}
              icon={<Folder size={14} />}
              collapsed={props.projectsCollapsed}
              onToggle={props.onToggleProjectsCollapsed}
            >
              {props.projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  active={project.id === props.activeProjectId}
                  chatCount={props.allChats.filter((chat) => resolveChatProjectId(chat, props.projects) === project.id).length}
                  translate={t}
                  onSelect={props.onSelectProject}
                  onRename={props.onRenameProject}
                  onEdit={props.onRenameProject}
                />
              ))}
              <button className="sidebar-row muted-row" type="button" onClick={props.onNewProject}>
                <Plus size={15} />
                <span>{t('newProject')}</span>
              </button>
            </SidebarSection>

            <SidebarSection
              title={t('spaces')}
              icon={<Users size={14} />}
              collapsed={props.spacesCollapsed}
              onToggle={props.onToggleSpacesCollapsed}
            >
              {props.spaces.map((space) => (
                <SpaceRow
                  key={space.id}
                  space={space}
                  active={space.id === props.activeSpaceId}
                  chatCount={props.allChats.filter((chat) => chat.spaceId === space.id).length}
                  translate={t}
                  onSelect={props.onSelectSpace}
                  onEdit={props.onEditSpace}
                />
              ))}
              <button className="sidebar-row muted-row" type="button" onClick={props.onNewSpace}>
                <Plus size={15} />
                <span>{t('newSpace')}</span>
              </button>
            </SidebarSection>

            <SidebarSection
              title={props.activeSpaceId ? t('spaceChats') : props.activeProjectId ? t('projectChats') : t('recents')}
              icon={<History size={14} />}
            >
              {recentChats.map((chat) => (
                <SidebarRow
                  key={chat.id}
                  chat={chat}
                  active={chat.id === props.activeChatId}
                  projects={props.projects}
                  spaces={props.spaces}
                  translate={t}
                  isRunning={props.runningChatIds.has(chat.id)}
                  onSelect={props.onSelectChat}
                  onMoveToProject={props.onMoveChatToProject}
                  onMoveToSpace={props.onMoveChatToSpace}
                  onTogglePinned={props.onToggleChatPinned}
                  onRename={props.onRenameChat}
                  onDelete={props.onDeleteChat}
                />
              ))}
              {props.searchQuery.trim() && recentChats.length === 0 ? (
                <div className="sidebar-empty-state">{t('searchEmpty')}</div>
              ) : null}
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
            <button className="icon-button" type="button" aria-label={t('files')} title={t('files')} onClick={props.onOpenLibrary}>
              <FileText size={18} />
            </button>
            <button className="icon-button" type="button" aria-label={t('scheduledTasks')} title={t('scheduledTasks')} onClick={props.onOpenTasks}>
              <Clock3 size={18} />
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
            <button
              className={`sidebar-row ${props.rightPanelMode === 'library' ? 'active' : ''}`}
              type="button"
              onClick={props.onOpenLibrary}
            >
              <Archive size={15} />
              <span>{t('libraryFiles')}</span>
            </button>
            <button
              className={`sidebar-row ${props.rightPanelMode === 'tasks' ? 'active' : ''}`}
              type="button"
              onClick={props.onOpenTasks}
            >
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

function SidebarSection(props: {
  title: string
  icon: JSX.Element
  children: React.ReactNode
  collapsed?: boolean
  onToggle?: () => void
}): JSX.Element {
  const titleContent = (
    <>
      {props.icon}
      {props.title}
      {props.onToggle ? <ChevronRight className={`section-chevron ${props.collapsed ? '' : 'expanded'}`} size={13} /> : null}
    </>
  )

  return (
    <section className="sidebar-section">
      {props.onToggle ? (
        <button className="section-title section-title-button" type="button" onClick={props.onToggle}>
          {titleContent}
        </button>
      ) : (
        <div className="section-title">{titleContent}</div>
      )}
      {props.collapsed ? null : <div className="section-list">{props.children}</div>}
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
  onEdit: (projectId: string) => void
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
              props.onEdit(props.project.id)
              setActionsOpen(false)
            }}
          >
            <Folder size={14} />
            {props.translate('projectIcon')}
          </button>
          <button
            type="button"
            onClick={() => {
              props.onEdit(props.project.id)
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

function SpaceRow(props: {
  space: Space
  active: boolean
  chatCount: number
  translate: Translate
  onSelect: (spaceId: string) => void
  onEdit: (spaceId: string) => void
}): JSX.Element {
  const [actionsOpen, setActionsOpen] = useState(false)
  const shellRef = useCloseOnOutsideClick<HTMLDivElement>(actionsOpen, () => setActionsOpen(false))
  const Icon = getProjectIcon(props.space.icon)
  const invitedCount = props.space.members.filter((member) => member.status === 'invited').length

  return (
    <div ref={shellRef} className={`sidebar-row-shell project-row-shell ${props.active ? 'active' : ''}`}>
      <button className="sidebar-row-main project-row-main" type="button" onClick={() => props.onSelect(props.space.id)}>
        <span className="project-icon-dot" style={{ color: props.space.color, backgroundColor: `${props.space.color}22` }}>
          <Icon size={15} />
        </span>
        <span>
          {props.space.name}
          <small>
            {props.space.members.length} {getMemberLabel(props.space.members.length, props.translate)}
            {invitedCount > 0 ? ` · ${invitedCount} ${props.translate('invited')}` : ''}
          </small>
        </span>
        <small>{props.chatCount}</small>
      </button>
      <button
        className="row-action-button"
        type="button"
        aria-label={props.translate('editSpace')}
        title={props.translate('editSpace')}
        onClick={() => setActionsOpen((open) => !open)}
      >
        <MoreHorizontal size={15} />
      </button>
      {actionsOpen ? (
        <div className="row-action-menu project-action-menu">
          <button
            type="button"
            onClick={() => {
              props.onEdit(props.space.id)
              setActionsOpen(false)
            }}
          >
            <Users size={14} />
            {props.translate('editSpace')}
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
  spaces?: Space[]
  translate?: Translate
  isRunning?: boolean
  onSelect: (chatId: string) => void
  onMoveToProject?: (chatId: string, projectId: string | null) => void
  onMoveToSpace?: (chatId: string, spaceId: string) => void
  onTogglePinned: (chatId: string) => void
  onRename: (chatId: string) => void
  onDelete: (chatId: string) => void
}): JSX.Element {
  const [actionsOpen, setActionsOpen] = useState(false)
  const shellRef = useCloseOnOutsideClick<HTMLDivElement>(actionsOpen, () => setActionsOpen(false))
  const fallbackTranslate: Translate = (key) => translate('en', key)
  const t = props.translate ?? fallbackTranslate
  const projects = props.projects ?? []
  const spaces = props.spaces ?? []

  return (
    <div ref={shellRef} className={`sidebar-row-shell ${props.active ? 'active' : ''}`}>
      <button className="sidebar-row-main" type="button" onClick={() => props.onSelect(props.chat.id)}>
        <span className={`row-dot ${props.isRunning ? 'running' : ''}`} />
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
          {spaces.length > 0 ? (
            <>
              <div className="row-action-label">{t('moveToSpace')}</div>
              {spaces.map((space) => {
                const Icon = getProjectIcon(space.icon)
                return (
                  <button
                    key={space.id}
                    type="button"
                    onClick={() => {
                      props.onMoveToSpace?.(props.chat.id, space.id)
                      setActionsOpen(false)
                    }}
                  >
                    <Icon size={14} />
                    {space.name}
                  </button>
                )
              })}
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
  space: Space | null
  model: ModelOption
  translate: Translate
  sidebarOpen: boolean
  canvasOpen: boolean
  onOpenMobileSidebar: () => void
  onToggleSidebar: () => void
  onToggleCanvas: () => void
  onOpenCommandPalette: () => void
}): JSX.Element {
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
          <span>
            {props.space
              ? `${props.space.name} · ${props.space.members.length} ${getMemberLabel(props.space.members.length, props.translate)} · ${props.model.label}`
              : props.project
              ? `${props.project.name} · ${props.model.label}`
              : props.model.label}
          </span>
        </div>
      </div>
      <div className="topbar-actions">
        <div className="route-chip" title={`${props.model.provider} · ${props.model.label}`}>
          <span>{props.translate('routeChip')}</span>
          <strong>{props.model.providerKind === 'demo' ? props.translate('routeChipDemo') : props.translate('routeChipRemote')}</strong>
        </div>
        <button className="text-button desktop-only" type="button" onClick={props.onOpenCommandPalette}>
          <Search size={15} />
          Cmd K
        </button>
        <button
          className={`icon-button ${props.canvasOpen ? 'active' : ''}`}
          type="button"
          aria-label={props.translate('workspacePanel')}
          title={props.translate('workspacePanel')}
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
  onToggleAgentRun: (messageId: string) => void
}): JSX.Element {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [props.chat.messages])

  if (props.chat.messages.length === 0) {
    return (
      <section className="chat-thread empty-state" aria-label={props.translate('newChat')}>
        <div className="empty-content">
          <div className="empty-kicker">{props.translate('newChat')}</div>
          <h2>{props.translate('emptyChatTitle')}</h2>
          <p>{props.translate('emptyChatHint')}</p>
          <div className="suggestion-grid" aria-label={props.translate('emptyChatSuggestions')}>
            {promptSuggestions.map((suggestionKey) => (
              <button
                key={suggestionKey}
                className="suggestion-command"
                type="button"
                onClick={() => props.onPromptClick(props.translate(suggestionKey))}
              >
                <span aria-hidden="true">/</span>
                {props.translate(suggestionKey)}
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
            onToggleAgentRun={props.onToggleAgentRun}
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
  onToggleAgentRun: (messageId: string) => void
}): JSX.Element {
  const { message, onCopy, onRetry } = props

  return (
    <article className={`message ${message.role}`}>
      <div className="message-body">
        {message.skill ? (
          <span className="message-skill-chip">
            <Bot size={14} />
            {message.skill.name}
          </span>
        ) : null}
        {message.role === 'assistant' ? (
          <>
            {message.agentRun ? (
              <AgentRunView
                run={message.agentRun}
                translate={props.translate}
                onToggle={() => props.onToggleAgentRun(message.id)}
              />
            ) : null}
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
          </>
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

function AgentRunView(props: { run: AgentRun; translate: Translate; onToggle: () => void }): JSX.Element {
  const progress = getAgentRunProgress(props.run)

  return (
    <div className={`agent-run ${props.run.status}`}>
      <button className="agent-run-summary" type="button" onClick={props.onToggle}>
        <ChevronRight className={props.run.expanded ? 'expanded' : ''} size={14} />
        <span>{props.translate('agentSteps')}</span>
        <small>
          {progress.done}/{progress.total} · {props.run.status}
        </small>
      </button>
      {props.run.expanded ? (
        <div className="agent-run-steps">
          {props.run.steps.map((step) => (
            <div className={`agent-step ${step.status}`} key={step.id}>
              <span className="agent-step-dot" />
              <span>
                <strong>{step.title}</strong>
                {step.detail ? <small>{step.detail}</small> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
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
  selectedSkill: SkillSummary | null
  effort: 'low' | 'medium' | 'high'
  selectedTools: ToolOption[]
  attachedFiles: AttachedFile[]
  availableSkills: SkillSummary[]
  onValueChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onSelectSkill: (skill: SkillSummary) => void
  onRemoveSkill: () => void
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
  const [activeSkillIndex, setActiveSkillIndex] = useState(0)
  const skillQuery = props.selectedSkill ? null : getLeadingSkillMentionQuery(props.value)
  const filteredSkills = useMemo(
    () => (skillQuery === null ? [] : filterSkillsByQuery(props.availableSkills, skillQuery)),
    [props.availableSkills, skillQuery]
  )
  const skillMenuOpen = skillQuery !== null

  useEffect(() => {
    setActiveSkillIndex(0)
  }, [skillQuery])

  function selectSkill(skill: SkillSummary): void {
    props.onSelectSkill(skill)
    props.onValueChange('')
    setActiveSkillIndex(0)
    requestAnimationFrame(() => props.textareaRef.current?.focus())
  }

  return (
    <section className="composer-zone" aria-label={props.translate('messageGrace')}>
      <div className="composer-shell">
        <div className="composer-chips">
          {props.selectedSkill ? (
            <Chip
              label={props.selectedSkill.name}
              icon={<Bot size={14} />}
              onRemove={props.onRemoveSkill}
            />
          ) : null}
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
            if (skillMenuOpen && event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveSkillIndex((currentIndex) => Math.min(currentIndex + 1, Math.max(filteredSkills.length - 1, 0)))
              return
            }

            if (skillMenuOpen && event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveSkillIndex((currentIndex) => Math.max(currentIndex - 1, 0))
              return
            }

            if (skillMenuOpen && event.key === 'Escape') {
              event.preventDefault()
              props.onValueChange(props.value.replace(/^@\S*/, '').trimStart())
              return
            }

            if (skillMenuOpen && event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              const skill = filteredSkills[activeSkillIndex] ?? filteredSkills[0]
              if (skill) {
                selectSkill(skill)
              }
              return
            }

            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              props.onSend()
            }
          }}
        />

        {skillMenuOpen ? (
          <SkillMentionMenu
            skills={filteredSkills}
            activeIndex={activeSkillIndex}
            translate={props.translate}
            onSelect={selectSkill}
          />
        ) : null}

        <div className="composer-footer">
          <div className="composer-left">
            <button
              className="icon-button"
              type="button"
              aria-label={props.translate('connectApp')}
              title={props.translate('connectApp')}
              aria-haspopup="menu"
              aria-expanded={props.toolMenuOpen}
              onClick={props.onToggleToolMenu}
            >
              <Plus size={18} />
            </button>
            <button
              className="model-chip"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={props.modelMenuOpen}
              onClick={props.onToggleModelMenu}
            >
              {props.selectedModel.label}
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="composer-right">
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

function SkillMentionMenu(props: {
  skills: SkillSummary[]
  activeIndex: number
  translate: Translate
  onSelect: (skill: SkillSummary) => void
}): JSX.Element {
  return (
    <div className="skill-mention-menu" role="listbox" aria-label={props.translate('selectSkill')}>
      <div className="skill-mention-header">
        <strong>{props.translate('selectSkill')}</strong>
        <span>{props.translate('skillMentionHelp')}</span>
      </div>
      {props.skills.length > 0 ? (
        props.skills.map((skill, index) => (
          <button
            key={skill.id}
            className={`skill-mention-row ${index === props.activeIndex ? 'active' : ''}`}
            type="button"
            role="option"
            aria-selected={index === props.activeIndex}
            onMouseDown={(event) => {
              event.preventDefault()
              props.onSelect(skill)
            }}
          >
            <Bot size={17} />
            <span>
              <strong>{skill.name}</strong>
              <small>{skill.description}</small>
              {skill.appliesTo[0] ? <em>{skill.appliesTo.slice(0, 2).join(' · ')}</em> : null}
            </span>
          </button>
        ))
      ) : (
        <p className="skill-mention-empty">{props.translate('noSkillsFound')}</p>
      )}
    </div>
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

function ProjectDialog(props: {
  mode: 'create' | 'edit'
  project?: Project
  projectIndex: number
  translate: Translate
  onClose: () => void
  onSave: (draft: { name: string; icon: ProjectIconId; color: string; projectId?: string }) => void
}): JSX.Element {
  const [name, setName] = useState(props.project?.name ?? '')
  const [icon, setIcon] = useState<ProjectIconId>(props.project?.icon ?? 'folder')
  const [color, setColor] = useState(props.project?.color ?? projectColors[props.projectIndex % projectColors.length])
  const title = props.mode === 'create' ? props.translate('createProject') : props.translate('editProject')
  const dialogRef = useFocusTrap<HTMLElement>()

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    props.onSave({ name, icon, color, projectId: props.project?.id })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="settings-modal picker-modal" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" tabIndex={-1}>
        <header className="settings-header">
          <div>
            <h2 id="project-dialog-title">{title}</h2>
            <p>{props.translate('projectDetails')}</p>
          </div>
          <button className="icon-button" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>

        <form className="settings-form" onSubmit={onSubmit}>
          <label>
            <span>{props.translate('projectName')}</span>
            <input value={name} autoFocus onChange={(event) => setName(event.target.value)} />
          </label>

          <PickerSection title={props.translate('chooseIcon')} icon={<Folder size={15} />}>
            <IconPicker value={icon} color={color} onChange={setIcon} />
          </PickerSection>

          <PickerSection title={props.translate('chooseColor')} icon={<Palette size={15} />}>
            <ColorPicker value={color} onChange={setColor} />
          </PickerSection>

          <div className="settings-actions">
            <button className="secondary-button" type="button" onClick={props.onClose}>
              {props.translate('cancel')}
            </button>
            <button className="primary-button" type="submit" disabled={!name.trim()}>
              {props.mode === 'create' ? props.translate('create') : props.translate('saveChanges')}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function SpaceDialog(props: {
  mode: 'create' | 'edit'
  space?: Space
  spaceIndex: number
  translate: Translate
  onClose: () => void
  onSave: (draft: {
    name: string
    icon: ProjectIconId
    color: string
    members: SpaceMember[]
    spaceId?: string
  }) => void
}): JSX.Element {
  const [name, setName] = useState(props.space?.name ?? '')
  const [icon, setIcon] = useState<ProjectIconId>(props.space?.icon ?? 'bot')
  const [color, setColor] = useState(props.space?.color ?? projectColors[(props.spaceIndex + 2) % projectColors.length])
  const [members, setMembers] = useState<SpaceMember[]>(props.space?.members ?? [createOwnerMember()])
  const [inviteEmail, setInviteEmail] = useState('')
  const title = props.mode === 'create' ? props.translate('createSpace') : props.translate('editSpace')
  const dialogRef = useFocusTrap<HTMLElement>()

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    props.onSave({ name, icon, color, members, spaceId: props.space?.id })
  }

  function addInvite(): void {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || members.some((member) => member.email.toLowerCase() === email)) return

    setMembers((currentMembers) => [...currentMembers, createInvitedMember(email)])
    setInviteEmail('')
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="settings-modal picker-modal" role="dialog" aria-modal="true" aria-labelledby="space-dialog-title" tabIndex={-1}>
        <header className="settings-header">
          <div>
            <h2 id="space-dialog-title">{title}</h2>
            <p>{props.translate('spaceDetails')}</p>
          </div>
          <button className="icon-button" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>

        <form className="settings-form" onSubmit={onSubmit}>
          <label>
            <span>{props.translate('spaceName')}</span>
            <input value={name} autoFocus onChange={(event) => setName(event.target.value)} />
          </label>

          <PickerSection title={props.translate('chooseIcon')} icon={<Users size={15} />}>
            <IconPicker value={icon} color={color} onChange={setIcon} />
          </PickerSection>

          <PickerSection title={props.translate('chooseColor')} icon={<Palette size={15} />}>
            <ColorPicker value={color} onChange={setColor} />
          </PickerSection>

          <PickerSection title={props.translate('spaceMembers')} icon={<UserPlus size={15} />}>
            <div className="invite-row">
              <Mail size={15} />
              <input
                value={inviteEmail}
                type="email"
                placeholder={props.translate('inviteEmailPlaceholder')}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <button className="secondary-button" type="button" onClick={addInvite}>
                {props.translate('addInvite')}
              </button>
            </div>
            <p className="muted-copy">{props.translate('spaceInviteHelp')}</p>
            <div className="member-list">
              {members.map((member) => (
                <div className="member-card" key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.email}</span>
                  </div>
                  <span className={`status-pill ${member.status}`}>{props.translate(member.status)}</span>
                </div>
              ))}
            </div>
          </PickerSection>

          <div className="settings-actions">
            <button className="secondary-button" type="button" onClick={props.onClose}>
              {props.translate('cancel')}
            </button>
            <button className="primary-button" type="submit" disabled={!name.trim()}>
              {props.mode === 'create' ? props.translate('create') : props.translate('saveChanges')}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function PickerSection(props: { title: string; icon: JSX.Element; children: React.ReactNode }): JSX.Element {
  return (
    <section className="picker-section">
      <div className="picker-section-title">
        {props.icon}
        <strong>{props.title}</strong>
      </div>
      {props.children}
    </section>
  )
}

function IconPicker(props: { value: ProjectIconId; color: string; onChange: (icon: ProjectIconId) => void }): JSX.Element {
  return (
    <div className="icon-picker-grid">
      {projectIconOptions.map((option) => {
        const Icon = option.icon
        return (
          <button
            key={option.id}
            className={`icon-picker-option ${props.value === option.id ? 'active' : ''}`}
            type="button"
            title={option.label}
            aria-label={option.label}
            onClick={() => props.onChange(option.id)}
          >
            <span style={{ color: props.color, backgroundColor: `${props.color}22` }}>
              <Icon size={18} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ColorPicker(props: { value: string; onChange: (color: string) => void }): JSX.Element {
  return (
    <div className="color-picker-grid">
      {projectColors.map((color) => (
        <button
          key={color}
          className={`color-picker-option ${props.value === color ? 'active' : ''}`}
          type="button"
          aria-label={color}
          onClick={() => props.onChange(color)}
        >
          <span style={{ backgroundColor: color }} />
        </button>
      ))}
    </div>
  )
}

type SettingsTabId = 'providers' | 'models' | 'mcp' | 'privacy' | 'notifications' | 'appearance' | 'usage'

function ProviderSettingsModal(props: {
  providers: CustomProviderSummary[]
  themeMode: ThemeMode
  locale: Locale
  responseNotificationsEnabled: boolean
  privacySettings: PrivacySettings
  modelRouterMode: ModelRouterMode
  mcpServers: McpServer[]
  usageSummary: ReturnType<typeof summarizeUsage>
  translate: Translate
  onClose: () => void
  onThemeChange: (themeMode: ThemeMode) => void
  onLocaleChange: (locale: Locale) => void
  onResponseNotificationsChange: (enabled: boolean) => void
  onPrivacyChange: (settings: PrivacySettings) => void
  onModelRouterModeChange: (mode: ModelRouterMode) => void
  onUpsertMcpServer: (server: Omit<McpServer, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => void
  onInstallMcpPreset: (presetId: string) => void
  onUpdateMcpServer: (serverId: string, patch: Partial<McpServer>) => void
  onDeleteMcpServer: (serverId: string) => void
  onSaved: (provider: CustomProviderSummary) => void
}): JSX.Element {
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>('providers')
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
  const dialogRef = useFocusTrap<HTMLElement>()

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

  const settingsTabs: Array<{ id: SettingsTabId; label: string }> = [
    { id: 'providers', label: props.translate('settingsTabProviders') },
    { id: 'models', label: props.translate('settingsTabModels') },
    { id: 'mcp', label: props.translate('settingsTabMcp') },
    { id: 'privacy', label: props.translate('settingsTabPrivacy') },
    { id: 'notifications', label: props.translate('settingsTabNotifications') },
    { id: 'appearance', label: props.translate('settingsTabAppearance') },
    { id: 'usage', label: props.translate('settingsTabUsage') }
  ]

  function focusSettingsTab(tabId: SettingsTabId): void {
    setActiveSettingsTab(tabId)
    requestAnimationFrame(() => document.getElementById(`settings-tab-${tabId}`)?.focus())
  }

  function handleSettingsTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, tabId: SettingsTabId): void {
    const currentIndex = settingsTabs.findIndex((tab) => tab.id === tabId)
    if (currentIndex === -1) return

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusSettingsTab(settingsTabs[(currentIndex + 1) % settingsTabs.length].id)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusSettingsTab(settingsTabs[(currentIndex - 1 + settingsTabs.length) % settingsTabs.length].id)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusSettingsTab(settingsTabs[0].id)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusSettingsTab(settingsTabs[settingsTabs.length - 1].id)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1}>
        <header className="settings-header">
          <div>
            <h2 id="settings-title">{props.translate('settings')}</h2>
            <p>{props.translate('providerSettingsHelp')}</p>
          </div>
          <button className="icon-button" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="settings-tabs" role="tablist" aria-label={props.translate('settings')}>
          {settingsTabs.map((tab) => (
            <button
              id={`settings-tab-${tab.id}`}
              key={tab.id}
              className={activeSettingsTab === tab.id ? 'active' : ''}
              type="button"
              role="tab"
              aria-controls={`settings-panel-${tab.id}`}
              aria-selected={activeSettingsTab === tab.id}
              tabIndex={activeSettingsTab === tab.id ? 0 : -1}
              onClick={() => setActiveSettingsTab(tab.id)}
              onKeyDown={(event) => handleSettingsTabKeyDown(event, tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="settings-section" id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" hidden={activeSettingsTab !== 'appearance'}>
          <div>
            <strong id="appearance-settings-title">{props.translate('appearance')}</strong>
            <p>{props.translate('appearanceHelp')}</p>
          </div>
          <div className="settings-inline-controls">
            <div className="settings-static-chip">
              <Moon size={15} />
              {props.translate('dark')}
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

        <section className="settings-section" id="settings-panel-notifications" role="tabpanel" aria-labelledby="settings-tab-notifications" hidden={activeSettingsTab !== 'notifications'}>
          <div>
            <strong id="notification-settings-title">{props.translate('notifications')}</strong>
            <p>{props.translate('notificationsHelp')}</p>
          </div>
          <button
            className={`mini-toggle ${props.responseNotificationsEnabled ? 'active' : ''}`}
            type="button"
            aria-pressed={props.responseNotificationsEnabled}
            onClick={() => props.onResponseNotificationsChange(!props.responseNotificationsEnabled)}
          >
            {props.responseNotificationsEnabled ? props.translate('enabled') : props.translate('disabled')}
          </button>
        </section>

        <section className="settings-section" id="settings-panel-models" role="tabpanel" aria-labelledby="settings-tab-models" hidden={activeSettingsTab !== 'models'}>
          <div>
            <strong id="router-settings-title">{props.translate('modelRouter')}</strong>
            <p>{props.translate('routerHelp')}</p>
          </div>
          <div className="theme-segmented language-segmented" role="group" aria-label={props.translate('modelRouter')}>
            {([
              ['manual', props.translate('routerManual')],
              ['fast', props.translate('routerFast')],
              ['smart', props.translate('routerSmart')],
              ['code', props.translate('routerCode')],
              ['local', props.translate('routerLocal')]
            ] as Array<[ModelRouterMode, string]>).map(([mode, label]) => (
              <button key={mode} className={props.modelRouterMode === mode ? 'active' : ''} type="button" onClick={() => props.onModelRouterModeChange(mode)}>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section" id="settings-panel-privacy" role="tabpanel" aria-labelledby="settings-tab-privacy" hidden={activeSettingsTab !== 'privacy'}>
          <div>
            <strong id="privacy-settings-title">{props.translate('privacyMode')}</strong>
            <p>{props.translate('privacyHelp')}</p>
          </div>
          <button
            className={`mini-toggle ${props.privacySettings.localOnly ? 'active' : ''}`}
            type="button"
            aria-pressed={props.privacySettings.localOnly}
            onClick={() => props.onPrivacyChange({ ...props.privacySettings, localOnly: !props.privacySettings.localOnly })}
          >
            <Shield size={14} />
            {props.privacySettings.localOnly ? props.translate('enabled') : props.translate('disabled')}
          </button>
          <div>
            <strong>{props.translate('setupRemoteConsent')}</strong>
            <p>{props.translate('setupRemoteConsentHelp')}</p>
          </div>
          <button
            className={`mini-toggle ${props.privacySettings.allowRemoteSetupAgent ? 'active' : ''}`}
            type="button"
            aria-pressed={props.privacySettings.allowRemoteSetupAgent}
            onClick={() =>
              props.onPrivacyChange({
                ...props.privacySettings,
                allowRemoteSetupAgent: !props.privacySettings.allowRemoteSetupAgent
              })
            }
          >
            {props.privacySettings.allowRemoteSetupAgent ? props.translate('enabled') : props.translate('disabled')}
          </button>
        </section>

        <section className="settings-section" id="settings-panel-usage" role="tabpanel" aria-labelledby="settings-tab-usage" hidden={activeSettingsTab !== 'usage'}>
          <div>
            <strong id="usage-settings-title">{props.translate('usage')}</strong>
            <p>{props.usageSummary.totalRequests} requests · {props.usageSummary.inputTokensEstimate + props.usageSummary.outputTokensEstimate} estimated tokens.</p>
          </div>
          <BarChart3 size={18} />
        </section>

        <div className="settings-tab-panel" id="settings-panel-providers" hidden={activeSettingsTab !== 'providers'} role="tabpanel" aria-labelledby="settings-tab-providers">
        <div className="settings-subheader">
          <strong>{props.translate('providerSettings')}</strong>
          <p>{props.translate('providerModelHelp')}</p>
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
        </div>

        <div className="settings-tab-panel" id="settings-panel-mcp" hidden={activeSettingsTab !== 'mcp'} role="tabpanel" aria-labelledby="settings-tab-mcp">
        <div className="settings-subheader">
          <strong>{props.translate('mcpMarketplace')}</strong>
          <p>{props.translate('mcpServersHelp')}</p>
        </div>

        <div className="provider-grid mcp-marketplace-grid">
          {mcpMarketplacePresets.map((preset) => (
            <button
              key={preset.id}
              className="provider-card"
              type="button"
              onClick={() => props.onInstallMcpPreset(preset.id)}
            >
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
              {preset.requiredEnv.length ? <small>{preset.requiredEnv.join(' · ')}</small> : <small>{props.translate('noSecretsRequired')}</small>}
            </button>
          ))}
        </div>

        <div className="settings-subheader">
          <strong>{props.translate('mcpServers')}</strong>
          <p>{props.translate('mcpCommandHelp')}</p>
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
  const [pendingSetup, setPendingSetup] = useState<{ input: string; plan: ReturnType<typeof createSetupAgentPlan> } | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useFocusTrap<HTMLElement>()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [props.messages])

  async function submit(): Promise<void> {
    const trimmedValue = value.trim()
    if (!trimmedValue || sending) return
    const plan = createSetupAgentPlan(trimmedValue)
    if (plan.hasActions) {
      setPendingSetup({ input: trimmedValue, plan })
      setValue('')
      return
    }

    setSending(true)
    setValue('')
    try {
      await props.onSend(trimmedValue)
    } finally {
      setSending(false)
    }
  }

  async function confirmPendingSetup(): Promise<void> {
    if (!pendingSetup || sending) return
    setSending(true)
    try {
      const input = pendingSetup.input
      setPendingSetup(null)
      await props.onSend(input)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="settings-modal setup-agent-modal" role="dialog" aria-modal="true" aria-labelledby="setup-agent-title" tabIndex={-1}>
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

        {pendingSetup ? (
          <div className="setup-agent-preview">
            <div>
              <strong>{props.translate('setupPlanPreview')}</strong>
              <p>{props.translate('setupPlanPreviewHelp')}</p>
            </div>
            <ul>
              {pendingSetup.plan.actions.map((action) => (
                <li key={`${action.type}-${action.label}`}>{action.label}</li>
              ))}
            </ul>
            {pendingSetup.plan.remoteSetupText ? (
              <pre>{pendingSetup.plan.remoteSetupText}</pre>
            ) : null}
            <div className="inline-actions">
              <button className="secondary-button" type="button" disabled={sending} onClick={() => setPendingSetup(null)}>
                {props.translate('cancel')}
              </button>
              <button className="primary-button" type="button" disabled={sending} onClick={() => void confirmPendingSetup()}>
                {props.translate('apply')}
              </button>
            </div>
          </div>
        ) : null}

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
  prompts: PromptTemplate[]
  translate: Translate
  onClose: () => void
  onSavePrompt: (template: Pick<PromptTemplate, 'title' | 'content'> & Partial<PromptTemplate>) => void
  onDeletePrompt: (templateId: string) => void
  onInsertPrompt: (template: PromptTemplate) => void
  onInstallSkill: (skill: SkillSummary) => void
}): JSX.Element {
  const [draft, setDraft] = useState<SkillInstallDraft>({ url: '', status: 'idle' })
  const [promptTitle, setPromptTitle] = useState('')
  const [promptContent, setPromptContent] = useState('')
  const [promptQuery, setPromptQuery] = useState('')
  const filteredPrompts = filterPromptTemplates(props.prompts, promptQuery)
  const dialogRef = useFocusTrap<HTMLElement>()

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
      <section ref={dialogRef} className="settings-modal skills-modal" role="dialog" aria-modal="true" aria-labelledby="skills-title" tabIndex={-1}>
        <header className="settings-header">
          <div>
            <h2 id="skills-title">{props.translate('skills')}</h2>
            <p>Preset skills, GitHub skill links, and local prompt templates.</p>
          </div>
          <button className="icon-button" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="skill-install-box">
          <label>
            <span>Prompt library</span>
            <input value={promptQuery} type="search" placeholder="Search prompts" onChange={(event) => setPromptQuery(event.target.value)} />
          </label>
          <div className="prompt-create-grid">
            <input value={promptTitle} placeholder="Prompt title" onChange={(event) => setPromptTitle(event.target.value)} />
            <textarea value={promptContent} placeholder="Prompt content" onChange={(event) => setPromptContent(event.target.value)} />
            <button
              className="primary-button"
              type="button"
              disabled={!promptContent.trim()}
              onClick={() => {
                props.onSavePrompt({ title: promptTitle, content: promptContent })
                setPromptTitle('')
                setPromptContent('')
              }}
            >
              Save prompt
            </button>
          </div>
        </div>

        <div className="skill-list prompt-list">
          {filteredPrompts.map((prompt) => (
            <article className="skill-card" key={prompt.id}>
              <div className="skill-card-header">
                <strong>{prompt.title}</strong>
                <span>{prompt.tags.join(' · ') || 'prompt'}</span>
              </div>
              <p>{prompt.content}</p>
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => props.onInsertPrompt(prompt)}>Insert</button>
                <button className="icon-button small" type="button" onClick={() => props.onDeletePrompt(prompt.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>

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

function RightPanel(props: {
  mode: RightPanelMode
  canvasValue: string
  libraryFiles: LibraryFile[]
  scheduledTasks: ScheduledTask[]
  codeWorkspace: CodeWorkspace
  memoryEntries: MemoryEntry[]
  checkpoints: ChatCheckpoint[]
  usageRecords: UsageRecord[]
  usageSummary: ReturnType<typeof summarizeUsage>
  isStreaming: boolean
  translate: Translate
  onCanvasChange: (value: string) => void
  onModeChange: (mode: RightPanelMode) => void
  onClose: () => void
  onAddFiles: () => void
  onDeleteLibraryFile: (fileId: string) => void
  onCreateScheduledTask: (title: string, schedule: string) => void
  onToggleScheduledTask: (taskId: string) => void
  onDeleteScheduledTask: (taskId: string) => void
  onRunScheduledTask: (taskId: string) => void
  onSaveMemoryEntry: (entry: Partial<MemoryEntry> & Pick<MemoryEntry, 'title' | 'content' | 'kind'>) => void
  onToggleMemoryEntry: (entryId: string) => void
  onDeleteMemoryEntry: (entryId: string) => void
  onCreateCheckpoint: () => void
  onRestoreCheckpoint: (checkpointId: string) => void
  onDeleteCheckpoint: (checkpointId: string) => void
  onClearUsage: () => void
  onCodeWorkspaceChange: React.Dispatch<React.SetStateAction<CodeWorkspace>>
  onApplyArtifactDiff: () => void
  onRejectArtifactDiff: () => void
  onAskCodeRevision: (instruction: string, selectedText: string) => void
}): JSX.Element {
  const panelTitle =
    props.mode === 'library'
      ? props.translate('libraryFiles')
      : props.mode === 'tasks'
      ? props.translate('scheduledTasks')
      : props.mode === 'code'
      ? props.translate('codeWorkspace')
      : props.mode === 'memory'
      ? 'Memory'
      : props.mode === 'checkpoints'
      ? 'Checkpoints'
      : props.mode === 'usage'
      ? 'Usage'
      : props.translate('workingCanvas')

  return (
    <aside className={`canvas-panel right-panel ${props.mode === 'code' ? 'code-workspace-panel' : ''}`} aria-label={panelTitle}>
      <header className="canvas-header">
        <button className="icon-button mobile-only" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
          <X size={18} />
        </button>
        <div>
          <strong>{panelTitle}</strong>
          <span>
            {props.mode === 'code'
              ? props.translate('codeWorkspaceHelp')
              : props.mode === 'library'
              ? props.translate('libraryHelp')
              : props.mode === 'tasks'
              ? props.translate('tasksHelp')
              : props.mode === 'memory'
              ? 'Project, space, and chat context injected into prompts.'
              : props.mode === 'checkpoints'
              ? 'Restore safe snapshots of this chat.'
              : props.mode === 'usage'
              ? 'Local request and token estimates.'
              : 'Version 1 · Editable draft'}
          </span>
        </div>
        <div className="canvas-actions">
          <button
            className="text-button"
            type="button"
            onClick={() => navigator.clipboard?.writeText(props.mode === 'code' ? props.codeWorkspace.content : props.canvasValue)}
          >
            <Copy size={15} />
            {props.translate('copy')}
          </button>
          <button className="icon-button" type="button" aria-label={props.translate('close')} title={props.translate('close')} onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="canvas-toolbar right-panel-tabs">
        <button className={props.mode === 'canvas' ? 'active' : ''} type="button" onClick={() => props.onModeChange('canvas')}>
          <FileText size={14} />
          {props.translate('workingCanvas')}
        </button>
        <button className={props.mode === 'library' ? 'active' : ''} type="button" onClick={() => props.onModeChange('library')}>
          <Archive size={14} />
          {props.translate('files')}
        </button>
        <button className={props.mode === 'tasks' ? 'active' : ''} type="button" onClick={() => props.onModeChange('tasks')}>
          <Clock3 size={14} />
          {props.translate('scheduledTasksShort')}
        </button>
        <button className={props.mode === 'code' ? 'active' : ''} type="button" onClick={() => props.onModeChange('code')}>
          <Code2 size={14} />
          {props.translate('code')}
        </button>
        <button className={props.mode === 'memory' ? 'active' : ''} type="button" onClick={() => props.onModeChange('memory')}>
          <BookOpen size={14} />
          {props.translate('memory')}
        </button>
        <button className={props.mode === 'checkpoints' ? 'active' : ''} type="button" onClick={() => props.onModeChange('checkpoints')}>
          <History size={14} />
          {props.translate('checkpoints')}
        </button>
        <button className={props.mode === 'usage' ? 'active' : ''} type="button" onClick={() => props.onModeChange('usage')}>
          <BarChart3 size={14} />
          {props.translate('usage')}
        </button>
      </div>
      {props.mode === 'library' ? (
        <LibraryPanel
          files={props.libraryFiles}
          translate={props.translate}
          onAddFiles={props.onAddFiles}
          onDeleteFile={props.onDeleteLibraryFile}
        />
      ) : props.mode === 'tasks' ? (
        <ScheduledTasksPanel
          tasks={props.scheduledTasks}
          translate={props.translate}
          onCreateTask={props.onCreateScheduledTask}
          onToggleTask={props.onToggleScheduledTask}
          onDeleteTask={props.onDeleteScheduledTask}
          onRunTask={props.onRunScheduledTask}
        />
      ) : props.mode === 'code' ? (
        <CodeWorkspacePanel
          workspace={props.codeWorkspace}
          isStreaming={props.isStreaming}
          translate={props.translate}
          onChange={props.onCodeWorkspaceChange}
          onApplyDiff={props.onApplyArtifactDiff}
          onRejectDiff={props.onRejectArtifactDiff}
          onAskRevision={props.onAskCodeRevision}
        />
      ) : props.mode === 'memory' ? (
        <MemoryPanel
          entries={props.memoryEntries}
          translate={props.translate}
          onSave={props.onSaveMemoryEntry}
          onToggle={props.onToggleMemoryEntry}
          onDelete={props.onDeleteMemoryEntry}
        />
      ) : props.mode === 'checkpoints' ? (
        <CheckpointsPanel
          checkpoints={props.checkpoints}
          translate={props.translate}
          onCreate={props.onCreateCheckpoint}
          onRestore={props.onRestoreCheckpoint}
          onDelete={props.onDeleteCheckpoint}
        />
      ) : props.mode === 'usage' ? (
        <UsagePanel records={props.usageRecords} summary={props.usageSummary} translate={props.translate} onClear={props.onClearUsage} />
      ) : (
        <textarea value={props.canvasValue} onChange={(event) => props.onCanvasChange(event.target.value)} aria-label="Canvas document" />
      )}
    </aside>
  )
}

function LibraryPanel(props: {
  files: LibraryFile[]
  translate: Translate
  onAddFiles: () => void
  onDeleteFile: (fileId: string) => void
}): JSX.Element {
  return (
    <div className="right-panel-content">
      <button className="primary-button" type="button" onClick={props.onAddFiles}>
        <Paperclip size={15} />
        {props.translate('addFiles')}
      </button>
      {props.files.length === 0 ? (
        <div className="panel-empty-state">
          <FileText size={24} />
          <strong>{props.translate('libraryEmptyTitle')}</strong>
          <span>{props.translate('libraryEmptyText')}</span>
        </div>
      ) : (
        <div className="library-file-list">
          {props.files.map((file) => (
            <article className="library-file-card" key={file.id}>
              <FileText size={18} />
              <div>
                <strong>{file.name}</strong>
                <span>
                  {formatBytes(file.size)} · {new Date(file.addedAt).toLocaleDateString()}
                </span>
              </div>
              <button className="icon-button small" type="button" aria-label={props.translate('delete')} title={props.translate('delete')} onClick={() => props.onDeleteFile(file.id)}>
                <Trash2 size={14} />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduledTasksPanel(props: {
  tasks: ScheduledTask[]
  translate: Translate
  onCreateTask: (title: string, schedule: string) => void
  onToggleTask: (taskId: string) => void
  onDeleteTask: (taskId: string) => void
  onRunTask: (taskId: string) => void
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [schedule, setSchedule] = useState('')

  function submitTask(): void {
    props.onCreateTask(title, schedule)
    setTitle('')
    setSchedule('')
  }

  return (
    <div className="right-panel-content">
      <div className="task-create-box">
        <input value={title} placeholder={props.translate('taskTitlePlaceholder')} onChange={(event) => setTitle(event.target.value)} />
        <input value={schedule} placeholder={props.translate('taskSchedulePlaceholder')} onChange={(event) => setSchedule(event.target.value)} />
        <button className="primary-button" type="button" disabled={!title.trim()} onClick={submitTask}>
          <Plus size={15} />
          {props.translate('create')}
        </button>
      </div>

      {props.tasks.length === 0 ? (
        <div className="panel-empty-state">
          <Clock3 size={24} />
          <strong>{props.translate('tasksEmptyTitle')}</strong>
          <span>{props.translate('tasksEmptyText')}</span>
        </div>
      ) : (
        <div className="task-list">
          {props.tasks.map((task) => (
            <article className={`task-card ${task.done ? 'done' : ''}`} key={task.id}>
              <button className="task-check" type="button" aria-label={props.translate('toggleTask')} onClick={() => props.onToggleTask(task.id)}>
                {task.done ? <Check size={15} /> : null}
              </button>
              <div>
                <strong>{task.title}</strong>
                <span>{task.schedule} · {task.status ?? 'idle'}</span>
              </div>
              <button className="text-button small" type="button" onClick={() => props.onRunTask(task.id)}>
                <Send size={13} />
                {props.translate('runNow')}
              </button>
              <button className="icon-button small" type="button" aria-label={props.translate('delete')} title={props.translate('delete')} onClick={() => props.onDeleteTask(task.id)}>
                <Trash2 size={14} />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function MemoryPanel(props: {
  entries: MemoryEntry[]
  translate: Translate
  onSave: (entry: Partial<MemoryEntry> & Pick<MemoryEntry, 'title' | 'content' | 'kind'>) => void
  onToggle: (entryId: string) => void
  onDelete: (entryId: string) => void
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [kind, setKind] = useState<MemoryEntry['kind']>('instruction')

  function submit(): void {
    props.onSave({ title, content, kind })
    setTitle('')
    setContent('')
  }

  return (
    <div className="right-panel-content">
      <div className="task-create-box vertical">
        <select value={kind} onChange={(event) => setKind(event.target.value as MemoryEntry['kind'])}>
          <option value="instruction">Instruction</option>
          <option value="decision">Decision</option>
          <option value="fact">Fact</option>
          <option value="style">Style</option>
        </select>
        <input value={title} placeholder={props.translate('memoryTitle')} onChange={(event) => setTitle(event.target.value)} />
        <textarea value={content} placeholder={props.translate('memoryPlaceholder')} onChange={(event) => setContent(event.target.value)} />
        <button className="primary-button" type="button" disabled={!content.trim()} onClick={submit}>
          <Plus size={15} />
          {props.translate('addMemory')}
        </button>
      </div>

      <div className="task-list">
        {props.entries.map((entry) => (
          <article className={`task-card memory-card ${entry.enabled ? '' : 'done'}`} key={entry.id}>
            <button className="task-check" type="button" onClick={() => props.onToggle(entry.id)}>
              {entry.enabled ? <Check size={15} /> : null}
            </button>
            <div>
              <strong>{entry.title}</strong>
              <span>{entry.kind} · {entry.content}</span>
            </div>
            <button className="icon-button small" type="button" onClick={() => props.onDelete(entry.id)}>
              <Trash2 size={14} />
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}

function CheckpointsPanel(props: {
  checkpoints: ChatCheckpoint[]
  translate: Translate
  onCreate: () => void
  onRestore: (checkpointId: string) => void
  onDelete: (checkpointId: string) => void
}): JSX.Element {
  return (
    <div className="right-panel-content">
      <button className="primary-button" type="button" onClick={() => props.onCreate()}>
        <History size={15} />
        {props.translate('createCheckpoint')}
      </button>
      <div className="task-list">
        {props.checkpoints.map((checkpoint) => (
          <article className="task-card checkpoint-card" key={checkpoint.id}>
            <div>
              <strong>{checkpoint.title}</strong>
              <span>{checkpoint.messageCount} messages · {new Date(checkpoint.createdAt).toLocaleString()}</span>
            </div>
            <button className="text-button small" type="button" onClick={() => props.onRestore(checkpoint.id)}>
              {props.translate('restoreCheckpoint')}
            </button>
            <button className="icon-button small" type="button" onClick={() => props.onDelete(checkpoint.id)}>
              <Trash2 size={14} />
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}

function UsagePanel(props: { records: UsageRecord[]; summary: ReturnType<typeof summarizeUsage>; translate: Translate; onClear: () => void }): JSX.Element {
  return (
    <div className="right-panel-content">
      <div className="usage-grid">
        <MetricCard label="Requests" value={props.summary.totalRequests.toString()} />
        <MetricCard label="Input tokens" value={props.summary.inputTokensEstimate.toString()} />
        <MetricCard label="Output tokens" value={props.summary.outputTokensEstimate.toString()} />
        <MetricCard label="Avg latency" value={`${props.summary.averageLatencyMs} ms`} />
      </div>
      <button className="text-button" type="button" onClick={props.onClear}>
        <Trash2 size={14} />
        {props.translate('clearUsage')}
      </button>
      <div className="task-list">
        {props.records.slice(0, 20).map((record) => (
          <article className="task-card usage-record" key={record.id}>
            <div>
              <strong>{record.modelId}</strong>
              <span>{record.status} · {record.inputTokensEstimate}/{record.outputTokensEstimate} tokens · {record.providerLabel ?? record.providerKind}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function MetricCard(props: { label: string; value: string }): JSX.Element {
  return (
    <div className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  )
}

function CodeWorkspacePanel(props: {
  workspace: CodeWorkspace
  isStreaming: boolean
  translate: Translate
  onChange: React.Dispatch<React.SetStateAction<CodeWorkspace>>
  onApplyDiff: () => void
  onRejectDiff: () => void
  onAskRevision: (instruction: string, selectedText: string) => void
}): JSX.Element {
  const canPreviewHtml = /^(html|htm)$/.test(props.workspace.language.toLowerCase()) || /<!doctype html|<html[\s>]|<body[\s>]/i.test(props.workspace.content)
  const selectedText = props.workspace.selectedText.trim()

  return (
    <div className="code-workspace">
      <div className="code-editor-pane">
        <div className="code-workspace-meta">
          <Code2 size={15} />
          <span>{props.workspace.language || 'text'} · v{props.workspace.version ?? 1}</span>
          {props.isStreaming ? <span className="streaming-dot">{props.translate('live')}</span> : null}
        </div>
        {props.workspace.pendingDiff ? (
          <div className="artifact-diff-box">
            <strong>Pending diff</strong>
            <span>
              +{props.workspace.pendingDiff.addedLines} / -{props.workspace.pendingDiff.removedLines}
            </span>
            <div className="inline-actions">
              <button className="primary-button" type="button" onClick={props.onApplyDiff}>Apply</button>
              <button className="text-button" type="button" onClick={props.onRejectDiff}>Reject</button>
            </div>
          </div>
        ) : null}
        <textarea
          value={props.workspace.content}
          spellCheck={false}
          aria-label={props.translate('codeWorkspace')}
          placeholder={props.translate('codeWorkspacePlaceholder')}
          onChange={(event) =>
            props.onChange((workspace) => ({
              ...workspace,
              content: event.target.value
            }))
          }
          onSelect={(event) => {
            const target = event.currentTarget
            props.onChange((workspace) => ({
              ...workspace,
              selectedText: target.value.slice(target.selectionStart, target.selectionEnd)
            }))
          }}
        />
      </div>

      <div className="code-revision-box">
        <div>
          <strong>{props.translate('targetedEdit')}</strong>
          <span>{selectedText ? props.translate('selectionReady') : props.translate('selectionEmpty')}</span>
        </div>
        <textarea
          value={props.workspace.instruction}
          rows={3}
          placeholder={props.translate('codeRevisionPlaceholder')}
          onChange={(event) =>
            props.onChange((workspace) => ({
              ...workspace,
              instruction: event.target.value
            }))
          }
        />
        <button
          className="primary-button"
          type="button"
          disabled={props.isStreaming || (!props.workspace.content.trim() && !selectedText)}
          onClick={() => {
            props.onAskRevision(props.workspace.instruction, props.workspace.selectedText)
            props.onChange((workspace) => ({ ...workspace, instruction: '' }))
          }}
        >
          <Send size={15} />
          {props.translate('askSelection')}
        </button>
      </div>

      {canPreviewHtml ? (
        <div className="code-preview-pane">
          <div className="code-workspace-meta">
            <Eye size={15} />
            <span>{props.translate('preview')}</span>
          </div>
          <iframe title={props.translate('preview')} sandbox="allow-scripts" srcDoc={props.workspace.content} />
        </div>
      ) : (
        <div className="panel-empty-state compact">
          <Eye size={22} />
          <strong>{props.translate('previewUnavailableTitle')}</strong>
          <span>{props.translate('previewUnavailableText')}</span>
        </div>
      )}
    </div>
  )
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

function useFocusTrap<T extends HTMLElement>(enabled = true): React.RefObject<T> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!enabled) return
    const element = ref.current
    if (!element) return
    const trappedElement = element

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusableSelector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',')
    const getFocusable = (): HTMLElement[] =>
      Array.from(trappedElement.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (candidate) => candidate.offsetParent !== null
      )

    ;(getFocusable()[0] ?? trappedElement).focus({ preventScroll: true })

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Tab') return
      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        trappedElement.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus({ preventScroll: true })
    }
  }, [enabled])

  return ref
}

function usePersistentState<T>(
  key: string,
  initialValue: T,
  normalize?: (value: unknown, fallbackValue: T) => T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const storedValue = localStorage.getItem(key)
      const parsedValue = safeParsePersistentValue<unknown>(storedValue, initialValue)
      return normalize ? normalize(parsedValue, initialValue) : (parsedValue as T)
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(createPersistentStateEnvelope(value)))
  }, [key, value])

  return [value, setValue]
}
