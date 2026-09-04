# `@deepseek-ai/dsh-plugin-chaos`

English | [中文](README.zh.md)

Chaos plugin bundle: a composition layer over the web-app layer that declares the chaos plugin set as package dependencies and inserts the optional plugin rows.

## Composition

The web-app bundle already inserts `chaos-mobile`, `chaos-auth`, `chaos-restart`, `chaos-models`, `chaos-retry`, and `process-control`. This bundle's `cordis.patch.yml` adds four optional rows:

| Row | Package | Purpose |
|---|---|---|
| `chaos-think-tags` | `@deepseek-ai/dsh-plugin-chaos-think-tags` | Render assistant think-tag output through the conversation reasoning disclosure |
| `chaos-sandbox-guidance` | `@deepseek-ai/dsh-plugin-chaos-sandbox-guidance` | Runtime guidance preventing redundant sandbox escalation arguments |
| `chaos-upload` | `@deepseek-ai/dsh-plugin-chaos-upload` | Workspace document upload behind the mobile attachment chooser; stores files under `<workspace>/uploads/` and marks `@uploads/...` references |
| `chaos-janitor` | `@deepseek-ai/dsh-plugin-chaos-janitor` | Retention sweeper: deletes archived sessions once their log has been quiet past `maxArchivedDays` (default 0 keeps them) |

## Usage

Add the bundle to a profile's bundles list to install the chaos plugin set as its dependencies and insert the optional plugin rows:

```yaml
# In the profile's bundles list:
- '@deepseek-ai/dsh-plugin-chaos'
```

Or add individual plugins in your own patch layer.

## Configuration

The auth plugin reads the token from the credentials system (environment variable `DSH_AUTH_TOKEN` by default). Set it in `.env` or the shell environment before starting the server:

```sh
export DSH_AUTH_TOKEN="your-secret-token"
dsh --profile web --host 0.0.0.0
```

## Main-repo Extension Points

This bundle relies on four generic extension points opened in the main repo:

1. **WebServer guards** (`dsh-host-webserver`): `registerGuard`, `registerUpgradeGuard`, and TLS config. The auth plugin requires a dsh build that exports both Guard APIs; older WebServer builds fail during auth activation.
2. **ConnectionHandle.authenticated** (`dsh-client-connection`): allows authenticated remote sessions to access settings/credentials.
3. **ProcessControl service** (`dsh-process-control`): `canRestart` and `restart()` for process replacement.
4. **LlmModelInfo extensions** (`dsh-llm`): `contextWindow`, `maxOutput`, `capabilitiesEditable` fields.

All are designed as generic extension points, not specific to this bundle.

## Model Experience

None, as the package is a composition patch with no runtime of its own; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Auth plugin integration**: the auth plugin requires the `credentials` service to resolve the token; a composition without it disables login.
- **Restart on Electron**: the ProcessControl service spawns a successor via `process.execPath`; an Electron build may need a different launch mechanism.

**Runtime invariant:** No companion is published. The package is a composition patch (cordis.patch.yml) and holds no runtime registrations, services, or mutable state of its own.
