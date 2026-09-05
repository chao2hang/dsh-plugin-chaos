---
description: "Settings shell and product onboarding for the dsh web client: the sidebar settings trigger and dialog panel over the settings.section and settings.onboarding ledgers, the ownerless General section with its settings.general.item list, the loopback-only open-configuration-file action, and the durable ui-onboarding settings namespace."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-general

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-settings-general` is the settings shell: it occupies `sidebar.settings` with the trigger chrome and a settings panel portaled to the document body (mobile presentation turns that panel into a full-width page below the persistent navigation bar), and projects the `settings.section` ledger into the navigation. It registers everything on the Settings pages that belongs to no single feature — the trigger/header/close chrome content, the local configuration-file action, the General section and its `settings.general.item` list, and the `settings` dictionaries — while feature-owned rows, sections, and onboarding steps stay with their feature packages. The `settings.onboarding` ledger projects in ascending order and mounts exactly one step at a time; the active registrant receives its id, `complete()`, and `openSection(id)`, and registrants own durable completion, copy, and their visible wrapper. The Host half registers the `ui-onboarding` user-settings namespace that the welcome step persists through, so the shell itself stays policy-free. Use it when composing a feature into the Settings pages or the first-run flow.

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

### The settings shell seats

The shell occupies `sidebar.settings` — the slot types it renders into belong to ui-settings, the settings domain base; only the shell's own contract types live here, because they reference ui-sidebar's slot type and the base layer must depend on no `ui-*` package. The trigger row also hosts the connection indicator beside the trigger button, with its recovery confirmation timed after a reconnect. The panel mounts only while open and returns focus to the trigger button after the close commit.

### Section navigation

The `settings.section` ledger drives the navigation rows: a feature plugin contributes a section with its id, localized title, and component, and the shell renders nav plus content with one active section at a time. Nav labels may be locale-following thunks, so the nav projection resolves them through `resolveSlotLabel` and re-renders on the section ledger bump or the locale revision (an optional `ctx.get('locale')` read; no hard locale dependency). The General section the shell registers itself is ownerless by construction: its rows come from the `settings.general.item` list, so each row appears only when its owning feature plugin is mounted.

### Onboarding flow

The shell ships no onboarding copy of its own — all text arrives from registrants. The `settings.onboarding` ledger projects in ascending order and mounts exactly one step at a time, only while the session phase is ready and no concrete session is current. Visible steps own their dialog chrome and app-root `inert` lifecycle; a mounted step still resolving private facts renders null, so nothing paints or blocks while it decides. The active registrant receives its id, `complete()`, and an `openSection(id)` callback; completing or skipping transfers ownership to the next entry. Registrants own durable completion, capability readiness, copy, mutations, and their visible wrapper, so independently registered flows cannot stack and the shell does not become a second configuration fact source.

### Open the configuration file

A loopback browser loads the provider's `hasDocument` capability through `settings.describe` and renders **Open configuration file** only when the Host confirms that a provider-owned local document can be prepared. The action sends the pathless, loopback-only `settings.openDocument` request; the Host resolves the provider path again, materializes an absent document, and hands it to a native text editor (`open -t` on macOS, bypassing a browser file association; the desktop file association on Linux and Windows; Windows association after `wslpath -w` translation on WSL). Open failures keep the action available and render a localized error. Reopening the dialog or reconnecting refreshes availability after a transient read failure or Host topology change. Remote browsers never register the action and never issue the privileged settings read.

The Host half registers `ui-onboarding` in the user-settings seam. The welcome step contributed by `ui-settings-models` reads and writes its `welcomeNoticeVersion` through the existing public settings boundary; the shell itself remains policy-free.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section adds the module map; the observable seats and flows are covered above.

### Design notes

The SettingsRoot consumer derives its props from the standard four shares over the `sidebar.settings` registration: framework hooks (`useSessions` for onboarding activity, the section and onboarding ledger stores, the connection state), `renderSlot` for the chrome content and the active onboarding step, and the trigger chrome's own slot. The completed-step set is component state — durable completion belongs to each registrant (the welcome notice persists its `welcomeNoticeVersion`), and the set resets when onboarding deactivates. `settings-document-store.ts` keeps a write-through cache of settings documents: reads go through the store's cached snapshot, a save writes through to `SettingsDocumentSave` and follows the resulting hot reload, so the panel never edits a stale document after the Host accepts a write.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | The registrations: chrome content, dictionaries, General section, document action |
| [`src/client/SettingsRoot.tsx`](src/client/SettingsRoot.tsx) | The trigger row, panel, and onboarding coordinator |
| [`src/client/shell-contract.ts`](src/client/shell-contract.ts) | The shell's own slot and store contract types |
| [`src/client/settings-document-store.ts`](src/client/settings-document-store.ts) | The write-through settings-document cache |
| [`src/index.ts`](src/index.ts) | The Host half: the `ui-onboarding` settings namespace |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the shell contract is not enough.

- [ui-settings](../ui-settings/README.md) — the settings domain base that owns the slot types.
- [ui-settings-models](../ui-settings-models/README.md) — the Models section and the welcome-step registrant.
- [ui-sidebar](../ui-sidebar/README.md) — the navigation column whose settings seat this shell occupies.
- [settings](../../settings/settings/README.md) — the user-settings capability behind `settings.describe` and `settings.openDocument`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the plugin renders browser settings UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the shell itself provides versus what features must supply; they are current package constraints.

- **The General section has no built-in rows** — each row appears only when its owning feature plugin is mounted; the shell cannot fill the section alone.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The settings seam validates and publishes the durable onboarding section, while slot conflicts fail loud in the slot core. The local document action is browser state over typed RPC responses and is covered by store/component tests rather than a Cordis runtime relationship.
