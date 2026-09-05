# Chaos fork host services

English | [中文](chaos.zh.md)

Host-side services the Chaos profile adds beyond upstream: process restart and usage-report reads. Each service's contract is owned by its package README; this page carries the generated Cordis API surface.

`ctx.processControl` ([process-control](../../packages/boot/process-control/README.md)) hands the running command line to a detached successor process. `ctx.usageReportController` ([session-controller](../../packages/api/session-controller/README.md)) reads the durable token-usage report of a session.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxprocesscontrol--iprocesscontrol"></a>

### `ctx.processControl` — `IProcessControl`

The outward process-control face (`ctx.processControl`).

```ts cordis-catalog
/**
 * Dispose the current application tree, then spawn a detached successor with
 * the same command line. The successor inherits the same port and configuration.
 * @returns `{ ok: true }` when the successor was spawned after teardown, or
 * `{ ok: false, reason }` when it cannot.
 */
restart(): Promise<RestartResult>
```

Source: [`packages/boot/process-control/src/index.ts`](../../packages/boot/process-control/src/index.ts)

<a id="ctxusagereportcontroller--usagereportcontroller"></a>

### `ctx.usageReportController` — `UsageReportController`

Host service backing the generated `ctx.remote['usage-report']` namespace. Every read stays cold: it folds the logical session corpus through the Session query seam and never activates an Agent. Completed response usage observed live, and every stored-log revision, invalidate the per-zone cache without retaining a report that raced either change.

```ts cordis-catalog
/**
 * Reconstruct per-request model metrics from the durable session logs.
 * @param request - viewer calendar zone for the daily buckets.
 * @param signal - caller cancellation for corpus listing and durable reads.
 * @returns usage totals grouped by viewer calendar day and recorded model route.
 * @throws RemoteError when the zone is unsupported, the read is cancelled, or the corpus cannot be folded.
 */
@Remote async read(request: UsageReportReadRequest, signal: AbortSignal): Promise<UsageReport>
```

Source: [`packages/api/session-controller/src/usage-report.ts`](../../packages/api/session-controller/src/usage-report.ts)
<!-- END GENERATED cordis-surface -->
