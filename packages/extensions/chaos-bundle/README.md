# `@deepseek-ai/dsh-plugin-chaos`

Chaos plugin bundle: composes all chaos plugins over the web-app layer.

## Composition

The bundle's `cordis.patch.yml` inserts five plugin rows:

| Row | Package | Module | Purpose |
|---|---|---|---|
| `chaos-mobile` | `dsh-plugin-chaos-mobile` | A | Mobile adaptation: drawer sidebar, touch controls, bottom sheets |
| `chaos-auth` | `dsh-plugin-chaos-auth` | B | Remote access auth: token login, sessions, request guards |
| `chaos-restart` | `dsh-plugin-chaos-restart` | C | Server self-restart: process replacement RPC |
| `chaos-models` | `dsh-plugin-chaos-models` | D | Model selection UX: cache, virtual scroll |
| `process-control` | `dsh-process-control` | C | ProcessControl service (canRestart + restart) |

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
