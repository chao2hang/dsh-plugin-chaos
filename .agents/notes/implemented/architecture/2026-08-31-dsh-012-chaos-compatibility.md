# Agent Note: dsh 0.1.2 client compatibility adapters

Status: implemented

English | [中文](2026-08-31-dsh-012-chaos-compatibility.zh.md)

## Problem

The Chaos extensions were written against an older dsh browser and web-server surface. The installed dsh 0.1.2 client exposes settings through `ctx.remote.settings`, while the extension still depended on the legacy connection API, and the current web server does not expose the newer request-guard methods.

## Decision

Use the current settings remote for reads and writes while retaining the existing component API through a narrowly scoped adapter, and read the model catalog through the session remote because the runtime remote is not the session service. The retry dock derives its abnormal-end state from the session snapshot, so no crash-recovery event registry is required. Authentication requires both web-server guard methods up front and throws at activation when they are absent.

## Alternatives considered

**Fork the conversation and settings surfaces.** Rejected: duplicating upstream UI would carry every upstream fix into the fork; the adapter keeps one component contract over the installed runtime.

**Keep tolerating missing guard methods at runtime.** Rejected: warn-and-continue left a protected deployment silently unauthenticated; failing at activation names the stale host immediately.

## Consequences

The model-capability dialog uses the current unary settings remote and preserves revision-aware writes. The retry dock works on every dsh build without an event registry. Authentication requires a dsh web server that implements both guard methods and fails activation on older hosts. Focused tests and package bundles cover the changed modules.
