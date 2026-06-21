# Delivery Workflow

This repo uses a simple trunk-based release flow.

## Branches

- `main`: stable branch. Merge only through pull requests.
- `feat/<name>`: product features.
- `fix/<name>`: bug fixes.
- `release/vX.Y.Z`: optional stabilization branch when a release needs manual hardening.

In Conductor, each workspace is a separate git worktree and branch. Treat one workspace as one focused task.

## Pull requests

Every PR should include:

- Clear summary of behavior changed.
- Validation commands run locally.
- Deployment notes when the change affects runtime config, migrations, or external services.

CI runs on every PR and every push to `main`.

## Releases

Releases are tag-driven:

```sh
./scripts/release.sh 0.1.0
```

That creates and pushes `v0.1.0`. The `Release` GitHub Actions workflow then creates a GitHub Release with generated notes.

Use semantic versioning:

- `v0.1.0`: first MVP release.
- `v0.2.0`: new product capability.
- `v0.2.1`: bug fix.

## Deployments

The `Deploy` workflow supports:

- Push to `main`: staging deployment.
- Published GitHub Release: production deployment.
- Manual dispatch: choose `staging` or `production`.

Before real deploys, configure environment secret `DEPLOY_WEBHOOK_URL` in GitHub:

- Repository Settings -> Environments -> `staging` -> Secrets.
- Repository Settings -> Environments -> `production` -> Secrets.

If `DEPLOY_WEBHOOK_URL` is not set, the deploy script exits successfully and prints a no-op message. Replace `scripts/deploy.sh` with provider-specific deploy commands once the hosting platform is chosen.

## Recommended GitHub settings

Enable branch protection for `main`:

- Require pull request before merge.
- Require status checks to pass.
- Require branch to be up to date before merge.
- Restrict force pushes.
- Delete head branches after merge.

For `production`, require manual approval in GitHub Environments once real users depend on the app.
