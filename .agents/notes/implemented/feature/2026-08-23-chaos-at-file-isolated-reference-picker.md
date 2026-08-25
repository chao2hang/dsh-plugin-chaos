# Agent Note: Chaos-owned workspace reference picker

Status: implemented

English | [中文](2026-08-23-chaos-at-file-isolated-reference-picker.zh.md)

## Problem

The Web bundle already provides a combined `@file` and `@session` reference source. The Chaos profile needs the full dsh-at-file interaction: a bounded filesystem index, folder navigation, file-name filters, a reference dock, paste handling, and an existence-only marker before the model step. Registering both sources produces duplicate file candidates and two filesystem indexes.

## Decision

`@deepseek-ai/dsh-plugin-chaos-at-file` owns the Chaos profile's file-reference interaction. The Chaos bundle disables `ui-reference` and mounts this plugin as `chaos-at-file`.

The package keeps its Host and Client TypeScript programs separate. The Host service registers its narrowly scoped Typert invocation directly; the Client mounts that contribution only for workspace search. This avoids coupling the Host TypeScript program to the Web Client's Cordis context declarations.

The Host confirms each relative `@path` at `agent/pre-step` and appends one `workspace-reference` user message containing only the path and file or directory kind. The agent loop logs that message with the other pre-step messages, so replay reconstructs the model-visible marker. The browser never receives file content from the index request.

The narrow-screen stylesheet constrains the picker to the visual viewport, expands reference chips to composer width, and raises interactive controls to mobile touch-target sizes.

## Alternatives considered

**Reuse the built-in `ui-reference` source.** It avoids a second picker but lacks the filter settings, reference dock, exact ranking, folder navigation, and per-reference marker required by the requested dsh-at-file behavior.

**Leave both `@` sources active.** This would show duplicate file candidates and duplicate filesystem work for every picker request.

**Add a private HTTP settings and search API.** Harness settings scopes and Typert Remote already provide lifecycle ownership, conflict handling, cancellation, and browser mounting. A private route would duplicate them.

## Consequences

Chaos profiles do not provide `@session` completion while this bundle is active because the combined source is disabled with its file half. A later session-reference source may restore it without re-enabling `ui-reference`.

The reference marker proves existence at step preparation, not continued access by a later tool call. Deployments must align the Host workspace index with the filesystem namespace exposed to the model.
