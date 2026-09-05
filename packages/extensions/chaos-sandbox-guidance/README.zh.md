---
description: "DeepSeek Harness 中防止冗余 sandbox 提权的模型指引：每请求的 runtime-context 段落，告知 danger-full-access 会话直接调用工具，并为受限会话保留严格更宽的单次重试规则。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-sandbox-guidance

[English](README.md) | 中文

## 概述

防止模型传递冗余的 sandbox 提权参数。在 `danger-full-access` 会话中，指引要求模型直接调用 Bash 和文件系统工具，不传 `sandbox_permissions` 或 `justification`，并把 "not strictly wider than this call's current" 错误读作应删除这些参数的信号，而不是重试。在受限模式下，指引保留原有规则：提权仅在真实 sandbox 拒绝后重试一次，且请求的模式必须严格更宽。该文本按每次提示词组装从会话解析出的策略重新生成，且不改变任何执行限制：sandbox executor 仍是执行限制的拥有方。

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

在能解析 sandbox 策略的组合中挂载本插件；Chaos bundle 默认插入该行。

### 何时选择

当恢复的或长期的会话积累出诱使模型发起冗余提权调用的工具失败记录时选择本插件。它需要 `sandboxPolicy` 与 `systemPrompt` 服务，且不注册其他任何内容。

### 组合

Chaos bundle 将该包以 `chaos-sandbox-guidance` 挂载：

```yaml
- id: chaos-sandbox-guidance
  name: '@deepseek-ai/dsh-plugin-chaos-sandbox-guidance'
```

本插件没有配置；移除该行即可停止指引。

### 行为

每次提示词组装时，插件经 sandbox 策略服务解析目标会话的有效 sandbox 模式，并贡献一个 `chaos:sandbox-escalation` 上下文段落，其文本取决于该模式；没有 agent 会话的组装不贡献任何文本。该段落按每个请求重新生成——包括恢复的会话——既不放宽执行限制，也不改写工具参数。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本插件通过 `ctx.systemPrompt.context` 以 `chaos:sandbox-escalation` 之名注册一个动态上下文。文本提供方读取组装中的 agent 会话，经 sandbox 策略服务解析其模式，并返回两个固定指引字符串之一；没有 agent 会话的组装返回空文本，不贡献任何内容。该注册限定在插件的 context 作用域内，并随其 fiber 撤销。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：inject 声明、两条指引文本、上下文注册 |
| — | 不发布运行时不变式伴生入口；指引文本在每次读取时从策略服务解析出的模式派生，上下文注册依托插件自身的作用域。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [Sandbox 策略](../../sandbox/sandbox-policy/README.zh.md)——解析会话有效模式的服务。
- [System prompt](../../core/system-prompt/README.zh.md)——本插件注册进入的上下文注册表。
- [Chaos bundle](../chaos-bundle/README.zh.md)——挂载本插件的组合。

-----

<a id="model-experience"></a>
## 模型体验

### sandbox 提权 runtime context

#### 模型看到什么

合并后的 `Current runtime context` 快照中的一个 `chaos:sandbox-escalation` 段落——agent loop 在渲染出的快照与保留值不同时追加的用户角色消息。该段落的文本是两个固定字符串之一，由会话解析出的 sandbox 模式选择；没有 agent 会话的组装不贡献任何文本。不添加工具 schema，工具执行不变。

##### danger-full-access 指引

```markdown
IMPORTANT: the current session is already running with danger-full-access. For Bash, Read, Edit, Write, and filesystem calls, call the tool directly with only its normal arguments. Do not include sandbox_permissions or justification. Never try to change to workspace-write or danger-full-access through a permission command. The error "not strictly wider than this call's current" means the redundant escalation arguments must be removed; it is not a reason to retry escalation.
```

##### 受限模式指引

```markdown
Use sandbox_permissions only for one retry after a real sandbox denial, and only when the requested mode is strictly wider than the current mode. Do not retry an operation merely because another tool call failed.
```

#### Token 影响

每条被追加的 runtime-context 快照内含一段指引；快照文本不变时不追加新消息，因此稳定的模式在保留快照之外不再增加内容。

#### KV Cache 影响

快照以用户角色消息追加在可复用前缀之后，因此提供方缓存复用得以保留；模式变化会追加新快照而不是重写前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制是当前包约束，不是任务积压。

- **本插件只能引导遵循指引的模型**——它无法修复已经发出的工具调用；sandbox executor 仍是执行限制的拥有方。
- **所有受限模式收到相同的指引文本**——该段落只区分 `danger-full-access` 与其余模式，不存在只读与 `workspace-write` 这类按模式定制的建议。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
