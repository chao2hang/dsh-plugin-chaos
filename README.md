# dsh-plugin-chaos

Chaos plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Installing the bundle is not enough: the published `dsh-host-webserver` has no `registerGuard` or `registerUpgradeGuard`, and `chaos-auth` requires both. A stock `dsh` must be patched to expose them before this plugin can run.

The bundle inserts eight rows after `@deepseek-ai/dsh-web-app`: process control, mobile layout, remote login, server restart, model capability controls, conversation retry, think-tag presentation, and archived-session retention. Removing the bundle removes all eight.

## Install

From a checkout of this repository, against a running dsh `0.2.1-alpha.2`:

```sh
pnpm install
dsh plugin --profile web add ./packages/chaos-bundle
```

`pnpm install` runs `prepare`, which builds every package. A git install does the same after its build script is allowed:

```sh
dsh plugin --profile web add github:chao2hang/dsh-plugin-chaos#<commit>
```

The first attempt stops until the profile's `pnpm-workspace.yaml` allows the build:

```yaml
allowBuilds:
  dsh-plugin-chaos: true
```

Re-run the `add` after that. Allowing the script executes this repository's code at install time.

## Develop

```sh
pnpm install
pnpm run build
pnpm run typecheck
```

Typecheck resolves `@deepseek-ai/*` from the installed dsh. `packages/chaos-bundle/cordis.patch.yml` is the layer a profile loads.

Each package documents its own behavior under `packages/<name>/README.md`.
