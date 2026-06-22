# Grace Design Brief

Grace must feel like a strict local desktop workbench for AI work, not a consumer AI chatbot. The reference direction is Conductor-like: dense panels, explicit workspace state, compact controls, clear borders, dark surfaces, and orange only as an action/status accent.

This document is the repo-local design contract for future UI work. Any redesign PR should cite it and keep deviations explicit.

## Product Position

Grace is a local-first desktop AI workspace for power users who work with many models, projects, chats, skills, files, and code artifacts. The app should help users move from a prompt to durable work: thread, artifact, preview, task, provider setup, or project context.

Target users:

- Engineers, founders, PMs, operators, and other AI power users.
- People who use Claude, ChatGPT, DeepSeek, local models, or custom providers daily.
- Users who understand Conductor-style workflows: parallel workspaces, isolated tasks, threads, checks, artifacts, and local state.

Core jobs:

- Start a useful chat quickly without onboarding or marketing screens.
- Organize work by project/space/thread and find old context fast.
- Choose provider, model, effort, tools, files, and skills before sending.
- Turn assistant output into artifacts: code, preview, canvas draft, file, task, or setup change.
- Configure providers, MCP servers, skills, language, and app behavior safely.

## Design Principles

1. Workspace first. The first screen is a working surface: left navigator, center thread, right artifact panel. No landing page, no hero composition, no promotional copy.
2. Strict desktop density. Prefer compact rows, toolbars, metadata, and split panels over large cards.
3. Conductor-like mental model. Grace should feel closer to a local agent workspace than a consumer chat app.
4. Dark-first. Dark mode is the primary design. Light mode can exist, but must not drive decisions.
5. Orange is a signal. Orange marks focus, selected state, primary action, running state, and warnings. It must not flood the UI.
6. Real controls only. If a visible control does not work yet, hide it or mark it disabled with a reason.
7. Artifacts are first-class. Canvas, Files, Tasks, and Code are peer modes in the right panel, not optional decorations.
8. No AI slop. No fake magic, glow, mascots, gradient blobs, sparkles, “AI-powered” marketing, or decorative filler.

## Information Architecture

Base layout:

- Left sidebar: workspace navigation.
- Center: active thread and composer.
- Right panel: artifact/workbench inspector.

Sidebar structure:

- New chat or new workspace entry.
- Search.
- All chats.
- Pinned.
- Projects.
- Spaces.
- Recent or scoped chats.
- Footer: Skills/Capabilities, Setup Agent, Files, Scheduled Tasks, Settings.

Center structure:

- Topbar with active thread title, project/space context, provider/model, and run state.
- Thread body with readable messages, markdown, code blocks, actions, streaming state.
- Composer with input, skill/tool/file chips, model picker, effort, attach/tool controls, send/stop.

Right panel structure:

- Header with current mode and concise status.
- Tabs: Canvas, Files, Tasks, Code.
- Content area must scroll independently.
- Future modes can include Diff, Checks, Logs, PR readiness, and local run output.

Settings structure:

- Prefer a settings console with sections/tabs over one long modal.
- Sections: Appearance, Providers, Models, MCP/Integrations, Skills, Notifications, Data/Privacy.

## Visual System

Use plain CSS variables as the source of truth. Keep the existing semantic token approach and expand it only where it removes duplication.

Recommended dark tokens:

```css
--bg: #0e0d0b;
--sidebar: #151411;
--surface: #1b1916;
--surface-muted: #24211c;
--surface-hover: #2c2822;
--surface-active: #342d24;
--surface-elevated: #201d19;

--border: #302c25;
--border-strong: #4a4034;

--text: #f4efe6;
--muted: #b7ad9f;
--muted-2: #887d70;
--disabled: #62594f;

--accent: #f97316;
--accent-hover: #fb923c;
--accent-active: #ea580c;
--accent-soft: rgba(249, 115, 22, 0.14);
--accent-border: rgba(249, 115, 22, 0.46);

--error: #ef4444;
--error-bg: rgba(127, 29, 29, 0.28);
--success: #22c55e;
--warning: #f59e0b;

--shadow-menu: 0 16px 48px rgba(0, 0, 0, 0.48);
--shadow-modal: 0 28px 90px rgba(0, 0, 0, 0.58);
```

Typography:

- Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Root size: 14-15px. No viewport-scaled fonts.
- Letter spacing: always `0`.
- Sidebar rows: 14px, medium.
- Metadata and section labels: 11-12px, muted, uppercase where useful.
- Topbar title: 15-16px, semibold.
- Chat body: 15-16px, line-height 1.55-1.6.
- Code/logs/branches/paths: 13px monospace, line-height 1.5.
- Modal headings: 20-22px max. No hero-scale type inside the app shell.

Spacing and shape:

- Use a 4px base grid: 4, 8, 12, 16, 20, 24, 32.
- Sidebar rows: 36-40px.
- Icon buttons: 32px or 36px.
- Inputs: 38-42px.
- Toolbar buttons: 32px.
- Small controls radius: 6px.
- Rows, inputs, buttons, item cards: 8px.
- Menus, modals, panels: 10-12px.
- Composer: compact, stable, about 12-16px radius; not a huge soft pill.
- Pills only for chips, badges, and send button.

Borders and elevation:

- Use borders and subtle surface steps for structure.
- Main panels: `1px solid var(--border)`.
- Floating menus and modals can use shadows.
- No colored glow around orange elements.
- Selected state: `surface-active`, orange icon/text, or a thin orange rail/border.

States:

- Hover: `--surface-hover`.
- Active: `--surface-active` plus orange signal.
- Focus visible: 2px solid `--accent`, offset 2px.
- Disabled: muted/disabled token, still legible.
- Destructive: red only for delete/error.
- Streaming/running: small orange dot/pulse; honor `prefers-reduced-motion`.

Icons:

- Use `lucide-react`.
- Nav icons: 16px.
- Primary icon buttons: 18px.
- Small row actions: 14px.
- Icon-only buttons need `aria-label` and title/tooltip equivalent.

## Component Rules

Sidebar:

- Treat sidebar as workspace navigator, not chat-only history.
- Active row needs a clear orange marker or accent state.
- Project colors must be small, muted badges; avoid rainbow UI.
- Collapsed rail should be icon-only with labels via `title`/tooltip.

Topbar:

- Keep macOS titlebar safe area.
- Show current thread, project/space, provider/model, and run state.
- Avoid large “share” style marketing actions unless they perform a real workflow.

Chat:

- Assistant messages should not need large bubbles.
- User messages can use a muted compact bubble.
- Markdown should be tight and readable.
- Code blocks use dark editor styling and compact headers.
- Message actions stay as small icon buttons.

Empty state:

- No mascot, no oversized “How can I help?” hero.
- Keep it compact and operational.
- Suggestions should look like command/work prompts, not marketing cards.

Composer:

- Composer is the primary action surface but must stay compact.
- Chips live above or inside the composer without shifting layout.
- Tool/model controls on the left; send/stop on the right.
- It must not jump when files, skills, streaming, or model labels change.

Right panel:

- Treat as inspector/workbench.
- Canvas/editor areas should be unframed work surfaces, not decorative cards.
- Files, tasks, and code rows must be dense, scrollable, and actionable.
- Code mode supports generate -> preview -> select -> targeted edit.

Settings and modals:

- Overlay: dark scrim around `rgba(0,0,0,.5)`.
- Modal max width around 720px.
- Prefer sectioned settings over long mixed forms.
- Provider cards show configured/error/loading/refresh states clearly.

## Anti-Slop Rules

Do not use:

- Purple/blue SaaS gradients.
- Gradient orbs, bokeh blobs, particles, decorative waves.
- Glassmorphism, neon glow, orange halos.
- Fake AI brain, robot mascot, sparkle icons, “magic” decoration.
- Abstract 3D shapes or stock imagery for atmosphere.
- Marketing hero sections inside the app.
- Large nested cards.
- Random emoji.
- Negative letter-spacing.
- Viewport-scaled fonts.
- Rainbow provider/project palette as dominant visual language.
- Copy like “AI-powered”, “supercharge”, “magic”, unless it is user content.

Allowed:

- Dark flat panels.
- Warm graphite/near-black neutrals.
- Thin borders.
- Compact rows.
- Lucide icons.
- Orange as intent/focus/action/status.

## Current UX Gaps To Fix

