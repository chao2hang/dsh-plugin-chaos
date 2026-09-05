---
description: "DeepSeek Harness Web 输入框的工作区 @path 引用：基于有界会话工作区索引的 @ 选择器、引用路径栏、文件名过滤设置，以及面向模型的存在性步骤前标记。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-at-file

[English](README.md) | 中文

## 概述

在 Web 输入框输入 `@` 即可搜索当前会话的工作区，并把纯文本 `@path` 引用插入草稿。选择器对普通查询按文件名排序，查询包含斜杠时按路径段顺序匹配，空查询时提供浅层优先的浏览；ArrowRight 可进入高亮目录。输入框上方的引用栏为每个已引用路径提供打开操作与一键移除；设置 → 文件提及可开关整个表面、让粘贴进来的 `@` 保持普通文本，并管理全局或按工作区的文件名过滤规则。每个模型步骤前，Host 会对照工作区重新校验每个被引用的路径，并为每个有效引用追加一条仅含存在性的标记，让用户无需粘贴文件内容即可把文件指给 agent。

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

在加载 Web 表面的组合中，把 Host 服务与浏览器半边作为一行 `cordis.yml` 挂载；两个半边都激活后，选择器即出现在输入框中。

### 何时选择

当会话运行在 Host 可遍历的本地工作区目录上、且用户应按路径引用文件而不是粘贴内容时选择本插件。索引通过 `node:fs` 读取会话的 `cwd`，因此会话位于远程或虚拟文件系统上的部署需要匹配的索引来源。Web bundle 内置的 `ui-reference` 行注册自己的 `@` 来源（名为 `reference`）；两个来源可以共存，若输入框只应提供本选择器，请在 profile 覆盖层中禁用该行。

### 最小配置

```yaml
- id: chaos-at-file
  name: '@deepseek-ai/dsh-plugin-chaos-at-file'
  config:
    maxIndexedFiles: 5000
    ignoreDirs: ['.git', 'node_modules', 'dist']
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxIndexedFiles` | `5000` | 每个工作区索引条目的硬上限；遍历到达上限即停止 |
| `ignoreDirs` | 内置列表 | 遍历永不进入的目录名；`[]` 表示索引所有目录 |

`maxIndexedFiles` 必须是正安全整数，`ignoreDirs` 的每一项必须是非空目录名；两者都在插件激活时校验。字段来自 [`src/runtime.ts`](src/runtime.ts) 中的 Host `Config` schema。

### 选择器表面

输入 `@` 打开选择器：普通查询只匹配文件名，包含斜杠的查询按顺序匹配路径段，空查询按浅层优先浏览（同深度目录排在文件前）。浏览器按会话获取一次工作区索引，保持 30 秒热度，按击键在本地过滤，最多显示 50 行。选择一个条目会插入纯文本记号 `@<相对路径>`（尾部斜杠表示目录）；输入框上方的引用路径栏为草稿中的每个记号显示一个可移除的行——点击路径在 Host 上打开，点击 × 从草稿中删除该记号。

### 模型步骤前的标记

每个模型步骤前，插件扫描用户自己声明的消息中的 `@path` 记号，跳过开启粘贴忽略后用户粘贴的记号，并在会话工作区内解析其余每个去重后的记号。相对、存在且未逃逸工作区的记号会追加一条用户消息，例如：

```markdown
<workspace-reference path="docs/spec.pdf" kind="file" />
```

标记只携带路径及其类别——不含文件内容、不含目录列表；目录引用使用 `kind="directory"`。绝对路径、缺失或逃逸工作区的记号保持普通用户文本，模型只能通过会话中可用的工具读取被引用路径。粘贴的 `@` 记号在浏览器中携带零宽标记；Host 会在模型看到之前从消息文本中剥除它。

### 文件提及设置

设置 → 文件提及管理实时的 `chaos-at-file` 设置命名空间：启用开关（关闭时隐藏选择器、引用栏与标记）、粘贴 `@` 策略、全局文件名过滤器和按工作区的过滤追加。过滤规则只匹配文件名，可用完整名称或正则表达式并单独设置大小写；过滤变化会在下一次查询前使浏览器缓存的索引失效。在设置区块替换该列表之前，索引始终忽略内置元数据文件（`desktop.ini`、`Thumbs.db`、`.DS_Store`）。

### 移动端布局

