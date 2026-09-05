# `@deepseek-ai/dsh-plugin-chaos-upload`

[English](README.md) | 中文

DeepSeek Harness Web 输入框的文档上传插件。浏览器半边把选中的非图片文件经自己的 Typert Remote 存入会话工作区，在草稿末尾追加 `@path` 引用，并在模型步骤边界为每个被引用的上传打上标记。插件由 Chaos bundle 启用；输入框的移动端回形针按钮（chaos-mobile）提供按钮入口，桌面端的粘贴与拖放直接进入该服务，插件自身不渲染任何 UI。

## 行为

浏览器半边提供 `chaosUpload` 服务：一个 `uploadAndMention(sessionId, file)` 操作。它把文件 base64 编码，经 `chaosUpload/upload` Remote 发送到 Host，再通过作用域内的 `slash/input-insert-text` 事件在会话草稿末尾插入 `@uploads/<name>`。当输入状态机拒绝插入（并发编辑赢得了 span 版本号）时，上传仍然成功，调用方提示用户手动输入引用。

桌面端文件经由捕获阶段的 document 监听进入该服务：在输入框内粘贴、或在页面任意位置拖入含至少一个非光栅文件的批次时——光栅图片进入草稿图片栏，其余全部上传。捕获阶段先于核心的仅图片准入运行，被拦截的事件不会再报“不支持的类型”；纯文本或纯图片的粘贴保持核心流程不变。混合粘贴所携带的文本会被丢弃。

Host 半边对每次上传做准入：解码规范 base64、校验字节上限、把声明文件名归约为安全的裸 basename，然后把字节写入 `<workspace>/<dir>/` 下一个无冲突的名字（`report.pdf`、`report-2.pdf`……）。写入使用 `wx`，同名并发上传不会互相覆盖。

模型步骤前，插件扫描用户自己的消息中的 `@<dir>/...` 记号，确认每个记号指向工作区内已存在的文件，然后追加一条消息：

`<workspace-reference path="uploads/report.pdf" kind="file" />`

标记不携带文件内容。模型只能通过会话中已有的工具读取被引用路径；无效、缺失或不存在的路径保持为普通用户文本。配置目录之外的记号不在扫描范围内——该表面由 chaos-at-file（若启用）负责。

## 配置

```yaml
- id: chaos-upload
  name: '@deepseek-ai/dsh-plugin-chaos-upload'
  config:
    dir: uploads
    maxFileBytes: 20971520
    markers: true
```

- `dir` — 工作区相对上传目录，按需创建。必须是相对、正斜杠、可用片段组成的路径，否则加载时拒绝。
- `maxFileBytes` — 单次上传解码字节数的硬上限（默认 20 MiB）。
- `markers` — 设为 `false` 可停止步骤前标记，同时保留上传。
- `maxAgeDays` — 保留策略：文件超过该天数即删除；`0`（默认）永久保留。扫描覆盖会话持久化已知的每个工作区，只删平铺文件，每 `sweepIntervalMinutes`（默认 60）一轮，启动后先跑一轮。
- `dryRun` — 只记录将执行的删除而不真正删除。

被删除的上传会优雅退化：步骤前标记验证失败，`@path` 记号保持为普通用户文本。

## Model Experience

### Workspace reference markers

#### What the model sees

无固定提示词段落。一个有效的（用户输入或插入的）`@<dir>/...` 记号在下一个模型步骤贡献一条简短的 `workspace-reference` 标记。原记号保留在用户文本中。

#### Token effect

可变：声明的用户消息中每个有效的不同上传引用贡献一条简短标记。上传字节只在入站 RPC 中传输一次，从不进入模型请求。

#### KV Cache effect

无稳定前缀变化。引用标记的变化只改变该步骤用户消息的后缀。

## Known Limitations and Deferred Work

- 上传以 base64 走 JSON RPC，单次上传的请求体积约为字节量的 1.37 倍；需要更大文档的部署应有意识地调高 `maxFileBytes`。
- 标记在步骤准备时验证存在性，不保证后续工具调用的持续访问，且只扫描配置目录之下的记号。
- 同时启用 chaos-at-file 时，两个插件会各为同一个 `@<dir>/...` 记号打一条标记；在意重复时请关闭其中一个标记表面。
- 浏览器半边按渲染解析 `chaosUpload` 服务，插件晚加载时要等输入框下一次重渲染才出现。

**运行时不变式：** 不发布 companion。存储的上传经由 fs 服务落在工作区，并由标记在步骤准备时重新验证；浏览器半边按渲染解析 `chaosUpload` 服务，不持有跨事件状态。
