# `@deepseek-ai/dsh-plugin-chaos`

English | [中文](README.zh.md)

Chaos plugin bundle: composes all chaos plugins over the web-app layer.

## Composition

The bundle's `cordis.patch.yml` inserts these plugin rows (the web-app bundle already inserts chaos-mobile, chaos-auth, chaos-restart, chaos-models, chaos-retry, and process-control):

| Row | Package | Purpose |
|---|---|---|
| `chaos-think-tags` | `dsh-plugin-chaos-think-tags` | Optional think-tag renderer |
| `chaos-janitor` | `dsh-plugin-chaos-janitor` | Retention sweeper: deletes archived sessions once their log has been quiet past `maxArchivedDays` (default 0 keeps them) |

## Usage

Add the bundle to a profile to enable all chaos plugins:

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

This bundle relies on three generic extension points opened in the main repo:

1. **WebServer guards** (`dsh-host-webserver`): `registerGuard`, `registerUpgradeGuard`, and TLS config. The auth plugin requires a dsh build that exports both Guard APIs; older WebServer builds fail during auth activation.
2. **ConnectionHandle.authenticated** (`dsh-client-connection`): allows authenticated remote sessions to access settings/credentials.
3. **ProcessControl service** (`dsh-process-control`): `canRestart` and `restart()` for process replacement.
4. **LlmModelInfo extensions** (`dsh-llm`): `contextWindow`, `maxOutput`, `capabilitiesEditable` fields.

All are designed as generic extension points, not specific to this bundle.

## Known Limitations and Deferred Work

- **Auth plugin integration**: the auth plugin requires the `credentials` service to resolve the token; a composition without it disables login.
- **Restart on Electron**: the ProcessControl service spawns a successor via `process.execPath`; an Electron build may need a different launch mechanism.

No runtime invariant companion is published; the bundle is a distribution format for config rows and owns no runtime code.
