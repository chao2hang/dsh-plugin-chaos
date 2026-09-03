# `@deepseek-ai/dsh-plugin-chaos-auth`

English | [中文](README.zh.md)

Remote access authentication for the DeepSeek Harness web server: request and upgrade guards, a standalone login page, and per-instance browser sessions behind a token.

## Activation

Loopback stays anonymous: `apply` returns without registering anything when the web server does not bind `0.0.0.0` and no `publicUrl` is configured. Otherwise the plugin requires a current `dsh-host-webserver` build exporting `registerGuard` and `registerUpgradeGuard` and throws at activation on older hosts.

The login token is resolved through the credentials system from `tokenRef` (default `DSH_AUTH_TOKEN`) at startup; the token value never appears in configuration.

## Guards

Two guards run before route matching:

- the request guard passes public paths (`/auth/login`, `/auth/logout`, `/manifest.webmanifest`, and `/` with a `token` query), validates the session cookie against the store, answers unauthenticated page requests with the login page and API requests with a JSON `401`, and refreshes session activity on every authenticated request;
- the upgrade guard applies the same session check to WebSocket upgrades and destroys the socket with a `401` response when it fails.

## Routes

- `GET /auth/login` serves a standalone login page with no application code.
- `POST /auth/login` compares the submitted token against the resolved value with a constant-time comparison, creates a session, and redirects to the connection layer's authenticated URL.
- `GET /auth/logout` and `POST /auth/logout` destroy the session, clear the cookie, and redirect to the login page.

## Sessions

Sessions live in memory per plugin instance: 256-bit random IDs in the `dsh-session` cookie (`HttpOnly`, `SameSite=Strict`, `Secure` under HTTPS), a sliding idle timeout (default 7 days) refreshed on every authenticated request, an absolute lifetime cap (default 30 days) validated at construction, and lazy plus periodic cleanup every 10 minutes. The cookie `Max-Age` is the smaller of the two remaining windows.

## Configuration

- `idleTimeoutMs` (default 7 days) and `absoluteTimeoutMs` (default 30 days): the session timeouts; the absolute value must be >= the idle value, checked at activation.
- `tokenRef` (default `DSH_AUTH_TOKEN`): the credentials reference resolved at startup.
- `publicUrl` (default empty): the reverse-proxy public URL; its `https://` prefix enables the `Secure` cookie flag, and a non-empty value also activates the guards on loopback.

## Model Experience

### Guarded Web-server surface

#### What the model sees

Nothing. The package registers `registerGuard` and `registerUpgradeGuard` guards, the public `/auth/login` and `/auth/logout` routes, and a per-instance `SessionStore`; it adds no prompt section, tool schema, or session event to any model request.

#### Token effect

Zero: the guard decisions, the login page, and the session cookie are Web-server concerns and contribute no request tokens.

#### KV Cache effect

No effect. The package neither assembles nor sends a provider request, so it cannot change request tokens or KV Cache reuse.

## Known Limitations and Deferred Work

- **Loopback stays anonymous** — activation only happens when the web server binds `0.0.0.0` or `publicUrl` is set; loopback HTTP without either remains fully accessible.
- **An unconfigured token disables login** — when `tokenRef` does not resolve to a non-empty value, the plugin logs a warning and every `POST /auth/login` answers `401`.
- **Sessions live only in process memory** — a server restart destroys every active session, and clients must log in again.
- **Older WebServer builds fail at activation** — `apply` throws when `registerGuard` or `registerUpgradeGuard` is missing from `dsh-host-webserver`.
- **The login page is static** — its copy is fixed Chinese HTML (`lang="zh-CN"`), not routed through the locale system.

**Runtime invariant:** No companion is published. The session store is per-plugin-instance with no cross-plugin state, and guard registration is transactional through ctx.effect.
