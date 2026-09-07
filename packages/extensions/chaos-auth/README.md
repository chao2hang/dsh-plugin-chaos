---
description: "Remote-access token authentication for the DeepSeek Harness web server: request and WebSocket upgrade guards, a standalone login page, and per-instance browser sessions with sliding idle and absolute lifetime timeouts."
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-auth

English | [中文](README.zh.md)

## Summary

Protect a remotely bound Harness web server with one login token: unauthenticated browsers receive the standalone login page for page requests or a JSON `401` for API requests, and a valid login opens a cookie-backed browser session. Sessions live in process memory with a sliding idle timeout (default 7 days) refreshed on every authenticated request and an absolute lifetime cap (default 30 days). Loopback deployments stay anonymous — the plugin activates only when the web server binds `0.0.0.0` or a `publicUrl` is configured. The login token is resolved through the credentials system, so its value never appears in configuration.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin beside the web server when the composition serves remote clients; it activates by itself only on a `0.0.0.0` bind or with a configured `publicUrl`.

### When to choose it

Choose this plugin when the Web profile binds a non-loopback interface or sits behind a reverse proxy. The Web bundle mounts it by default, and loopback HTTP without either activation condition stays fully anonymous and unguarded.

### Minimal configuration

```yaml
- id: chaos-auth
  name: '@deepseek-ai/dsh-plugin-chaos-auth'
  config:
    idleTimeoutMs: 604800000
    absoluteTimeoutMs: 2592000000
    tokenRef: DSH_AUTH_TOKEN
    publicUrl: ''
```

| Field | Default | Meaning |
|---|---|---|
| `idleTimeoutMs` | `604800000` (7 days) | Sliding idle timeout, refreshed on every authenticated request |
| `absoluteTimeoutMs` | `2592000000` (30 days) | Absolute session lifetime cap; must be >= `idleTimeoutMs`, checked at activation |
| `tokenRef` | `DSH_AUTH_TOKEN` | Credentials reference resolved to the login token at startup |
| `publicUrl` | `''` | Reverse-proxy public URL; an `https://` prefix enables the `Secure` cookie flag, and any non-empty value also activates the guards on loopback |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-plugin-chaos-auth) is the exhaustive source for every accepted field.

### Activation and the token

The plugin requires a current `dsh-host-webserver` build exporting `registerGuard` and `registerUpgradeGuard` and throws at activation on older hosts. The login token is resolved through the credentials system from `tokenRef` at startup; when the reference does not resolve to a non-empty value, the plugin logs a warning and every `POST /auth/login` answers `401`, so an unconfigured token disables login without opening the server.

### Guards and routes

Two guards run before route matching. The request guard passes the public paths (`/auth/login`, `/auth/logout`, `/manifest.webmanifest`, and `/` with a `token` query), validates the session cookie against the store, answers unauthenticated page requests with the login page and API requests with a JSON `401`, and refreshes session activity on every authenticated request. The upgrade guard applies the same session check to WebSocket upgrades and destroys the socket with a `401` response when it fails. `GET /auth/login` serves the standalone login page, `POST /auth/login` compares the submitted token with the resolved value using a constant-time comparison, creates a session, and redirects to the connection layer's authenticated URL; `GET /auth/logout` and `POST /auth/logout` destroy the session, clear the cookie, and redirect to the login page.

### Browser sessions

Sessions live in memory per plugin instance: 256-bit random ids in the `dsh-session` cookie (`HttpOnly`, `SameSite=Strict`, plus `Secure` under HTTPS), a sliding idle timeout refreshed on every authenticated request, an absolute lifetime cap validated at construction, and lazy plus periodic cleanup every 10 minutes. The cookie `Max-Age` is the smaller of the two remaining windows, so the cookie never claims a lifetime the server will not honor.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin is a function plugin over two injected services: `webServer` supplies the guard and route registration seams, and `connection` supplies the authenticated redirect URL. All state lives in one `SessionStore` instance created at activation; the guards, the login and logout routes, and the cleanup interval register through `ctx.effect` and withdraw with the plugin fiber. The login page is standalone static HTML with no application code, served by the plugin itself.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `Config` schema, activation fence, guards, login and logout routes, login page |
| [`src/session-store.ts`](src/session-store.ts) | In-memory session store, timeouts, cookie building and clearing |
| — | No runtime invariant companion is published; the session store is per-plugin-instance with no cross-plugin state, and guard registration is transactional through ctx.effect. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Web server](../../host/webserver/README.md) — the guarded HTTP carrier and its `registerGuard` seam.
- [Credentials](../../credentials/credentials/README.md) — the system that resolves `tokenRef` to the login token.
- [Web app bundle](../../bundle/web-app/README.md) — the composition that mounts this plugin.
- [Connection](../../client/connection/README.md) — the browser transport whose authenticated URL a login redirects to.

-----

<a id="model-experience"></a>
## Model Experience

### Guarded Web-server surface

#### What the model sees

Nothing model-facing. The package registers `registerGuard` and `registerUpgradeGuard` guards, the public `/auth/login` and `/auth/logout` routes, and a per-instance `SessionStore`; it adds no prompt section, tool schema, or session event to any model request.

#### Token effect

Zero. Guard decisions, the login page, and the session cookie are Web-server concerns and contribute no request tokens.

#### KV Cache effect

No effect. The package neither assembles nor sends a provider request, so it cannot change request tokens or KV Cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits are current package constraints, not a task backlog.

- **Loopback stays anonymous** — activation happens only when the web server binds `0.0.0.0` or `publicUrl` is set; loopback HTTP without either remains fully accessible.
- **An unconfigured token disables login** — when `tokenRef` does not resolve to a non-empty value, the plugin logs a warning and every `POST /auth/login` answers `401`.
- **Sessions live only in process memory** — a server restart destroys every active session, and clients must log in again.
- **Older WebServer builds fail at activation** — `apply` throws when `registerGuard` or `registerUpgradeGuard` is missing from `dsh-host-webserver`.
- **The login page is static** — its copy is fixed Chinese HTML (`lang="zh-CN"`), not routed through the locale system.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
