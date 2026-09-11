# Agent Note: chaos-auth dual mode — entry-route gating on the published webserver

Status: implemented

English | [中文](2026-09-07-chaos-auth-route-mode.zh.md)

## Problem

`chaos-auth` supported only the fork `dsh-host-webserver` interception seam (`registerGuard`/`registerUpgradeGuard`) and threw at activation on any host lacking it. The published `dsh-host-webserver` (all of 0.1.2) offers only named routes, per-path upgrade owners, and a single fallback seat — no all-request guard seam. After the global dsh install moved to a published release, the profile's chaos-auth entry failed the whole plugin tree at load.

## Decision

`apply` probes the webserver surface after the activation fence and picks one of two modes:

- **Guard mode** (fork host): unchanged — the request guard and the upgrade guard intercept everything.
- **Route mode** (published host): register one exact `/` route. Unauthenticated browsers get a 302 to `/auth/login`; authenticated ones a 302 to `/index.html` (the SPA fallback owner keeps serving the dist); requests carrying `?token=` are handed to `connection.authorizeIndex` in place at `/` — the only pathname where it consumes the launch token and issues the browser-session cookie (`authorizeIndex` hard-requires `url.pathname === '/'`; redirecting to `/index.html?token=` draws a 401). WebSocket upgrades and `/api` stay protected by client-connection's own channel authentication.

The login/logout routes, `SessionStore`, credential resolution, and activation conditions are fully shared between the modes.

## Alternatives considered

**Claim the fallback seat with a custom static server.** Rejected: frontend-static is mounted programmatically inside `dsh-web-app`'s `ctx.plugin`, cannot be disabled through a profile patch, and the seat collision would fail web-runtime outright.

**Move the passphrase portal to caddy basicauth.** Rejected: it changes the established portal experience (browser-native dialog instead of the custom login page) and requires the user to change caddy configuration.

**Redirect `?token=` to `/index.html?token=`.** Vetoed by `authorizeIndex`'s pathname check (401).

## Consequences

The profile loads completely on a published dsh, and the portal experience (custom login page, passphrase, session cookie) is preserved. The cost: route mode gates only the SPA entry — `/api`, WebSocket upgrades, and static assets keep relying on client-connection authentication and the public dist serving, which matches upstream's own deployment model and is recorded in the README known limitations. Guard-mode coverage is unchanged.

## Testing

`npx vitest run packages/extensions/chaos-auth` — 33/33, with the new `tests/root-route.spec.ts` covering route mode's three behaviors (unauthenticated redirect, launch-token pass-through, authenticated redirect). A real-composition boot on published 0.1.2-rc.1 with the full profile plus a browser end-to-end pass verified portal rendering, passphrase login, the redirect chain, SPA startup, and the Models settings page.
