# Grace

Grace is a local-first desktop AI workspace for chat, provider routing, agent steps, code artifacts, and MCP-ready tool configuration.

## Development

This repo is prepared for Conductor workspaces, pull requests, GitHub Actions CI, tag-based releases, and environment-based deployments.

Stack:

- Electron desktop shell
- React + TypeScript + Vite renderer
- Safe preload IPC bridge for chat streaming
- Local-first desktop state with secure main-process credential storage

Common commands:

```sh
./scripts/setup.sh
./scripts/dev.sh
./scripts/ci.sh
./scripts/release.sh 1.0.0
```

Direct app commands:

```sh
npm run dev
npm run test
npm run build
npm run dist:mac
npm run preview
npm run smoke:provider
```

Custom provider smoke:

```sh
GRACE_PROVIDER_BASE_URL=https://api.example.com/v1 GRACE_PROVIDER_API_KEY=... npm run smoke:provider
```

## Delivery

- PRs run CI through `.github/workflows/ci.yml`.
- Tags like `v1.0.0` create GitHub Releases through `.github/workflows/release.yml`.
- GitHub Releases include unsigned macOS `.dmg` installers.
- Deployments are represented through GitHub Environments in `.github/workflows/deploy.yml`.
- Real deployment provider wiring belongs in `scripts/deploy.sh`.

See [docs/delivery.md](docs/delivery.md) and [docs/architecture.md](docs/architecture.md).
See [docs/prd-v0.1.md](docs/prd-v0.1.md) for the first product scope.
See [DESIGN.md](DESIGN.md) for the strict Conductor-like design brief.
