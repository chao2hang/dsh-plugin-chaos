# Agent Note: Preserve capability and ownership checks across Web remediation

Status: implemented

English | [中文](2026-08-24-web-remediation-capability-ownership.zh.md)

## Problem

Several Web paths accepted a weaker condition than the operation they exposed. Restart acknowledged before process control settled, an authenticated remote WebSocket upgrade was treated as untrusted, and file routes trusted lexical workspace paths. Client controls also assumed unavailable capabilities, duplicated sheet dismissal ownership, or wrote local defaults over provider-catalog model capabilities.

## Decision

The affected Host and client paths now enforce their deciding conditions at the operation that owns them. Restart reports success only after process control succeeds. Event WebSocket upgrades admit either a trusted API request or an authenticated request. Desktop workspace file and Git operations resolve existing targets and new-target parents beneath the session working directory before use.

Client capability editors retain the initial effective values and write only fields the user changes, preserving catalog-provided image input and reasoning configuration. Sheet menus navigate nested entries within the sheet, and sheet mode has one Escape close owner. Optional client services and native document actions are reached only when their corresponding capability is available.

## Alternatives considered

**Retain optimistic acknowledgements or lexical path checks.** Rejected because callers could observe success before the owned operation settled, and symlinks could redirect a lexically valid workspace path outside its allowed directory.

**Write a complete model capability object for every save.** Rejected because a local override cannot distinguish an inherited provider capability from an explicit negative value; untouched fields must remain absent.

**Keep desktop hover submenus in a mobile sheet.** Rejected because their positioned child list is outside the sheet and hover cannot provide a touch interaction path.

## Consequences

Remote authenticated clients can maintain event connections without expanding the trusted-host rule. Workspace file access follows real filesystem targets rather than request spelling. Catalog capabilities remain provider-owned unless the user explicitly overrides them. Mobile sheet menus expose nested choices through a reachable drill-in view, and Escape dismisses each sheet surface once.

Focused Host, extension, and client tests cover the changed paths; the client catalog is regenerated and checked. The API proxy now compiles its browser-safe API and fetch client through a dedicated client project, keeping Host Context declarations out of the client aggregate. Other pre-existing client test and Web e2e project errors remain outside this remediation.
