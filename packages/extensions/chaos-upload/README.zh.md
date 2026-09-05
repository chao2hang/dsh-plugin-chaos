---
description: "DeepSeek Harness Web 输入框的文档上传：经 Typert Remote 的浏览器到 Host 文件 RPC、草稿 @path 引用插入、按年龄保留清理，以及面向上传路径的存在性步骤前标记。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-upload

[English](README.md) | 中文

## 概述

为 Web 会话附加非图片文档：在桌面端向输入框粘贴或向页面任意位置拖放文件，或在移动端输入框使用回形针，插件即经自有的 Typert Remote 把文件存入会话工作区，并在草稿末尾追加 `@uploads/<name>` 引用。每个模型步骤前，Host 会重新校验每个已声明的上传路径，并追加一条模型可据以行动的仅含存在性的标记，让用户无需粘贴内容即可把文档交给 agent。光栅图片保持输入框的草稿图片流程，可选的按年龄清理会在存储的上传变旧后删除它们。本插件自身不渲染任何 UI；Chaos bundle 挂载它，移动端回形针（chaos-mobile）提供其按钮。

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

在加载 Web 表面的组合中，把 Host 服务与浏览器半边作为一行 `cordis.yml` 挂载；Chaos bundle 默认插入该行。

### 何时选择

当会话应以 agent 用自己工具读取的工作区文件形式接收文档、而不是粘贴文本或草稿图片时选择本插件。桌面端粘贴与拖放直接进入该服务，移动端输入框的回形针仅在本插件挂载时提供其文档操作。

### 最小配置

