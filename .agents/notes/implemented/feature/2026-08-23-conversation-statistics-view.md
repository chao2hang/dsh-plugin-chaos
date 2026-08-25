# Agent Note: conversation statistics view

Status: implemented

English | [中文](2026-08-23-conversation-statistics-view.zh.md)

## Problem

The compact composer statistics line helps scan a completed turn but truncates as a session accumulates timing, throughput, cache, and token values. Conversation inspection needs a stable place for those durable values without crowding the Chat transcript or the Trajectory ledger.

## Decision

The conversation view ring includes a `statistics` entry after Chat and Trajectory. `UsageReport` passes the browser's IANA time zone to the host-owned `usage-report.read` projection of completed provider requests from every readable durable session log. The host reuses a completed report only while persistent-log revisions and local completed-request events are unchanged, and the tab shows its last report for the connected endpoint and viewer zone while it refreshes in the background. Its cards report all-history totals, while its 30-day viewer-local calendar chart retains zero-use dates in neutral gray and stacks real daily tokens by provider/model route. A selected chart date exposes its tokens, request count, and model segments without repeating labels below every bar. The tab refreshes durable data every 30 seconds while visible, on return to the page, and at each local-day boundary. The compact composer line remains the current-session `sessionStats` and `tokenUsage` projection.

## Alternatives considered

**Keep statistics only below the composer.** The single-line format is useful for glanceable status but must ellipsize under limited width and cannot present each figure independently.

**Add statistics to the Trajectory view.** Trajectory owns request-level inspection and timeline controls; combining it with session summary makes that diagnostic view heavier and hides the summary from Chat users.

## Consequences

The tab's report fetches a host-owned all-history fold instead of assigning session totals to a session update time. The fold reads durable `assistant/message.usage` records at their event time and attributes each one to the preceding durable `request/context` provider and model. A usage record without preceding context remains unattributed. The composer retains its existing one-line summary, so users can still see key values while composing.

Costs are not shown because the effective price at request time is not durable. A pricing feature must record the applied price with every completed request rather than applying current pricing to history.
