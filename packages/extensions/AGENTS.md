# AGENTS.md — Chaos extensions

These rules supplement the repository and package conventions for `packages/extensions/chaos-*`.

## Cordis service injection

- **Declare every service before property access.** If plugin code reads `ctx.<service>` or calls a helper reached through that property, add the exact service name to the plugin's `inject` export or `static.inject` list. This includes timer helpers: code that calls `ctx.interval()` or `ctx.timeout()` must declare `timer`.
- **Keep type augmentation beside the declaration.** Add the corresponding type-only import when the service is supplied by a Cordis plugin, for example `import type {} from '@deepseek-ai/cordis-plugin-timer'`. The type import does not replace the runtime `inject` entry.
- **Use `ctx.get(name)` for optional services.** Do not access optional services through `ctx.<name>`; the property proxy is valid only for declared, required injections. Handle an absent optional service explicitly at the `ctx.get(name)` call site.
- **Check new service access in a Loader boot.** Unit tests for pure helpers do not exercise Cordis injection. Any plugin that adds a `ctx` service access must include or run a real Loader/profile startup check that loads the plugin with its declared providers.

## Timer lifecycle

- Register intervals and delayed startup work through the injected `timer` service so Cordis disposes them with the plugin fiber. Keep the callback inside the plugin's lifecycle and contain asynchronous errors in the callback.
- When a feature is disabled by configuration, return before registering timers. Configuration defaults must not schedule background work unintentionally.

## Change checklist

Before considering a Chaos plugin change complete:

1. Search the changed plugin for every `ctx.<name>` access and update `inject` for each required service.
2. Confirm optional services use `ctx.get(name)` and have an explicit absent-service path.
3. Rebuild the affected package and its bundle when the profile loads built artifacts.
4. Start the Web profile and confirm the service remains active after the Loader has applied the full plugin tree.
5. Keep the plugin enabled during verification; fix its wiring instead of masking the failure by removing the plugin.
