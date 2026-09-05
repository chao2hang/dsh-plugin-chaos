---
description: "The Chaos composition layer: optional think-tag presentation and archived-session retention rows over the web-app bundle, for users assembling or trimming a Chaos web profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-plugin-chaos

English | [中文](README.zh.md)

## Summary

`dsh-plugin-chaos` is an installable profile layer that adds the optional Chaos plugins to a profile built on the web-app bundle: think-tag presentation and the archived-session retention sweeper. The web-app bundle already contributes the six core Chaos rows — chaos-mobile, chaos-auth, chaos-restart, chaos-models, chaos-retry, and process-control — so this layer adds only what the web-app layer does not ship. Install it with `dsh plugin --profile <name> add` or name it in a profile's `dsh.profile.bundles` list; removing it drops the two optional rows without touching the core set. The package is a patch document plus a dependency declaration, not runtime code: every behavior belongs to the plugin each row names.

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

Add the layer to a profile that already includes `@deepseek-ai/dsh-web-app`; its rows insert on top of that layer.

### Install into a profile

```text
dsh plugin --profile <name> add @deepseek-ai/dsh-plugin-chaos
dsh plugin --profile <name> remove @deepseek-ai/dsh-plugin-chaos
```

The command initializes the profile on first use, forwards to pnpm in the profile directory, then reconciles the `dsh.profile.bundles` list against the installed state: a dependency resolving to a package that declares `dsh.bundle.patch` — this one — joins the layer stack, and removing the dependency takes it back out. A dependency without that declaration stays a plain dependency, and the reconcile warns about it. From a source checkout, pass the package path with a `./` prefix (`dsh plugin --profile <name> add ./packages/extensions/chaos-bundle`) so the launcher anchors it to the invoking directory. In-box bundles such as `@deepseek-ai/dsh-base` resolve from the dsh installation and are never touched by the reconcile.

You can also name the bundle in a profile's `dsh.profile.bundles` list, after `@deepseek-ai/dsh-web-app`:

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-plugin-chaos"]
    }
  }
}
```

### What you get

| Row | Package | What it adds |
|---|---|---|
| `chaos-think-tags` | [chaos-think-tags](../chaos-think-tags/README.md) | Renders assistant think-tag output through the conversation's collapsed reasoning disclosure |
| `chaos-janitor` | [chaos-janitor](../chaos-janitor/README.md) | Deletes archived sessions once their logs fall quiet past `maxArchivedDays` |

The retention knob ships neutral: `maxArchivedDays: 0` disables the sweeper, so deleting anything is an explicit later choice.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle is a static patch document over the web-app layer: one `insert` list of two rows, each with a stable id a later layer or the user's profile `cordis.patch.yml` can address. It mounts no service, emits no event, and holds no state; each row's package owns that row's behavior and invariants. The `package.json` dependency set carries the Chaos plugins, so installing the layer also installs the plugins its rows reference.

### Layer semantics

A patch entry replaces the targeted row's whole `config` rather than merging into it; later bundle layers and the user's patch override rows by id, with the last write winning per row. The two rows here are new inserts against the web-app layer — nothing in this patch disables or rewrites a web-app row.

### Extension points the inserted plugins rely on

The inserted plugins build on generic main-repo seams: chaos-think-tags replaces the keyed assistant renderer in the `conversation.chat.node` slot that the browser conversation package owns, and chaos-janitor reads `sessionPersistence.list()` session headers, the `workspaceRegistry.archivedSessionIds` set, and the `sessions` live-session store. Both are generic extension points, not Chaos-specific hooks.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The bundle substance: the two inserted rows, with per-row rationale as inline comments |
| [`src/index.ts`](src/index.ts) | Package entry; carries no runtime API |
| — | No runtime invariant companion is published; the bundle is a static patch-list carrier that mounts no service and owns no mutable relation to check, and each inserted row's own package carries that row's invariants. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the layer-level contract is not enough.

- [web-app bundle](../../bundle/web-app/README.md) — the layer this bundle builds on and its six core Chaos rows.
- [Archived-session retention sweeper](../chaos-janitor/README.md) — the sweep behavior and its configuration.
- [Think-tag presentation](../chaos-think-tags/README.md) — the renderer the think-tags row mounts.
- [Base bundle](../../bundle/base/README.md) — the shared core layer form and the patch semantics.
- [app-boot profile section](../../boot/app-boot/README.md) — how profiles resolve and stack bundle layers.

-----

<a id="model-experience"></a>
## Model Experience

None, as the bundle is a composition patch layer with no runtime of its own; the plugins it inserts own every model-facing registration.

#### KV Cache effect

The bundle adds no request prefix and sends no provider request; each inserted row's package owns any cache effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits state where the layer's reach ends. They are current package constraints, not a task backlog.

- **Removing this layer does not remove the core Chaos rows** — `chaos-mobile`, `chaos-auth`, `chaos-restart`, `chaos-models`, `chaos-retry`, and `process-control` come from the web-app bundle's patch; only the two optional rows leave with this layer.
- **A later override of one of these rows replaces its whole config** — patch entries do not merge, so an override must restate every setting it wants to keep.
- **The retention knob ships neutral** — `maxArchivedDays: 0` keeps every archived session until a profile layer or user patch sets a positive value.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
