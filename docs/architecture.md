# Architecture

Grace is a local-first desktop AI chat app.

## Current baseline

- `main` is the stable integration branch.
- Feature work happens in short-lived branches and Conductor workspaces.
- Pull requests run CI before merge.
- Tags named `vMAJOR.MINOR.PATCH` create GitHub Releases.
- GitHub Environments represent `staging` and `production` deployments.

## v0.1 stack

- Desktop shell: Electron.
- Renderer: React, TypeScript, Vite.
- Main process: provider/runtime boundary and streaming IPC.
- Preload: narrow `window.graceAI` API.
- Storage: renderer local storage for v0.1 chat state.
- Custom provider credentials: stored by the Electron main process with `safeStorage`; API keys are not returned to the renderer.
- Styling: plain CSS with design tokens.
- Testing: Vitest for focused logic tests, TypeScript build for compile checks.
- Packaging: `electron-builder` produces unsigned macOS `.dmg` installers with the app icon from `resources/icon.icns`.

## Application shape

The default target is an AI application with these boundaries:

- Renderer: chat UI, local UI state, keyboard interactions, and responsive layout.
- Main process: model calls, desktop APIs, file access, and background work.
- Preload: typed IPC bridge with no direct Node access in the renderer.
- Provider adapters: OpenAI, Anthropic, DeepSeek, OpenRouter, and local endpoints later.
- Custom OpenAI-compatible provider: base URL + API key, `/models` discovery, `/chat/completions` streaming.
- Data layer: SQLite or equivalent local database after v0.1.

Keep provider-specific code behind a small interface so model vendors can change without reshaping product code.

## Non-goals for the scaffold

- No cloud provider is hardcoded.
- No production secrets belong in git.
- No Apple Developer ID signing or notarization is configured yet.
