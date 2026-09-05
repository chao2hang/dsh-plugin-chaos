# Agent Note：干净树上宿主编译前引导 Typert

状态：已实现

[English](2026-09-05-bootstrap-typert-before-host-tsc.md) | 中文

> [TSC 优先构建笔记](../process/2026-06-17-ts-build-config.zh.md)拥有编译器归属；[API Remotes 构建笔记](../process/2026-08-08-api-remotes-generated-contract-build.zh.md)定义了宿主先生成客户端契约的顺序。本笔记覆盖该顺序在干净树上的缺口，以及守护它的子路径别名规则。

## 问题

`tsc -b tsconfig.host.json` 会同时构建 Client 叶子项目：包的宿主叶子引用依赖的 solution root，而 solution root 同时引用两个面。Client 叶子导入生成的 `*/remote` 契约，其声明（`lib/typert.remote-client.d.ts`）只有宿主 tsdown 阶段才会产出——在 `tsc` 之后。于是在任何没有陈旧构建产物的树上，这构成循环：必须最先运行的编译需要它之后阶段才生成的产物。干净检出上所有先跑 `pnpm run test` 或 `build:official` 的 CI 运行都因 `TS2307: Cannot find module '…/remote'` 失败。

第二个更小的缺口形状相同：`packages/api/session-controller/src/commands.ts` 导入 `@deepseek-ai/dsh-client-file-upload/types`，该标识符在 `tsconfig.base.json` 没有 paths 条目，干净树上解析到产出的 `lib/types/types.d.ts` 而非 `src/types.ts`。

## 决策

- `build:lib:host` 在 `tsc -b tsconfig.host.json` 之前运行 `node --import tsx/esm scripts/bootstrap-typert.ts`。引导脚本早已存在——它通过 `WorkspaceTypertGenerator` 从源码产出 typert 面工件与 remote-client 文件，无需 tsdown 运行——但没有任何调用方。把它接进第一个构建阶段，后续每个阶段都有了生成契约；tsdown 阶段随后幂等地重新生成同一批工件。
- `@deepseek-ai/dsh-client-file-upload/types` 获得映射到 `packages/client/file-upload/src/types.ts` 的源码层 paths 条目，与 `dsh-api-remotes/types` 先例一致。通过 `paths` 解析的工作区子路径导入让静态分析在干净树上可用；落穿到 `exports` 与构建产出的做法会在别处重新引入循环。
- `vendor/cordis` 与 `vendor/cosmokit` 获得包级 `tsdown.config.ts` 覆盖（`schemastery`/`logger-console` 模式），使工作区 tsdown 阶段写出它们的 `lib/index.js` 运行时束。缺了它，exports 映射的 default 目标不存在，web 构建在经 Vite 的 commonjs 解析器解析 `@deepseek-ai/cordis` 时失败——这正是 lib 阶段转绿之后 sandbox 工作流在干净树上报告的同类失败。

## 考虑过的替代方案

- 工件看似新鲜时跳过引导：拒绝——陈旧的时间戳正是干净树循环回归的方式，而该检查付出的信任代价高于它省下的十秒。
- 把每个包的宿主叶子全面改为显式引用依赖的宿主叶子（绝不引用 solution root）：拒绝——这是为绕开一个顺序缺口而改动数百条引用条目的全仓翻修；solution root 惯例来自 upstream，契约存在之后即可正常工作。
- 通过 `paths` 把 `*/remote` 标识符映射到源码：不可能——remote-client 声明是生成工件，没有可映射的源文件。

## 后果

引导生成器每次宿主构建多运行一次（本机约十秒），即使工件已是最新。换来的是顺序契约：干净树上任何编译阶段不得先于契约生成，因此 `pnpm run test` 与 `build:official` 从任意检出状态都能成功，且 tsdown 阶段仍会幂等地覆写相同字节。

## 测试

- 从 `pnpm run clean` 起，`pnpm run build:lib:host` 与随后的 `pnpm run build:official` 完成，`*/remote` 或 `file-upload/types` 标识符无 `TS2307`。
- `npx vitest run scripts/gen-tsconfig-paths.spec.ts` 保持绿色：删除已删除的 chaos 包条目后，每个工作区包仍有别名。
