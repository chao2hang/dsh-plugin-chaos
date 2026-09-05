# `@deepseek-ai/dsh-plugin-chaos-janitor`

[English](README.md) | 中文

Chaos profile 的归档会话保留清理器。插件按间隔删除日志已静默超过配置时长的归档会话；`maxArchivedDays: 0`（默认）保持插件挂载但不做任何事。本包不含浏览器半边，不渲染任何 UI。

## 行为

每一轮读取工作区 registry 的持久化归档集合，列出已持久化的会话头，然后删除每个日志文件静默超过 `maxArchivedDays` 天的归档会话的会话目录。会话在以下情况绝不删除：仍在会话存储中存活、日志文件无法读取、或其目录里除已知日志文件外还有其他内容——此时记录一次跳过而不是猜测。

删除只移除会话根目录（`$DSH_HOME/sessions/<project>/<session>/`）下该会话自己的目录；路径来自 `dsh-session-persistence-jsonl` 的布局契约（`sessionDir` / `logPath`），本包从不重新编码。registry 的归档集合只读不写：registry 本来就会过滤日志已消失的会话，遗留的归档 id 是惰性的。首轮在启动五秒后运行，此后每 `intervalMinutes` 一次。

## 配置

```yaml
- id: chaos-janitor
  name: '@deepseek-ai/dsh-plugin-chaos-janitor'
  config:
    maxArchivedDays: 0
    intervalMinutes: 60
    dryRun: false
```

- `maxArchivedDays` — 归档会话日志静默超过该天数即删除；`0`（默认）完全不删除。
- `intervalMinutes` — 扫描节奏（分钟）。
- `dryRun` — 只记录将执行的删除而不真正删除；用于预演保留值。

## Model Experience

无——插件在任何模型回合之外删除持久化会话存储，不贡献任何模型可见输入。

#### KV Cache effect

插件不改变任何模型请求，既不增加 token，也不改变 KV Cache 复用。

## Known Limitations and Deferred Work

- 年龄以日志文件的 mtime 计，而非归档时间戳：工作区 registry 不记录归档时间。静默三十天后昨天才归档的会话按三十天计——绝不会比真实归档年龄更年轻，存活期间绝不删除。
- 扫描只看见 jsonl 后端物化的会话；换用其他持久化后端时所有会话原样保留。
- 删除会话不会删除只有该会话引用的附件库图片；这些字节在附件保留机制出现前保持孤儿状态。
- registry 的 `archivedSessionIds` 保留已删除会话的 id；它们是惰性的（registry 从所有分组表面过滤缺失会话），但在 registry 清理它们之前会累积。

**运行时不变式：** 不发布 companion。每次清扫都通过持久化布局契约从会话 registry 与日志文件 mtime 重新推导候选；插件在两次清扫之间不持有状态，timer 注册随 fiber 一起销毁。
