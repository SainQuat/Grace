import {
  Archive,
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
import type { ChatMessagePayload, ChatStreamEvent, CustomProviderSummary, ProviderModel } from '../../shared/types'
import { createDraftTitle, formatBytes, groupModelsByProvider, uid } from './utils'

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
  pinned?: boolean
  messages: Message[]
  updatedAt: string
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
  supportsEffort: boolean
}

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

function toCustomModelOptions(models: ProviderModel[], baseUrl: string): ModelOption[] {
  return models.map((model) => ({
    id: `custom:${model.id}`,
    modelId: model.id,
    label: model.label || model.id,
    provider: 'Custom',
    description: model.ownedBy ? `Owned by ${model.ownedBy}` : model.id,
    hint: baseUrl || 'OpenAI-compatible endpoint',
    providerKind: 'custom',
    supportsEffort: false
  }))
}

const initialChats: Chat[] = [
  {
    id: 'chat-product-plan',
    title: 'Product plan for Grace v0.1',
    pinned: true,
    project: 'Grace',
    updatedAt: new Date().toISOString(),
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Sketch the first version of a desktop AI chat app.'
      },
      {
        id: 'm2',
        role: 'assistant',
        content:
          'Start with a local-first chat client: sidebar history, model picker, streaming responses, files as chips, and a canvas panel for long writing. Keep provider keys in the desktop runtime, not in renderer state.'
      }
    ]
  },
  {
    id: 'chat-release-notes',
    title: 'Release notes template',
    updatedAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    messages: []
  },
  {
    id: 'chat-ui-copy',
    title: 'Improve onboarding copy',
    project: 'Writing',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    messages: []
  }
]

