---
description: "保留清扫器：归档的 Chaos 会话日志静默超过配置时长后删除该会话，供运维选择 maxArchivedDays、清扫节奏，或用 dry-run 预演删除。"
kind: "package-reference"
---

# @deepseek-ai/dsh-plugin-chaos-janitor

[English](README.md) | 中文

## 概述

`dsh-plugin-chaos-janitor` 在会话日志静默超过 `maxArchivedDays` 天后删除该归档会话的目录，清扫 JSONL 后端写入的会话根目录。默认 `maxArchivedDays: 0` 保持插件挂载但不删除任何内容，因此保留永远是显式选择。清扫绝不删除存活会话、日志无法读取的会话，或目录里除已知日志文件外还有其他内容的会话——此时记录一次跳过而不是猜测。设置 `dryRun: true` 可在承诺保留值之前，先记录它会执行的删除。本包不含浏览器半边，不渲染任何 UI。

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

在已提供工作区 registry、会话持久化、存活会话存储与 timer 的组合中挂载本清扫器。Chaos bundle 以 `maxArchivedDays: 0` 插入该行；启用删除只是改配置，不需要重新挂载。

### 何时选择

当归档会话不应在会话根目录下无限累积时选择本清扫器。它依赖 JSONL 持久化后端的布局：路径来自 `sessionDir` / `generationLogPath` 契约，其他后端物化的会话原样保留。没有工作区 registry 归档集合的组合没有可供清扫器处理的对象。

### 最小配置

```yaml
- id: chaos-janitor
  name: '@deepseek-ai/dsh-plugin-chaos-janitor'
  config:
    maxArchivedDays: 30
    intervalMinutes: 60
    dryRun: false
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxArchivedDays` | `0` | 归档会话日志静默超过该天数即删除；`0` 完全禁用删除 |
| `intervalMinutes` | `60` | 清扫节奏，单位为分钟 |
| `dryRun` | `false` | 只记录将执行的删除而不真正删除 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-plugin-chaos-janitor)是每个受支持字段的穷尽式真源。

### 清扫做什么

每一轮读取工作区 registry 的归档集合，通过持久化服务的快照列举出已持久化的会话并读取各会话头，然后删除每个日志文件静默超过 `maxArchivedDays` 天的归档会话的会话目录。首轮在启动五秒后运行，此后每 `intervalMinutes` 一轮。删除只移除会话根目录（`$DSH_HOME/sessions/<project>/<session>/`）下该会话自己的目录；registry 的归档集合只读不写——registry 本来就会过滤日志已消失的会话，遗留的归档 id 是惰性的。

### 清扫绝不删除

- 仍在会话存储中存活的会话；
- 日志文件缺失或无法读取的会话；
- 目录里除已知日志文件（`session.jsonl.zstd`、`session.jsonl`，或带或不带 `.zstd` 后缀的 `session.vN.jsonl` 生成日志）外还有其他内容的会话；
- 没有已物化会话头的归档 id——清扫没有其路径知识，保持原样。

每次跳过都连同原因一起记录；文件系统删除失败会被记录，清扫继续越过它。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

插件入口派生会话根目录并拥有 timer 生命周期；清扫本身是对注入事实的纯函数。

### 设计理念

`sweepArchivedSessions` 接收归档 id 集合、已持久化会话头与存活探针，返回删除、跳过与受控失败——不含 Cordis context，因此保留规则可以在临时目录上做单元测试。年龄取日志文件的 mtime；会话只有同时满足已归档、不存活、早于截止时间、且目录只含自己的日志文件时才成为候选。根目录是 `dshHomePath('sessions')`，与 base bundle 交给 JSONL 后端的根相同；路径来自该后端的布局契约（`sessionDir` / `generationLogPath`），本包从不重新编码。间隔与启动后五秒的首轮都挂在注入的 timer 上，随插件 fiber 一同销毁。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`Config` schema、timer 接线、结果日志行 |
| [`src/sweep.ts`](src/sweep.ts) | 纯清扫：候选推导、跳过规则、删除 |
| [`src/types.ts`](src/types.ts) | 供测试与入口消费的公开保留记录 |
| [`tests/sweep.spec.ts`](tests/sweep.spec.ts) | 针对临时目录的清扫行为 |
| — | 不发布运行时不变式伴生入口；每轮清扫都从 registry、会话头与日志 mtime 重新推导候选，插件在两次清扫之间不持有状态。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [JSONL 会话持久化](../../session/session-persistence-jsonl/README.zh.md)——提供被清扫路径的布局契约所属后端。
- [会话持久化子系统](../../../docs/subsystems/persistence.zh.md)——后端无关的服务语义。
- [工作区 registry](../../workspace/workspace/README.zh.md)——清扫读取的归档集合。
- [Chaos bundle](../chaos-bundle/README.zh.md)——插入本行的层。
- [生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-plugin-chaos-janitor)——受支持的配置字段及其 JSDoc。

-----

<a id="model-experience"></a>
## 模型体验

无，因为该插件在任何模型回合之外删除持久会话存储，不贡献任何模型可见输入。

#### KV Cache 影响

该插件不改变任何模型请求，既不增加 token，也不改变 KV Cache 复用。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本清扫器何时不合适，或何时需要特别的运维注意。它们是当前包约束，不是任务积压。

- **年龄取日志文件的 mtime，而非归档时间戳**——工作区 registry 不记录归档时间，静默三十天后昨天才归档的会话按三十天计；绝不会比真实归档年龄更年轻，存活期间绝不删除。
- **清扫只看见 JSONL 后端在 `$DSH_HOME/sessions` 下物化的会话**——换用其他持久化后端，或把 JSONL 根配置在别处时，所有会话原样保留。
- **删除会话不会删除其图片附件**——附件库中只有该会话引用的字节保持孤儿状态，直到附件保留机制出现。
- **registry 的 `archivedSessionIds` 保留已删除会话的 id**——它们是惰性的（registry 从所有分组表面过滤缺失会话），但在 registry 清理它们之前会累积。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
