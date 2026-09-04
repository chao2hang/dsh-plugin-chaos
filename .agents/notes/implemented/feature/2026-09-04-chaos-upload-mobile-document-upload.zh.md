# Agent Note: Chaos 自有的移动端文档上传

Status: implemented

[English](2026-09-04-chaos-upload-mobile-document-upload.md) | 中文

## Problem

Web 输入框的上传链路端到端只接受图片：浏览器端准入只认四种光栅媒体类型，线协议的提示内容只携带 `text | image` 两种部件，Host 准入只解码和归一化图片，供应商请求也只投影 `image_url` 块。`dsh-client-ui-attachment` 把"仅图片"记录为推迟项，因此没有任何核心表面接受文档。手机上的 Chaos profile 用户——该 profile 的主要远程受众——完全没有办法把 PDF、表格或压缩包从设备送进会话工作区。

## Decision

`@deepseek-ai/dsh-plugin-chaos-upload` 以独立的双半边 chaos 插件拥有文档上传，由 Chaos bundle 组合，不改动任何核心包。

Host 半边是一个 `TypertRemoteService`（`chaosUpload`），只有一个 `@Remote('upload')` 调用：规范 base64 解码、`maxFileBytes` 上限、把声明文件名归约为安全的裸 basename，再用 `wx` 原子写入 `<workspace>/<dir>/`（默认 `uploads/`），冲突时对原始词干编号（`report.pdf`、`report-2.pdf`）。会话工作区来自线上的 `agentId` 查找；没有工作区目录的会话上传会立刻失败。

浏览器半边提供 `chaosUpload` 客户端服务：一个 `uploadAndMention(sessionId, file)` 操作，编码文件、调用 Remote，再通过作用域内的 `slash/input-insert-text` 事件把 `@<dir>/<name>` 追加到草稿。插入以 detect 坐标瞄准草稿末尾（每个引用 chip 计一个 detect 字符），由输入修订号的 span CAS 保护，并发编辑会拒绝插入而不是与之竞速；上传本身已经成功，调用方提示用户手动输入引用。

桌面端文件经捕获阶段的 document 监听（`src/client/intake.ts`）进入同一服务：在输入框卡片内粘贴、或在页面任意位置拖入含至少一个非光栅文件的批次时——光栅图片经会话控制器进入草稿图片栏，其余全部上传。document 捕获阶段先于编辑器的粘贴处理和图片栏的 drop 监听是 DOM 保证，拦截不存在顺序竞速；被拦截的 drop 会合成 dragend 让图片栏的遮罩复位。Host 清单注册由 typert loader 经包的 `./typert` 导出拥有——插件侧再 `ctx.typert.register` 同一个 face 会让每次启动都因重复包面失败（首次部署正是这样崩溃循环，删掉该调用后恢复）。

模型步骤前，一个 `agent/pre-step` 监听器扫描用户自己的消息中的 `@<dir>/...` 记号，证明每个记号指向已存在的工作区文件，并为每个有效记号追加一条只含存在性的 `workspace-reference` 标记——与 chaos-at-file 相同的消息语法，作用域限定在配置目录。模型用会话已有的工具读取上传的文档；上传字节从不进入模型请求。

chaos-mobile 的回形针按钮打开三选一菜单——拍照、图片、附件。图片沿用现有的草稿图片栏；附件动作把非图片文件交给该服务，并用严格的 `ctx.get('chaosUpload')` 解析服务，因此该动作恰好在 chaos-upload 挂载时出现，插件保持为可选 peer。

## Alternatives considered

**把核心附件能力扩展到文档。** 否决：它要同时改动 `dsh-attachment` 类型与准入、`attachment-local` 存储、`ui-conversation` 序列化、`ui-attachment` 渲染、session-controller 提示路径和供应商请求投影，而且"model-visible ⟺ logged"要求为文档内容新增会话事件。供应商的内容块只接受图片，文档理解无论如何都需要 Host 侧文本抽取——这是一个更大、核心明确推迟的独立决策。

**扩展 chaos-at-file 而不是新增包。** 否决：chaos-at-file 索引已存在的工作区路径，其 Remote 只应答搜索；它刻意不读文件字节。把入站字节的 RPC 折进去会耦合两个信任形态不同的表面，而它的 pre-step 标记已扫描所有 `@token`，会对上传引用双重标记。上传标记的作用域保持在配置目录内，重叠在两份 README 中都有记录。

**用引用 chip 经 `serializeReference` 插入。** 否决：chip 需要一个注册了触发源和提交时序列化 codec 的管线；纯文本 `@path` 记号与 chaos-at-file 已验证的手势一致，不需要新的 codec 表面，用户也可以直接编辑。

**在核心准入里加非图片处理器扩展点。** 本次否决：粘贴和拖放的终点都在 `ui-conversation`/`ui-attachment` 的图片准入里，核心 seam 是教科书式的归宿——但那要为 Chaos profile 的能力改动主仓库包，而捕获阶段拦截已经获得确定性优先级、无需触碰它们。若拦截的代价显现，核心 seam 仍是迁移目标。

**通过 `inputActions.setDraft` 追加。** 否决：`setDraft` 替换整个编辑器文档，会销毁 chip 和撤销历史；作用域内的 insert-text 事件才是输入状态机认可的变更动词。

## Consequences

一次上传以 base64 走 JSON RPC，请求体积约为字节量的 1.37 倍，上限默认 20 MiB——需要更大文档的部署应有意识地调高 `maxFileBytes`。同时启用 chaos-at-file 时，两个插件会各为同一个 `@<dir>/...` 记号打一条标记；在意重复时请关闭其中一个标记表面。浏览器半边按渲染解析服务，插件晚加载时要等输入框下一次重渲染才出现。标记在步骤准备时验证存在性，不保证后续工具调用的持续访问。

桌面端拦截拥有自己的代价：混合粘贴所携带的文本被丢弃（文件管理器粘贴以文本形式携带路径——丢失它是接受的代价）；文档拖放期间图片栏的拖拽遮罩文案保持旧值直到合成 dragend 复位；拦截依赖核心 InputBar 拥有的 composer 卡片标记（`data-composer-card`）——该标记改名会让拦截静默退回核心的仅图片错误。

换来的是：移动端用户零核心改动就能把文档交给 agent，文件落在模型自己的工具所操作的工作区里，上传表面保持为可移除的 chaos 插件而不是核心能力承诺。

## Testing

`packages/extensions/chaos-upload/tests` 覆盖 base64 准入、文件名清洗、目录限制、冲突编号、字节上限、提及语法与标记格式、草稿末尾 span 计算，以及基于 stub 的 Remote 和输入面之上的客户端服务流程。`packages/extensions/chaos-mobile/tests/attachment-button-interaction.client.spec.tsx` 覆盖三选一菜单的三个动作、文档路由和手动引用提示。