const canvasInitialValue = `# Working draft

Use this canvas for long answers, specs, code, and edited documents.

- Select text in a future build to ask Grace about that selection.
- Export or copy when the draft is ready.
- Keep the chat open while refining the document.`

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
  const [themeMode, setThemeMode] = usePersistentState<ThemeMode>('grace.themeMode', 'light')
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(false)
  const [customProvider, setCustomProvider] = useState<CustomProviderSummary>({
    baseUrl: '',
    configured: false,
    models: []
  })
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const requestChatRef = useRef<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const availableModels = useMemo(
    () => [...builtInModels, ...toCustomModelOptions(customProvider.models, customProvider.baseUrl)],
    [customProvider.baseUrl, customProvider.models]
  )
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0]
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0]
  const selectedTools = tools.filter((tool) => selectedToolIds.includes(tool.id))
  const canSend = composerValue.trim().length > 0 || attachedFiles.length > 0
  const isStreaming = activeRequestId !== null
  const nextThemeMode: ThemeMode = themeMode === 'dark' ? 'light' : 'dark'

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeMode
  }, [themeMode])

  useEffect(() => {
    window.graceAI
      .getCustomProvider()
      .then(setCustomProvider)
      .catch((error) => {
        setCustomProvider({
          baseUrl: '',
          configured: false,
          models: [],
          lastError: error instanceof Error ? error.message : 'Failed to load custom provider.'
        })
      })
  }, [])

  useEffect(() => {
    if (!availableModels.some((model) => model.id === modelId)) {
      setModelId(builtInModels[0].id)
    }
  }, [availableModels, modelId, setModelId])

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
      title: 'New chat',
      messages: [],
      updatedAt: new Date().toISOString()
    }

    setChats((currentChats) => [chat, ...currentChats])
    setActiveChatId(chat.id)
    setMobileSidebarOpen(false)
    setTimeout(() => textareaRef.current?.focus(), 0)
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

  return (
    <div className="app-shell">
      <Sidebar
        chats={chats}
        activeChatId={activeChat.id}
        open={sidebarOpen}
        mobileOpen={mobileSidebarOpen}
        onToggle={() => setSidebarOpen((open) => !open)}
        onMobileClose={() => setMobileSidebarOpen(false)}
        onNewChat={createNewChat}
        onSelectChat={(chatId) => {
          setActiveChatId(chatId)
          setMobileSidebarOpen(false)
        }}
        onOpenProviderSettings={() => setProviderSettingsOpen(true)}
      />

      <main className={`main-pane ${canvasOpen ? 'with-canvas' : ''}`}>
        <TopBar
          title={activeChat.title}
          model={selectedModel}
          themeMode={themeMode}
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
          onPromptClick={sendMessage}
          onCopy={(content) => navigator.clipboard?.writeText(content)}
          onRetry={() => activeChat.messages.at(-2)?.content && sendMessage(activeChat.messages.at(-2)!.content)}
        />

        <Composer
          value={composerValue}
          textareaRef={textareaRef}
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
          onChange={setCanvasValue}
          onClose={() => setCanvasOpen(false)}
        />
      ) : null}

      {providerSettingsOpen ? (
        <ProviderSettingsModal
          provider={customProvider}
          themeMode={themeMode}
          onClose={() => setProviderSettingsOpen(false)}
          onThemeChange={setThemeMode}
          onSaved={(provider) => {
            setCustomProvider(provider)
            const firstCustomModel = provider.models[0]
            if (firstCustomModel) {
              setModelId(`custom:${firstCustomModel.id}`)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function Sidebar(props: {
  chats: Chat[]
  activeChatId: string
  open: boolean
  mobileOpen: boolean
  onToggle: () => void
  onMobileClose: () => void
  onNewChat: () => void
  onSelectChat: (chatId: string) => void
  onOpenProviderSettings: () => void
}): JSX.Element {
  const { chats, activeChatId, open, mobileOpen, onToggle, onMobileClose, onNewChat, onSelectChat, onOpenProviderSettings } = props
  const pinnedChats = chats.filter((chat) => chat.pinned)
  const recentChats = chats.filter((chat) => !chat.pinned)
  const projects = Array.from(new Set(chats.map((chat) => chat.project).filter(Boolean))) as string[]

  return (
    <>
      <aside className={`sidebar ${open ? 'expanded' : 'collapsed'} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-top">
          <button className="icon-button" type="button" aria-label="Toggle sidebar" title="Toggle sidebar" onClick={onToggle}>
            <Menu size={18} />
          </button>
          {open ? (
            <button className="new-chat-button" type="button" onClick={onNewChat}>
              <Plus size={17} />
              New chat
            </button>
          ) : null}
        </div>

        {open ? (
          <>
            <label className="search-box">
              <Search size={16} />
              <input type="search" placeholder="Search chats" aria-label="Search chats" />
            </label>

            <SidebarSection title="Pinned" icon={<Pin size={14} />}>
              {pinnedChats.map((chat) => (
                <SidebarRow key={chat.id} chat={chat} active={chat.id === activeChatId} onSelect={onSelectChat} />
              ))}
            </SidebarSection>

            <SidebarSection title="Projects" icon={<Folder size={14} />}>
              {projects.map((project) => (
                <button className="sidebar-row" key={project} type="button">
                  <Folder size={15} />
                  <span>{project}</span>
                  <MoreHorizontal className="row-more" size={15} />
                </button>
              ))}
            </SidebarSection>

            <SidebarSection title="Recents" icon={<History size={14} />}>
              {recentChats.map((chat) => (
                <SidebarRow key={chat.id} chat={chat} active={chat.id === activeChatId} onSelect={onSelectChat} />
              ))}
            </SidebarSection>
          </>
        ) : (
          <div className="icon-rail" aria-label="Collapsed navigation">
            <button className="icon-button" type="button" aria-label="New chat" title="New chat" onClick={onNewChat}>
              <Plus size={18} />
            </button>
            <button className="icon-button" type="button" aria-label="Search" title="Search">
              <Search size={18} />
            </button>
            <button className="icon-button" type="button" aria-label="Pinned chats" title="Pinned chats">
              <Pin size={18} />
            </button>
            <button className="icon-button" type="button" aria-label="Files" title="Files">
              <FileText size={18} />
            </button>
          </div>
        )}

        {open ? (
          <div className="sidebar-bottom">
            <button className="sidebar-row" type="button">
              <Archive size={15} />
              <span>Library / Files</span>
            </button>
            <button className="sidebar-row" type="button">
              <Clock3 size={15} />
              <span>Scheduled tasks</span>
            </button>
            <button className="sidebar-row" type="button">
              <Zap size={15} />
              <span>Apps / integrations</span>
            </button>
            <button className="account-row" type="button" onClick={onOpenProviderSettings}>
              <span className="avatar">G</span>
              <span>
                <strong>Grace local</strong>
                <small>Settings and providers</small>
              </span>
              <Settings size={15} />
            </button>
          </div>
        ) : null}
      </aside>
      {mobileOpen ? <button className="scrim" aria-label="Close sidebar" type="button" onClick={onMobileClose} /> : null}
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

function SidebarRow(props: { chat: Chat; active: boolean; onSelect: (chatId: string) => void }): JSX.Element {
  return (
    <button
      className={`sidebar-row ${props.active ? 'active' : ''}`}
      type="button"
      onClick={() => props.onSelect(props.chat.id)}
    >
      <span className="row-dot" />
      <span>{props.chat.title}</span>
      <MoreHorizontal className="row-more" size={15} />
    </button>
  )
}

function TopBar(props: {
  title: string
  model: ModelOption
  themeMode: ThemeMode
  sidebarOpen: boolean
  canvasOpen: boolean
  onOpenMobileSidebar: () => void
  onToggleSidebar: () => void
  onToggleCanvas: () => void
  onToggleTheme: () => void
}): JSX.Element {
  const themeLabel = props.themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button mobile-menu-button" type="button" aria-label="Open sidebar" title="Open sidebar" onClick={props.onOpenMobileSidebar}>
          <Menu size={18} />
        </button>
        <button className="icon-button desktop-only" type="button" aria-label="Toggle sidebar" title="Toggle sidebar" onClick={props.onToggleSidebar}>
          <Menu size={18} />
        </button>
        <div className="title-block">
          <strong>{props.title}</strong>
          <span>{props.model.label}</span>
        </div>
      </div>
      <div className="topbar-actions">
        <button className="text-button" type="button">
          <ShareIcon />
          Share
        </button>
        <button className="icon-button" type="button" aria-label={themeLabel} title={themeLabel} onClick={props.onToggleTheme}>
          {props.themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          className={`icon-button ${props.canvasOpen ? 'active' : ''}`}
          type="button"
          aria-label="Toggle canvas"
          title="Toggle canvas"
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
          <h1>How can Grace help?</h1>
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
            onCopy={props.onCopy}
            onRetry={props.onRetry}
          />
        ))}
        {props.isStreaming ? (
          <div className="stream-status" aria-live="polite">
            Grace is responding<span className="cursor-dot" />
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
    </section>
  )
}

function MessageBubble(props: {
  message: Message
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
        <button className="icon-button small" type="button" aria-label="Copy message" title="Copy" onClick={() => onCopy(message.content)}>
          <Copy size={15} />
        </button>
        {message.role === 'assistant' ? (
          <>
            <button className="icon-button small" type="button" aria-label="Regenerate response" title="Regenerate" onClick={onRetry}>
              <RefreshCw size={15} />
            </button>
            <button className="icon-button small" type="button" aria-label="Good response" title="Good response">
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
    <section className="composer-zone" aria-label="Message composer">
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
          aria-label="Message Grace"
          placeholder="Message Grace..."
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
            <button className="icon-button" type="button" aria-label="Open tool menu" title="Tools" onClick={props.onToggleToolMenu}>
              <Plus size={18} />
            </button>
            <button className="model-chip" type="button" onClick={props.onToggleModelMenu}>
              {props.selectedModel.label}
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="composer-right">
            <button className="icon-button" type="button" aria-label="Voice input" title="Voice">
              <Mic size={18} />
            </button>
            {props.isStreaming ? (
              <button className="send-button" type="button" aria-label="Stop response" title="Stop" onClick={props.onStop}>
                <Square size={16} />
              </button>
            ) : (
              <button className="send-button" type="button" aria-label="Send message" title="Send" disabled={!props.canSend} onClick={props.onSend}>
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
  onSelectModel: (model: ModelOption) => void
  onEffortChange: (effort: 'low' | 'medium' | 'high') => void
  onOpenProviderSettings: () => void
}): JSX.Element {
  const modelGroups = groupModelsByProvider(props.models)

  return (
    <div className="floating-menu model-menu" role="menu" aria-label="Model picker">
      <div className="menu-heading">Choose model</div>
      <div className="model-list-scroll">
        {modelGroups.map((group) => (
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
        ))}
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
              {value}
            </button>
          ))}
        </div>
      ) : null}
      <button className="menu-secondary-action" type="button" onClick={props.onOpenProviderSettings}>
        <Settings size={16} />
        Manage custom provider
      </button>
    </div>
  )
}

function ProviderSettingsModal(props: {
  provider: CustomProviderSummary
  themeMode: ThemeMode
  onClose: () => void
  onThemeChange: (themeMode: ThemeMode) => void
  onSaved: (provider: CustomProviderSummary) => void
}): JSX.Element {
  const [baseUrl, setBaseUrl] = useState(props.provider.baseUrl || 'https://api.zed.md/v1')
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'refreshing'>('idle')
  const [error, setError] = useState<string | null>(props.provider.lastError ?? null)

  const hasStoredKey = props.provider.configured
  const baseUrlMatchesStored = baseUrl.trim().replace(/\/+$/, '') === props.provider.baseUrl.trim().replace(/\/+$/, '')
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
      const provider = await window.graceAI.refreshCustomProviderModels()
      props.onSaved(provider)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh models.')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Manage appearance and custom provider access.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close settings" title="Close" onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>

        <section className="settings-section" aria-labelledby="appearance-settings-title">
          <div>
            <strong id="appearance-settings-title">Appearance</strong>
            <p>Theme</p>
          </div>
          <div className="theme-segmented" role="group" aria-label="Theme">
            <button
              className={props.themeMode === 'light' ? 'active' : ''}
              type="button"
              aria-pressed={props.themeMode === 'light'}
              onClick={() => props.onThemeChange('light')}
            >
              <Sun size={15} />
              Light
            </button>
            <button
              className={props.themeMode === 'dark' ? 'active' : ''}
              type="button"
              aria-pressed={props.themeMode === 'dark'}
              onClick={() => props.onThemeChange('dark')}
            >
              <Moon size={15} />
              Dark
            </button>
          </div>
        </section>

        <div className="settings-subheader">
          <strong>Custom provider</strong>
          <p>Connect any OpenAI-compatible endpoint. Models are loaded from `/models`.</p>
        </div>

        <div className="settings-form">
          <label>
            <span>Base URL</span>
            <input
              value={baseUrl}
              type="url"
              placeholder="https://api.example.com/v1"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>
          <label>
            <span>API key</span>
            <input
              value={apiKey}
              type="password"
              placeholder={hasStoredKey ? 'Stored securely. Enter a new key to replace it.' : 'Provider API key'}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
        </div>

        {error ? <div className="settings-error" role="alert">{error}</div> : null}

        <div className="settings-actions">
          <button className="text-button" type="button" onClick={refreshModels} disabled={!hasStoredKey || status !== 'idle'}>
            <RefreshCw size={15} />
            Refresh models
          </button>
          <button className="primary-button" type="button" onClick={saveProvider} disabled={!canSave || status !== 'idle'}>
            {status === 'saving' ? 'Checking...' : status === 'refreshing' ? 'Refreshing...' : 'Save provider'}
          </button>
        </div>

        <div className="settings-models">
          <div className="settings-models-header">
            <strong>{props.provider.models.length} models</strong>
            {props.provider.updatedAt ? <span>Updated {new Date(props.provider.updatedAt).toLocaleString()}</span> : null}
          </div>
          <div className="settings-model-list">
            {props.provider.models.length > 0 ? (
              props.provider.models.map((model) => (
                <div className="settings-model-row" key={model.id}>
                  <strong>{model.label}</strong>
                  <span>{model.id}</span>
                </div>
              ))
            ) : (
              <p>No custom models loaded yet.</p>
            )}
          </div>
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

function CanvasPanel(props: { value: string; onChange: (value: string) => void; onClose: () => void }): JSX.Element {
  return (
    <aside className="canvas-panel" aria-label="Canvas editor">
      <header className="canvas-header">
        <button className="icon-button mobile-only" type="button" aria-label="Close canvas" title="Back" onClick={props.onClose}>
          <X size={18} />
        </button>
        <div>
          <strong>Working canvas</strong>
          <span>Version 1 · Editable draft</span>
        </div>
        <div className="canvas-actions">
          <button className="text-button" type="button" onClick={() => navigator.clipboard?.writeText(props.value)}>
            <Copy size={15} />
            Copy
          </button>
          <button className="icon-button" type="button" aria-label="Delete draft" title="Delete draft">
            <Trash2 size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="Close canvas" title="Close canvas" onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="canvas-toolbar">
        <button type="button">Ask about selection</button>
        <button type="button">Export</button>
        <button type="button">History</button>
      </div>
      <textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} aria-label="Canvas document" />
    </aside>
  )
}

function ShareIcon(): JSX.Element {
  return <Copy size={15} />
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
