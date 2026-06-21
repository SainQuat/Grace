# Grace v0.1 PRD

## Goal

Grace v0.1 is a desktop AI chat client for everyday work: quick questions, long conversations, writing, code, ideas, and document drafting.

The first screen must be the working chat surface, not a marketing page.

## Target User

People who use Claude, ChatGPT, DeepSeek, or local models daily and want one desktop workspace with local chat history, provider choice, and a focused interface.

## Scope

### Included

- Desktop app shell for macOS and Windows.
- Sidebar with new chat, search, pinned chats, projects, recents, files, scheduled tasks, apps, and settings entry points.
- Central chat thread with empty state, active conversation, user/assistant messages, markdown, code blocks, message actions, and streaming state.
- Composer with multiline input, send/stop, tool menu, model picker, reasoning effort, selected tool chips, and file chips.
- Custom OpenAI-compatible provider settings with base URL, API key, automatic model discovery, refresh, and model picker integration.
- Canvas panel for long-form writing/code drafts beside the chat on desktop and as an overlay on smaller screens.
- Local persistence for chat UI state.
- Safe Electron IPC boundary for AI generation through the main process.

### Excluded From v0.1

- Cloud sync, accounts, billing, and team collaboration.
- Full file ingestion/RAG.
- MCP, agents, autonomous pipelines, and scheduled background execution.
- Signed production installers.

## UX Requirements

- User can start a chat within 3 seconds.
- Composer is primary but not oversized.
- Chat remains readable during long conversations.
- Sidebar supports many chats without clutter.
- UI is neutral, professional, and independent of OpenAI/ChatGPT branding.
- Mobile/tablet layouts expose sidebar and menus as drawer/bottom sheet patterns.

## Technical Requirements

- Stack: Electron, React, TypeScript, Vite.
- Renderer has no Node integration.
- Main process owns AI/provider calls.
- Preload exposes a narrow `window.graceAI` API.
- Chat streaming supports delta, done, error, and stop events.
- Custom provider keys are stored in the Electron main process with OS-backed encryption when available and are never returned to renderer state.
- OpenAI-compatible providers use `GET /models` for discovery and streamed `POST /chat/completions` for generation.
- CI runs tests and production build.

## Acceptance Criteria

- App builds with `npm run build`.
- Tests pass with `npm run test`.
- Dev app opens with `npm run dev`.
- Sending a message immediately appends user content and streams an assistant response.
- Stop button interrupts active generation.
- New chat creates a new empty conversation.
- Tool menu, model picker, file chips, and canvas panel are reachable by keyboard and pointer.
