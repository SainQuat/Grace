# Grace

Grace is an AI application in early setup.

## Development

This repo is prepared for Conductor workspaces, pull requests, GitHub Actions CI, tag-based releases, and environment-based deployments.

Stack:

- Electron desktop shell
- React + TypeScript + Vite renderer
- Safe preload IPC bridge for chat streaming
- Local browser storage for v0.1 chat state

Common commands:

```sh
./scripts/setup.sh
./scripts/dev.sh
./scripts/ci.sh
./scripts/release.sh 0.1.0
```

Direct app commands:

```sh
npm run dev
npm run test
npm run build
npm run preview
npm run smoke:provider
```

Custom provider smoke:

```sh
GRACE_PROVIDER_BASE_URL=https://api.example.com/v1 GRACE_PROVIDER_API_KEY=... npm run smoke:provider
```

## Delivery

- PRs run CI through `.github/workflows/ci.yml`.
- Tags like `v0.1.0` create GitHub Releases through `.github/workflows/release.yml`.
- Deployments are represented through GitHub Environments in `.github/workflows/deploy.yml`.
- Real deployment provider wiring belongs in `scripts/deploy.sh`.

See [docs/delivery.md](docs/delivery.md) and [docs/architecture.md](docs/architecture.md).
See [docs/prd-v0.1.md](docs/prd-v0.1.md) for the first product scope.
