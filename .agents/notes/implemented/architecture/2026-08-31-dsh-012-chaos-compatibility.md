# Agent Note: dsh 0.1.2 client compatibility adapters

Status: implemented

## Problem

The Chaos extensions were written against an older dsh browser and web-server surface. The installed dsh 0.1.2 client exposes settings through `ctx.remote.settings`, while the extension still depended on the legacy connection API. The current web server does not expose the newer request-guard methods, and the web client composition does not provide `conversationEvents`.

## Decision

Use the current settings remote for reads and writes while retaining the existing component API through a narrowly scoped adapter. Keep the session API from the connection handle because the current runtime remote is not the session service. Treat `conversationEvents` as optional so the retry dock remains usable when crash-recovery event registration is unavailable. Detect missing web-server guard methods before mounting authentication, preserving startup instead of calling unsupported methods.

## Consequences

The model-capability dialog uses the current unary settings remote and preserves revision-aware writes. Retry remains available on dsh versions without the event registry, but its interrupted-turn node is not registered there. Authentication requires a dsh web server that implements both guard methods; older servers log a warning and continue without auth rather than crashing the web process.

Focused tests and package bundles cover the changed modules. Full repository typecheck remains outside this change because the checkout has pre-existing missing generated remote artifacts.
