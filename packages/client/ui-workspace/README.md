---
description: "Workspace browser and picker for the dsh web client: the grouped and flat session list in sidebar.workspaces with per-account ordering and archives, the debounced content search capped at 20, the page-local hero picker with directory-flow child holes, and the pending-interaction and subagent-lineage row states."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workspace

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-workspace` is the shared Workspace browser and picker plugin: `WorkspaceBrowser` fills the sidebar's `sidebar.workspaces` slot and `WorkspacePicker` fills the page-local Session Intent hero's `conversation.hero.workspace` slot, both using the same Workspace menu and add flow. The browser renders grouped or flat Session rows from the global runtime hooks and owns Workspace add/rename/reorder plus Session reorder, with one browser-persisted Session order per account; a collapsed search overlays it with immediate title matches and a 250 ms debounced Host content search capped at 20 results. The picker adopts exactly one picked directory path per flow through a directory-flow child hole the composed picking package fills, and it waits for the committed Workspace's list projection to refresh before selecting it. Rows carry live pending-interaction classification, swipe-exposed management controls on mobile, hover cards that copy the value the row clips, and blue activity inherited from running subagent descendants. Use it when composing a surface that must list, open, or create Sessions.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Both target slots are declared by other plugins, so `apply` uses `slots.inject()` to register for each declaration lifetime and re-register after a declaring slot is restored.

### Browse and order

A Workspace remembers whether it is closed or showing Sessions; an open Workspace shows five Sessions by default, offers a transient **Show more** control for the remainder, and returns to five after the whole Workspace is closed and reopened. Creating a Session from a Workspace row first opens that group so the new row remains visible when the Session state arrives. Once the Workspace list baseline is ready, browser-persisted expansion and Session-order records retain only current Workspace ids plus Ungrouped and the flat-list account. View options combine grouping with one browser-persisted Session order per account: real Workspaces initialize from `WorkspaceView.sessionIds`, while Ungrouped and the cross-Workspace flat list initialize from recency. **Manual** and **Last updated** apply in either presentation. Entering Last updated performs a complete recency sort and later user prompts or steers promote their Session once, while entering Manual preserves every current position and disables later promotion. Dragging edits the current order in either mode; Manual-mode drags for real Workspaces also update the Host Session account, while Ungrouped and flat-list orders remain browser-local because neither has one Workspace account. Flat rows omit the empty leading status slot because they have no parent hierarchy, but retain it when a Session status is visible. Workspace drag order is Host-durable in either Session order mode.

### Row actions

The Workspace row's Delete action opens a confirmation that states the retention boundary, blocks duplicate submission, and keeps failures open; success removes the group while its Sessions remain under Ungrouped. The Session row's Rename action opens the same browser-owned dialog pattern prefilled with the row's display title: no client-side conflict rule exists (the host normalizes and may reject with `title-invalid`, rendered in the dialog alert), and confirming an unchanged title is deliberately allowed — it pins the current automatic title against regeneration. The Session row's Archive action commits without a confirmation dialog (non-destructive: the log and the workspace accounting slot remain) through `ctx.workspaces.archiveSession`; the row disappears from every grouping surface — workspace groups, Ungrouped, content search, and the flat list — when the archive-set echo lands, and failures are console diagnostics that leave the tree unchanged. A blank New Session row is a pure placeholder: it renders no row menu and no time label (nothing has happened in it yet), so rename, fork, and archive first apply once the first prompt lands. The selected Session row's menu also offers a **Download log** action that hands the session id to the `sessionLogDownload` service when that service is present. The Fork action forks at the source's last completed turn, increments the inherited persisted title on the client, and then opens the child; a trailing ASCII or fullwidth parenthesized number is incremented in the same style, while an unnumbered title gets ` (1)` appended. The source and child always appear as peer rows within a workspace group, with lineage retained only as session data. A fork or rename failure leaves the current selection unchanged; after a rename failure, the created child remains in the list. On a mobile viewport, a deliberate horizontal swipe reveals existing Session management controls instead of relying on the hover-only ellipsis: swipe right for Rename and Fork, or left for Archive. Archive hides the row immediately while its durable registry request completes and restores it if that request fails. A vertical or short gesture leaves the row unchanged, and the swipe never opens a Session; blank New Session placeholders expose none of these controls.

### Search

Collapsed search is one header action beside the view and add actions. In the rail, add and search render as 36px controls on the shell's shared horizontal entry path. Activating search expands the field across the header; an outside click collapses only a query that is empty after trimming — except while the rail search gesture is still in flight (until focus lands in the input after the column slide), so the expanding click cannot dismiss the search it opened — while the clear control always resets and collapses it. A non-blank search query replaces either browsing mode with one flat result list: case-insensitive title and Workspace substring matches appear immediately, while a 250 ms debounced Host request adds ranked current-conversation content matches and snippets. The English search input and its defensive request path remove NUL, cap the query at the wire schema's 500 UTF-16 code units without splitting a surrogate pair, and preserve the existing debounce and cancellation behavior. Each new query aborts the preceding request; a failed content search leaves metadata matches visible with a warning. The list is capped at 20, asks the user to narrow broader queries, and opens the selected Session without clearing the query or jumping to a specific event.

### The workspace picker and directory flow

The picker lists real Host Workspace entities through the global `useWorkspaces` hook. Selecting a Workspace invokes the slot owner's `onPick` callback to retarget the frontend Session object. Distinct canonical paths remain separate id-keyed Workspaces when their basenames and display titles match; the sidebar hover detail shows a POSIX home or descendant as `~` / `~/…` and leaves a Windows path verbatim. Each registration declares a **directory-flow child hole** (`single` kind: `conversation.hero.workspace.directoryFlow` / `sidebar.workspaces.directoryFlow`) that the composed picker package's client half fills with its picking interaction — the [`-native`](../../host/directory-picker-native/README.md) backend's renderless OS-chooser driver today, an in-app browsing dialog under a `-browse` composition. The flat **Add workspace...** action renders only while the surface's hole is occupied (occupancy read per menu render; an empty hole means the composition has no picking affordance — the seam's documented no-flow default, under which the sidebar header drops its add button rather than offering a dead one). This package owns the trigger and the adoption: the occupant reports one picked path per open through the hole's owner conversation (`open`/`busy`/`onPicked`/`onCancel`/`onError`), and the owner adopts it through the object layer, selecting the committed Workspace only after its list projection has refreshed; cancellation is silent, and errors land in the retryable folder dialog whose **Choose again** reopens the flow. Adding has exactly one route: the occupant's own create-folder affordance already covers a brand-new directory, so no separate create-by-name dialog exists. A menu only appears where there is something to choose between — with no Workspace listed, the anchor gesture raises the flow directly instead of a one-row popover, and it waits for the list baseline before treating an empty list as final. The runtime Session and Workspace services own materialization.

### Row state and hover cards

Session rows render the runtime's live `pendingInteraction` classification: approvals report **Waiting for approval**, plan reviews report **Plan awaiting review**, and ordinary questions report **Waiting for answer**. Every pending interaction uses an amber warning dot that takes precedence over the running indicator; ordinary rows repeat the localized status in their hover card, and both ordinary and search-result rows carry the same text as a visually hidden label for assistive technology. Running uses the blue indicator and its hidden label; an idle row leaves the reserved status slot empty. Workspace and Session hover cards copy the value their row clips: activating a Workspace card writes its full directory path, while activating a non-blank Session card writes its full display title. A provisional blank New Session card remains read-only because its localized label is a placeholder rather than session content. The card reports the dictionary-driven copied state only after the browser accepts the clipboard write. The shared sidebar projection hides rows whose durable Session summary has `origin: 'subagent'`; users enter those conversations through the selected parent's subagent header catalog. Each visible ordinary row inherits the blue activity indicator while any descendant reached through uninterrupted subagent-origin lineage is running, and its hover and assistive text report the exact running-descendant count without describing an idle parent as running. Ordinary forks remain visible and terminate this aggregation because lineage alone does not set their origin. Pending user interaction outranks the session's own running state, and either remains the primary row status while descendant activity stays available as a separate hover and assistive status. With neither present, descendant activity outranks the green unviewed-completion reminder; the reminder returns once no descendant is running. The runtime keeps hidden rows available for conversation, title, and addressed transport state.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section adds the state and module map; the observable flows are covered above.

### Design notes

Browser persistence lives in one snapshot store (`stores.ts`) under the `dsh.workspace.view.v5` key plus the flat-list order's own local-storage entry: view options, expansion state, and per-account Session orders survive reloads, while a Workspace id that disappears from the Host list ages out of the record. Search state is deliberately transient — a collapsed search keeps nothing, and opening a result does not clear the query. Subagent lineage aggregation is a pure index (`subagent-lineage.ts`) over the runtime's lineage facts, so the row projection stays free of traversal. The `ctx.uiWorkspace` verbs (`navigation.ts` — `connectWorkspace`, `startSession`, `archiveSession`, `pickDirectory`, `listDirectory`, `createDirectory`) are thin inject callbacks over the object layer, so components never touch a service. Both slots are declared by other plugins; `apply` uses `slots.inject()` so each registration lives exactly as long as the declaring slot's declaration, including re-registration after a redeclaration.

### Source map

| File | Role |
|---|---|
| [`src/client/rows/WorkspaceBrowser.tsx`](src/client/rows/WorkspaceBrowser.tsx) | The grouped/flat list, search, view options, and row actions |
| [`src/client/rows/Rows.tsx`](src/client/rows/Rows.tsx) | Session and Workspace row presentation, swipe, hover cards |
| [`src/client/contract/slots.ts`](src/client/contract/slots.ts) | The directory-flow child-hole owner conversation types |
| [`src/client/stores.ts`](src/client/stores.ts) | The `dsh.workspace.view.v5` browser-persistence store |
| [`src/client/subagent-lineage.ts`](src/client/subagent-lineage.ts) | The running-descendant index behind inherited activity |
| [`src/client/navigation.ts`](src/client/navigation.ts) | The `ctx.uiWorkspace` verbs over the object layer |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the browser contract is not enough.

- [workspace-controller](../../api/workspace-controller/README.md) — the Host RPC behind `ctx.workspaces`.
- [ui-sidebar](../ui-sidebar/README.md) — the navigation column whose workspace seat this browser fills.
- [ui-conversation](../ui-conversation/README.md) — the page-local hero seat this picker fills.
- [directory-picker-native](../../host/directory-picker-native/README.md) — the OS-chooser driver occupying the directory-flow hole.
- [Native workspace directory picker](../../../.agents/notes/implemented/feature/2026-07-27-native-workspace-directory-picker.md) — the flow design.

-----

<a id="model-experience"></a>
## Model Experience

None, as the picker is browser chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the browser and picker surfaces do not attempt; they are current package constraints.

- **No fuzzy content search or event deep links** — the content backend uses literal token/phrase matching, and selecting a result opens the Session rather than the matching event.
- **No Session deletion or unarchive control** — sessions can be archived, but archived sessions have no viewing or unarchive surface, and Workspace registration deletion does not delete Sessions.
- **Pending user interaction is not aggregated into collapsed groups** — a waiting row inside a collapsed group lights no group-header indicator and becomes visible only after that group is expanded.
- **Native folder selection depends on the local Host carrier** — under the `-native` composition, in-process or remote browser deployments cannot open a local operating-system dialog; remote-capable picking is the `-browse` composition's in-app flow.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. A pure-consumer plugin registering presentational components into two host-declared slots plus its locale dictionaries — its inject face is stateless RPC wrappers plus a create-and-open call; it emits no cordis events and owns no cross-plugin mutable state.
