# Agent Note: Per-model wire-protocol override for pi-ai routes

Status: implemented

English | [中文](2026-09-16-per-model-wire-protocol-override.zh.md)

## Problem

A `llm-pi-ai` provider route names one wire protocol for its entire route, and a hand-declared gateway is configured with one fixed `baseURL`. Real multi-protocol gateways — aggregator endpoints in particular — expose one endpoint that serves several wire formats: some models speak Chat Completions, others Anthropic Messages or Google's Generative Language API. Using those models required splitting the provider into several routes with different `api` values, which duplicates the credential reference and headers, fragments the model directory, and misstates what is physically one endpoint. The composer's capability dialog (chaos-models) could not express the difference either: it edits per-model fields, but protocol lived only at the route.

## Decision

A model entry — a `models[]` item or a `modelOverrides` value — accepts `api`, and the entry wins over the route's field. Resolution layers `entry.api ?? route.api ?? installed catalog protocol ?? the shipped models' shared protocol`, so a hand-declared route may omit the route-level `api` entirely when every entry names its own.

Provider construction follows the resolved model set: a route whose every model keeps its installed catalog protocol still reuses the catalog provider unchanged; a single-protocol route is built exactly as before; a route whose models disagree is built with a per-model dispatch — pi-ai's api-map form — that serves every protocol in the adapter's table and delegates a model that kept its table-external catalog protocol (Bedrock, Vertex, Azure, Codex) to the installed catalog provider. The table itself gains `google-generative-ai`, whose key-header authentication a profile can express; it was previously absent for want of a consumer.

The chaos-models capability dialog gains an API 覆盖 select fed from that vocabulary. Saving writes the model entry's `api` through the same settings path mutation; selecting the default removes the key so the model falls back to the provider's protocol. A protocol the installed build cannot serve is rejected loudly at the settings write by the schema union both levels share.

## Alternatives considered

**One route per protocol.** It works without touching resolution, but it duplicates the credential reference, headers, and probe configuration per copy, fragments one endpoint across several directory entries, and cannot say "same endpoint, one exception model" — the deployment maintains the split by hand forever.

**Model override loses to the route protocol.** Precedence the other way keeps resolution simpler (a route-level `api` already means "replace every catalog model's own"), and it would defeat the primary case: a hand-declared gateway must name a route protocol today, so a model-scoped override that lost to it could never fire.

**Reading the protocol choices from the settings schema union in the dialog** (as the Models settings page does through the settings schema service). Zero-drift by construction, but it couples a feature plugin to the schema envelope's internals and adds a service edge for a list of four stable identifiers; the hardcoded vocabulary mirrors the existing `THINKING_LEVELS` precedent, and a stale entry fails the write instead of mis-serving a request.

## Consequences

One fixed `baseURL` serves a mixed-protocol model directory without route splitting, and the capability dialog covers the protocol choice beside the capacities it already edits. A stale dialog vocabulary is caught at the write rather than silently producing a request the endpoint cannot parse. The cost: a catalog route with one repointed model stops delegating its models to the catalog provider — models keeping a table protocol are now served by the adapter's own construction, which wires the same lazy implementations pi-ai's factories use and preserves the catalog auth, but drops whatever else the catalog provider carries (its dynamic model refresh was already dropped by the reuse path). The catalog.spec suite pins entry-wins precedence, the entry-only hand-declared route, a `modelOverrides` repoint beside kept siblings, catalog delegation through the Bedrock implementation's own error event, and the two-protocol wire path with each protocol's auth header; config.spec pins the schema boundary at both levels, and models.client.spec pins set, clear, and keep on both write paths.
