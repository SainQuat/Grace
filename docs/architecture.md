# Architecture

Grace is at the delivery scaffold stage. The application stack is not fixed yet.

## Current baseline

- `main` is the stable integration branch.
- Feature work happens in short-lived branches and Conductor workspaces.
- Pull requests run CI before merge.
- Tags named `vMAJOR.MINOR.PATCH` create GitHub Releases.
- GitHub Environments represent `staging` and `production` deployments.

## Initial application shape

The default target is an AI application with these boundaries:

- Web app: user interface and authenticated product flows.
- API/server: orchestration, business logic, model calls, and persistence.
- Worker: async AI jobs, scheduled tasks, and background processing when needed.
- Data layer: application database, object storage, and analytics/events.
- Model provider boundary: adapter layer for OpenAI or another provider, with secrets in environment variables.

Keep provider-specific code behind a small interface so model vendors can change without reshaping product code.

## Non-goals for the scaffold

- No cloud provider is hardcoded.
- No framework is assumed before the first app implementation.
- No production secrets belong in git.
