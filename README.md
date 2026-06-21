# Grace

Grace is an AI application in early setup.

## Development

This repo is prepared for Conductor workspaces, pull requests, GitHub Actions CI, tag-based releases, and environment-based deployments.

Common commands:

```sh
./scripts/setup.sh
./scripts/dev.sh
./scripts/ci.sh
./scripts/release.sh 0.1.0
```

## Delivery

- PRs run CI through `.github/workflows/ci.yml`.
- Tags like `v0.1.0` create GitHub Releases through `.github/workflows/release.yml`.
- Deployments are represented through GitHub Environments in `.github/workflows/deploy.yml`.
- Real deployment provider wiring belongs in `scripts/deploy.sh`.

See [docs/delivery.md](docs/delivery.md) and [docs/architecture.md](docs/architecture.md).