- Current system accent is teal; redesign should use orange.
- Empty state still feels like generic AI chat.
- Composer feels too soft/consumer-chat.
- Some visible controls are not fully backed by functionality. Hide or disable incomplete tools.
- Sidebar search is visually present but not complete enough for many chats.
- Settings mixes appearance, providers, models, MCP, notifications, and skills in one scroll-heavy modal.
- Some labels mix Russian and English.
- Native `window.prompt`/`window.confirm` for rename/delete should eventually be replaced by desktop-quality dialogs.
- Right panel should feel equal to chat, not a canvas add-on.

## Implementation Plan

Phase 0: Baseline.

- Capture screenshots for current dark UI, sidebar open/collapsed, right panel modes, model menu, tool menu, provider settings, setup agent, skills modal, and mobile breakpoints.
- Run `npm test`.

Phase 1: Tokens.

- Update `src/renderer/src/styles.css` tokens to strict dark/orange.
- Replace hard-coded colors in code blocks, scrim, shadows, and editor surfaces with tokens.
- Update `src/main/index.ts` `BrowserWindow.backgroundColor` to match the dark shell.
- Consider dark-first `src/renderer/index.html` to avoid white flash before React mounts.

Phase 2: Shell.

- Redesign `app-shell`, sidebar, topbar, chat thread, and composer mostly in CSS.
- Avoid logic changes in the same PR.
- Keep current component structure unless a class modifier is needed.

Phase 3: Workbench surfaces.

- Apply strict design to model/tool menus, provider settings, setup agent, skills modal, right panel, code workspace, files, and tasks.
- Verify hover, active, focus, disabled, empty, loading, error, and streaming states.

Phase 4: Cleanup.

- After visual stabilization, consider extracting presentational components from `App.tsx` into `src/renderer/src/components/*`.
- Do not combine this refactor with token migration unless necessary.

## Acceptance Criteria

Visual QA:

- First screen is a working workspace: sidebar, thread, composer, right panel.
- No landing/hero/generic AI copy.
- Dark/orange system is consistent and readable.
- UI remains compact and Conductor-like at desktop sizes.
- Check empty chat, active chat, streaming, stopped stream, errors, model menu, tool menu, `@` skill picker, provider settings, setup agent, canvas/files/tasks/code.
- Russian and English labels do not clip or overlap.

Accessibility:

- All icon-only buttons have accessible labels.
- `Tab` can reach sidebar, topbar controls, message actions, composer, and right panel.
- `Escape` closes floating menus/modals/drawers.
- `Enter` selects items in model and skill pickers.
- `Shift+Enter` inserts newline in composer.
- Normal text contrast should meet WCAG AA 4.5:1.
- Focus rings are visible.
- Reduced motion preference is honored.

Responsive:

- Packaged app works at current Electron minimum size `960x680`.
- Primary QA widths: `1360x900`, `1440x900`, `1728x1117`.
- Below `1100px`, right panel becomes overlay/full-width without horizontal scroll.
- Below `820px`, sidebar works as drawer with scrim; composer does not cover messages.

Regression commands:

```sh
npm test
npm run build
./scripts/ci.sh
```

Provider smoke if provider/settings flows changed:

```sh
GRACE_PROVIDER_BASE_URL=https://api.example.com/v1 \
GRACE_PROVIDER_API_KEY=... \
npm run smoke:provider
```

Packaged app verification before release:

```sh
npm run dist:mac
VERSION=$(node -p "require('./package.json').version")
codesign --verify --deep --strict --verbose=2 release/mac-arm64/Grace.app
codesign --verify --deep --strict --verbose=2 release/mac/Grace.app
hdiutil verify "release/Grace-${VERSION}-arm64.dmg"
hdiutil verify "release/Grace-${VERSION}-x64.dmg"
```

Packaged smoke:

- Fresh launch: dark/orange UI, no blank white flash, no console crash.
- Create chat, send message, streaming appears, stop works.
- `@open` opens skill picker, arrows/Enter select skill, chip appears.
- Files panel opens, file add/remove works.
- Tasks panel opens, task create/toggle/delete works.
- `Напиши HTML страницу с кнопкой` opens Code workspace and HTML preview renders.
- Settings theme/locale/provider state persists after relaunch.

## Open Product Decisions

- Whether “New Chat” should become “New Workspace”, “New Task”, or remain chat-first for v0.1.
- Whether light theme remains user-facing during strict dark redesign.
- Which incomplete tools should be hidden vs. disabled with status.
- When to add resizable split panes.
- When to replace browser prompt/confirm with custom desktop dialogs.
