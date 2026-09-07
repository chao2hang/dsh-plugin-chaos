---
description: "Chaos 组合层：在 web-app bundle 之上提供可选的 think-tag 呈现与归档会话保留行，面向组装或裁剪 Chaos web profile 的用户。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-plugin-chaos

[English](README.md) | 中文

## 概述

`dsh-plugin-chaos` 是一个可安装的 profile 层，为基于 web-app bundle 的 profile 添加可选的 Chaos 插件：think-tag 呈现与归档会话保留清扫器。web-app bundle 已经提供六个核心 Chaos 行——chaos-mobile、chaos-auth、chaos-restart、chaos-models、chaos-retry 与 process-control——因此本层只添加 web-app 层未随附的内容。用 `dsh plugin --profile <name> add` 安装，或把它列入 profile 的 `dsh.profile.bundles`；移除它只去掉这两个可选行，不影响核心集。本包是一份 patch 文档加一组依赖声明，不是运行时代码：每条行为都属于行所指向的插件。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本层加入已包含 `@deepseek-ai/dsh-web-app` 的 profile；它的行插在该层之上。

### 安装进 profile

```text
dsh plugin --profile <name> add @deepseek-ai/dsh-plugin-chaos
dsh plugin --profile <name> remove @deepseek-ai/dsh-plugin-chaos
```

该命令在首次使用时初始化 profile，在 profile 目录内转发给 pnpm，然后按安装状态对账 `dsh.profile.bundles` 列表：解析到一个声明了 `dsh.bundle.patch` 的包的依赖——即本包——加入层栈，移除该依赖则将其移出。没有该声明的依赖保持为普通依赖，对账时会给出警告。从源码检出安装时，请传带 `./` 前缀的包路径（`dsh plugin --profile <name> add ./packages/extensions/chaos-bundle`），让启动器把它锚定到调用目录。`@deepseek-ai/dsh-base` 这类内置 bundle 从 dsh 安装目录解析，对账绝不会改动它们。

也可以在 profile 的 `dsh.profile.bundles` 列表中、`@deepseek-ai/dsh-web-app` 之后列出本 bundle：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-plugin-chaos"]
    }
  }
}
```

### 你得到什么

| 行 | 包 | 增加的内容 |
|---|---|---|
| `chaos-think-tags` | [chaos-think-tags](../chaos-think-tags/README.zh.md) | 通过会话折叠的推理展开项渲染 assistant think-tag 输出 |
| `chaos-janitor` | [chaos-janitor](../chaos-janitor/README.zh.md) | 日志静默超过 `maxArchivedDays` 后删除归档会话 |

保留开关以中性值随附：`maxArchivedDays: 0` 禁用清扫器，删除任何内容都是之后显式做出的选择。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本 bundle 是 web-app 层之上的一份静态 patch 文档：一个包含两条行的 `insert` 列表，每行带稳定 id，供后续层或用户的 profile `cordis.patch.yml` 寻址。它不挂载服务、不发出事件、不持有状态；每行的行为与不变式由该行的包拥有。`package.json` 依赖集携带 Chaos 插件，因此安装本层也会安装其行所引用的插件。

### 层语义

patch 条目替换目标行的整个 `config` 而不是合并进去；后续 bundle 层与用户的 patch 按 id 覆盖行，每行最后一次写入生效。这里的两条行都是相对 web-app 层的新插入——本 patch 不禁用也不改写任何 web-app 行。

### 插入插件所依赖的扩展点

被插入的插件构建在通用主仓库 seam 之上：chaos-think-tags 替换浏览器会话包拥有的 `conversation.chat.node` 槽位中的 keyed assistant 渲染器，chaos-janitor 读取 `sessionPersistence.list()` 会话头、`workspaceRegistry.archivedSessionIds` 集合与 `sessions` 活跃会话存储。两者都是通用扩展点，不是 Chaos 专用钩子。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | bundle 实体：两条插入行，附行内注释说明各行依据 |
| [`src/index.ts`](src/index.ts) | 包入口；不携带任何运行时 API |
| — | 不发布运行时不变式伴生入口；本 bundle 是静态 patch 列表载体，不挂载服务、无可审计的可变关系，每条插入行由所属的包负责其不变式。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当层级约定不够用时阅读以下页面。

- [web-app bundle](../../bundle/web-app/README.zh.md)——本 bundle 构建其上的层及其六个核心 Chaos 行。
- [归档会话保留清扫器](../chaos-janitor/README.zh.md)——清扫行为与配置。
- [Think-tag 呈现](../chaos-think-tags/README.zh.md)——think-tags 行挂载的渲染器。
- [Base bundle](../../bundle/base/README.zh.md)——共享核心层形态与 patch 语义。
- [app-boot profile 章节](../../boot/app-boot/README.zh.md)——profile 如何解析与堆叠 bundle 层。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本 bundle 是没有自身运行时的组合补丁层；它插入的各插件拥有全部模型可见注册。

#### KV Cache 影响

本 bundle 不添加任何请求前缀，也不发送提供方请求；每条插入行所属的包负责各自的缓存影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本层的边界在哪里。它们是当前包约束，不是任务积压。

- **移除本层不会移除核心 Chaos 行**——`chaos-mobile`、`chaos-auth`、`chaos-restart`、`chaos-models`、`chaos-retry` 与 `process-control` 来自 web-app bundle 的 patch；随本层离开的只有两个可选行。
- **后续覆盖其中一行会替换其整个 config**——patch 条目不合并，覆盖必须重述每个想保留的设置。
- **保留开关以中性值随附**——`maxArchivedDays: 0` 保留每个归档会话，直到 profile 层或用户 patch 设为正值。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