屏幕宽度不超过 560px 时，选择器保持在视口内，引用行使用输入框的内容宽度，删除、过滤和设置控件保持 36–44px 触控目标。长文件名在选择器行中换行；引用行只截断显示文本，从不截断插入的路径。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包是拥有两个面的一个 Cordis 插件：Host 半边默认导出 `AtFileRuntime` 服务（`ctx.chaosAtFile`，wire 命名空间 `chaosAtFile`），浏览器半边以 `./client` 交付并通过包 manifest 的 `dsh.client` 声明发现。Host 拥有持久设置区块、经生成的 Typert Remote 应答选择器的索引搜索，并在 `agent/pre-step` 边界追加引用；浏览器拥有选择器来源、引用路径栏、设置页面和按会话的索引缓存。索引遍历一次流式读取一个目录项，跟随文件与目录符号链接但不重入祖先，跳过不可读目录并记录警告，到达配置上限即停止。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/runtime.ts`](src/runtime.ts) | `Config` schema、`chaosAtFile` 服务、设置区块注册、pre-step 接线 |
| [`src/files.ts`](src/files.ts) | 带符号链接环防护的有界流式工作区遍历 |
| [`src/mention.ts`](src/mention.ts) | 记号语法、工作区限制、存在性引用消息 |
| [`src/defaults.ts`](src/defaults.ts) | 内置过滤列表与共享的过滤规范化 |
| [`src/paste.ts`](src/paste.ts) | 零宽粘贴标记的插入、识别与剥除 |
| [`src/settings.ts`](src/settings.ts) | `chaos-at-file` 设置命名空间 schema |
| [`src/client/source.ts`](src/client/source.ts) | `@` 触发来源、按会话索引缓存、排序输入 |
| [`src/client/FilesDock.tsx`](src/client/FilesDock.tsx) | 引用路径栏：打开并移除一个草稿记号 |
| [`src/client/FolderNavigator.tsx`](src/client/FolderNavigator.tsx) | ArrowRight 目录导航与粘贴保护 |
| [`src/client/SettingsSection.tsx`](src/client/SettingsSection.tsx) | 该命名空间的设置页面 |
| — | 不发布运行时不变式伴生入口；每次索引应答都从实时文件系统按调用派生，设置区块归设置提供方所有，步骤前标记追加的是 agent loop 自己记录的消息——本包不持有关联两条事件流的可变状态，注册处置由 HMR 安全 spec 证明。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [输入触发管线](../../client/ui-input-trigger/README.zh.md)——本选择器注册进入的 `@` 与 `/` 输入框触发服务。
- [内置引用来源](../../client/ui-reference/README.zh.md)——Web bundle 自带的 `@` 来源，与本选择器并列组合。
- [chaos-upload](../chaos-upload/README.zh.md)——校验 `@uploads/...` 记号的同级上传标记。
- [Agent pre-step 边界](../../core/agent/README.zh.md)——引用标记追加所在的 waterfall。

-----

<a id="model-experience"></a>
## 模型体验

### 工作区路径引用

#### 模型看到什么

没有固定的提示词段落或工具 schema。选择器的索引、排序、过滤与引用栏都留在浏览器侧；只有用户自己声明的消息中出现有效的 `@path` 记号时，才会在下一个模型步骤为每个不同的引用追加一条 `chaos-at-file-mention` 用户消息，携带仅含存在性的 `<workspace-reference path="docs/spec.pdf" kind="file" />` 标记。原始记号保留在用户文本中，被设置忽略的粘贴记号不贡献任何内容。

#### Token 影响

可变：声明的用户消息中每个不同的有效引用贡献一条简短标记消息。工作区索引、设置、引用行与过滤后的候选不会增加请求 token。

#### KV Cache 影响

不改变稳定前缀。引用标记的变化只改变该步骤用户消息的后缀，可复用的请求前缀与提供方缓存保持不变。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制是当前包约束，不是任务积压。

- **Host 索引与会话工具必须面向同一工作区**——遍历通过本地 `node:fs` 读取会话 `cwd`；远程或虚拟文件系统部署需要两者都匹配的提供方。
- **有界索引可能遗漏条目**——遍历在 `maxIndexedFiles` 处停止，无法访问或损坏链接的目标会被跳过。
- **默认排除目录列表在激活时固定**——在 profile 配置中修改 `ignoreDirs` 并重启 Host；设置管理的文件名过滤器是其中的实时子集。
- **两个标记表面可能同时命中一个记号**——挂载 chaos-upload 时，一个 `@uploads/...` 记号会从两个插件各追加一条标记；在意重复时请关闭其中一个标记表面。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
