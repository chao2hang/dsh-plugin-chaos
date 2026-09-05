# Agent Note: Bootstrap Typert before the Host compile on a clean tree

Status: implemented

English | [中文](2026-09-05-bootstrap-typert-before-host-tsc.zh.md)

> The [TSC-first build note](../process/2026-06-17-ts-build-config.md) owns the compiler ownership; the [API Remotes build note](../process/2026-08-08-api-remotes-generated-contract-build.md) defines the Host-generates-Client-contracts order. This note covers the clean-tree gap in that order and the subpath alias rule that guards it.

## Problem

`tsc -b tsconfig.host.json` builds Client leaf projects as well as Host ones: package host leaves reference dependency solution roots, and a solution root references both faces. Client leaves import generated `*/remote` contracts, whose declarations (`lib/typert.remote-client.d.ts`) only the Host tsdown pass emits — after `tsc`. On any tree without stale build output this is a cycle: the compile that must run first needs artifacts the phase after it produces. Every `pnpm run test`-first and `build:official`-first CI run on a clean checkout failed with `TS2307: Cannot find module '…/remote'`.

A second, smaller gap had the same shape: `packages/api/session-controller/src/commands.ts` imports `@deepseek-ai/dsh-client-file-upload/types`, whose specifier had no `tsconfig.base.json` paths entry, so on a clean tree it resolved to the emitted `lib/types/types.d.ts` instead of `src/types.ts`.

## Decision

- `build:lib:host` runs `node --import tsx/esm scripts/bootstrap-typert.ts` before `tsc -b tsconfig.host.json`. The bootstrap script already existed — it emits the typert face artifacts and remote-client files from source through `WorkspaceTypertGenerator`, without a tsdown run — but nothing invoked it. Wiring it into the first build phase gives every later phase its generated contracts; the tsdown pass then regenerates the same artifacts idempotently.
- `@deepseek-ai/dsh-client-file-upload/types` gains the source-plane paths entry mapping to `packages/client/file-upload/src/types.ts`, matching the `dsh-api-remotes/types` precedent. Workspace subpath imports that resolve through `paths` keep static analysis working on a clean tree; those that fall through to `exports` and build output reintroduce the cycle elsewhere.
- `vendor/cordis` and `vendor/cosmokit` gain the per-package `tsdown.config.ts` override (the `schemastery`/`logger-console` pattern) so the workspace tsdown pass writes their `lib/index.js` runtime bundle. Without it the exports map's default target stays absent and the web build dies resolving `@deepseek-ai/cordis` through Vite's commonjs resolver — the same clean-tree failure the sandbox workflow reported after the lib phases went green.

## Alternatives considered

- Skipping the bootstrap when artifacts look fresh: rejected because a stale stamp is exactly how the clean-tree cycle returns, and the check would cost more trust than the ten seconds it saves.
- Sweeping every package host leaf to reference dependency host leaves explicitly (never solution roots): rejected as a repo-wide churn of hundreds of reference entries to work around one ordering gap; the solution-root convention is upstream's and works once contracts exist.
- Mapping `*/remote` specifiers to source through `paths`: impossible — the remote-client declarations are generated artifacts with no source file to map to.

## Consequences

The bootstrap generator runs once more per host build (about ten seconds on this machine) even when artifacts are current. What that buys is the ordering contract: no compile phase may precede contract generation on a clean tree, so `pnpm run test` and `build:official` succeed from any checkout state, and the tsdown pass still overwrites the same bytes idempotently.

## Testing

- From `pnpm run clean`, `pnpm run build:lib:host` and then `pnpm run build:official` complete with no `TS2307` on the `*/remote` or `file-upload/types` specifiers.
- `npx vitest run scripts/gen-tsconfig-paths.spec.ts` stays green: every workspace package keeps an alias after removing the deleted chaos package entries.