```yaml
- id: chaos-upload
  name: '@deepseek-ai/dsh-plugin-chaos-upload'
  config:
    dir: uploads
    maxFileBytes: 20971520
    markers: true
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `dir` | `uploads` | 工作区相对上传目录，按需创建；必须是相对、正斜杠、可用片段组成的路径 |
| `maxFileBytes` | `20971520`（20 MiB） | 单次上传解码字节数的硬上限 |
| `markers` | `true` | 步骤前边界是否校验 `@<dir>/...` 记号 |
| `maxAgeDays` | `0` | 存储的上传超过该天数即删除；`0` 永久保留 |
| `sweepIntervalMinutes` | `60` | 保留清理周期；启动后先跑一轮 |
| `dryRun` | `false` | 只记录清理将执行的删除而不真正删除 |

字段来自 [`src/runtime.ts`](src/runtime.ts) 中的 Host `Config` schema。

### 上传入口

浏览器半边提供 `chaosUpload` 服务：一个 `uploadAndMention(sessionId, file)` 操作，把文件 base64 编码，经 `chaosUpload/upload` Remote 发送到 Host，再通过作用域内的 `slash/input-insert-text` 事件在会话草稿末尾插入 `@uploads/<name>`。当输入状态机拒绝插入（并发编辑赢得了 span 版本号）时，上传仍然成功，输入框会提示手动引用。桌面端文件经由捕获阶段的 document 监听进入该服务：在输入框内粘贴、或在页面任意位置拖入含至少一个非光栅文件的批次时——光栅图片进入草稿图片栏，其余全部上传。纯文本或纯图片的粘贴保持核心流程不变，混合粘贴所携带的文本会被丢弃。

### Host 准入与保留

Host 半边对每次上传做准入：解码规范 base64、校验字节上限、把声明文件名归约为安全的裸 basename，然后把字节写入 `<workspace>/<dir>/` 下一个无冲突的名字（`report.pdf`、`report-2.pdf`……）；写入使用 `wx`，同名并发上传不会互相覆盖。设置 `maxAgeDays` 后，清理覆盖会话持久化已知的每个工作区，只删除上传目录中早于配置年龄的平铺文件，每 `sweepIntervalMinutes` 一轮并在启动后先跑一轮；`dryRun` 在日志中排练删除。被删除的上传会优雅退化：步骤前标记验证失败，`@path` 记号保持普通用户文本。

### 模型步骤前的标记

每个模型步骤前，插件扫描用户自己声明的消息中的 `@<dir>/...` 记号，确认每个记号指向会话工作区内已存在的文件，然后追加一条用户消息，例如：

```markdown
<workspace-reference path="uploads/report.pdf" kind="file" />
```

标记不携带文件内容。模型只能通过会话中可用的工具读取被引用路径；无效、缺失或不存在的路径保持普通用户文本。配置目录之外的记号不在扫描范围内——该表面由 chaos-at-file（若启用）负责。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包是拥有两个面的一个 Cordis 插件：Host 半边默认导出 `ChaosUploadRuntime` 服务（`ctx.chaosUpload`，wire 命名空间 `chaosUpload`），浏览器半边以 `./client` 交付并通过包 manifest 的 `dsh.client` 声明发现。Host 应答上传 RPC，把字节存入会话工作区，在 `agent/pre-step` 边界追加引用，并在插件 fiber 的定时器上运行保留清理；浏览器半边挂载 Remote、提供 `chaosUpload` 服务并安装桌面端入口。文件内容只在入站方向经过 RPC 一次。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/runtime.ts`](src/runtime.ts) | `Config` schema、`chaosUpload` 服务、pre-step 接线、保留清理 |
| [`src/upload.ts`](src/upload.ts) | base64 准入、名称归约、无冲突 `wx` 写入 |
| [`src/marker.ts`](src/marker.ts) | `@<dir>/...` 记号语法与存在性引用消息 |
| [`src/sweep.ts`](src/sweep.ts) | 针对一个工作区上传目录的按年龄保留清理 |
| [`src/client/service.ts`](src/client/service.ts) | `chaosUpload` 浏览器服务：上传并引用、草稿插入 |
| [`src/client/intake.ts`](src/client/intake.ts) | 捕获阶段的粘贴与拖放监听 |
| — | 不发布运行时不变式伴生入口；存储的上传是由标记在步骤准备时重新校验的普通工作区文件，浏览器半边不持有跨事件状态，注册处置由 HMR 安全 spec 证明。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [chaos-at-file](../chaos-at-file/README.zh.md)——面向整个工作区的同级 `@` 选择器与标记表面。
- [chaos-mobile](../chaos-mobile/README.zh.md)——提供文档操作的输入框回形针。
- [Chaos bundle](../chaos-bundle/README.zh.md)——挂载本插件的组合。
- [Agent pre-step 边界](../../core/agent/README.zh.md)——引用标记追加所在的 waterfall。

-----

<a id="model-experience"></a>
## 模型体验

### 工作区引用标记

#### 模型看到什么

没有固定提示词段落。一个有效的（用户输入或插入的）`@<dir>/...` 记号在下一个模型步骤贡献一条简短的 `<workspace-reference path="uploads/report.pdf" kind="file" />` 标记消息；原记号保留在用户文本中。上传字节只在入站 RPC 中传输一次，落入工作区，从不进入模型请求。

#### Token 影响

可变：声明的用户消息中每个有效的不同上传引用贡献一条简短标记。上传传输、保留清理与设置不会增加请求 token。

#### KV Cache 影响

不改变稳定前缀。引用标记的变化只改变该步骤用户消息的后缀，可复用的请求前缀与提供方缓存保持不变。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制是当前包约束，不是任务积压。

- **上传以 base64 走 JSON RPC**——单次上传的请求体积约为字节量的 1.37 倍；需要更大文档的部署应有意识地调高 `maxFileBytes`。
- **标记在步骤准备时验证存在性**——它不保证后续工具调用的持续访问，且只扫描配置目录之下的记号。
- **两个标记表面可能同时命中一个记号**——同时启用 chaos-at-file 时，两个插件会各为同一个 `@<dir>/...` 记号打一条标记；在意重复时请关闭其中一个标记表面。
- **移动端回形针按渲染解析服务**——插件晚加载时要等输入框下一次重渲染才出现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
