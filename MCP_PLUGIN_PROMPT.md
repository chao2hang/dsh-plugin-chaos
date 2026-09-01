# 插件开发提示词：为 DeepSeek Harness 的 MCP client 增加设置页面管理

## 目标

在 Web 设置页面的 Plugins -> Plugin configuration tab 中，增加一个可视化的 MCP server 管理 card，让用户能在浏览器里增删改 MCP server 配置，而不是手动编辑 cordis.patch.yml。

---

## 必须先理解的架构（这些是事实，不要假设）

DSH 的设置页 card 由两半拼成，两者必须同时存在 card 才会显示：

### 1. Host 侧（node half）
插件通过 `installSettingsSection(ctx, ns, schema, entry, hooks)` 注册一个 settings namespace。
- 函数位置：`packages/settings/settings/src/index.ts:863`
- namespace 构造器：`settingsNamespace('xxx')`，位于同包 `src/index.ts:26`
- 注册后它出现在 `describe()` 的服务列表里，浏览器端的 tab 从 `settingsScope.describe()` 派生出"当前服务的哪些 namespace"
- 参考实现：`packages/shell/bash-local/src/index.ts:128`

### 2. Browser 侧（client half）
一个 `dsh.client` 包，在 `apply(ctx)` 里用 `ctx.slots.inject('settings.plugin.item', ...)` 注册一个 card，`key` 等于 Host 侧的 namespace 名。
- 参考实现：`packages/client/ui-settings-plugins/src/client/index.ts`（BashCard/AgentLoopCard/WebSearchCard 三个 card 的注册）

两边通过 namespace 字符串键匹配，互不知道对方存在。card 的 UI、表单 staging、revision fencing 逻辑必须由 card 自己拥有（见下文约束）。

---

## 关键架构难点（必须正面处理）

现有的三个 card（shell/agent-loop/web-search）都是单 namespace 单实例的标量字段编辑。但 MCP 不同：

- `dsh-mcp-client` 是每个 server 一个插件实例（cordis.yml 里 insert N 行就有 N 个实例）
- 每个实例的 Config 是 union（`StdioConfig | StreamableHttpConfig`），含 `command`/`args`/`env`（可信可执行代码）或 `url`/`headers`
- 现有 settings 模型是"schema defaults -> composition base -> user document"三层合并，`update(ns, patch)` 深合并，`replace(ns, section)` 整体设置，`mutate(ns, ops)` 做 set/unset。它设计来覆盖字段，不是管理一个可增删的实例列表

因此不能简单复制 BashCard 模式。你需要在提示词里明确选择一条路径并说明理由。

---

## 推荐方案：独立管理插件 + patch 层写入

创建一个新的独立插件包（同时含 Host half 和 client half），拥有一个 settings namespace（例如 `mcp-servers`）。这个 namespace 的值是一个"server 条目列表"数据结构。插件监听 namespace 变更，把列表写回到 profile 的 `cordis.patch.yml`（insert/update/remove 对应的 mcp-client 行），让 Loader 的 HMR 热重载去真正生效。

理由：保持 mcp-client 本身不动（它的 Config/transport/重连逻辑不受污染），管理责任分离到独立插件，符合项目"everything is a plugin"的哲学。

> 替代思路：直接给 `dsh-mcp-client` 加 namespace + card。但因 mcp-client 是多实例插件，每个实例各自注册 namespace 会冲突，需要把 namespace 名和 `serverName` 绑定。这条路更贴近现有 card 模式但更复杂，可作为备选。

---

## 具体交付物

### A. Host half 插件包（node）

1. `package.json`：ESM、`type: module`，peerDeps 含 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-settings`，devDeps 含 `@deepseek-ai/dsh-invariants`

2. `src/index.ts` 的 `apply(ctx, config)`：
   - 用 `settingsNamespace('mcp-servers')` 定义 namespace（或你选的名字）
   - 用 schemastery（`@deepseek-ai/schemastery`）定义 schema：server 条目的数组/对象结构（serverName/transport/command/args/env/url/headers/toolCallTimeoutMs 等）
   - 用 `installSettingsSection(ctx, NS, schema, entry, { setSource, onChange, validate })` 注册
   - `onChange` 里把当前值序列化回 `cordis.patch.yml`（注意 patch 层的 insert/update/replace 行语义：后层 replace 前层整行 config，不深合并）
   - 安全 validate：command/env 是可信代码，要考虑是否需要显式确认/审计（参考 CLI README 的安全立场："no MCP server is enabled by default because each server command is trusted executable code outside the agent sandbox"）

### B. Client half 插件包（browser）

1. `package.json`：声明 `"dsh": { "client": { "inject": [...], "platform": "web" } }`，inject 含至少 `@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`。`exports["./client"]` 指向构建产物

2. `src/client/index.ts` 的 `apply(ctx)`：`ctx.slots.inject('settings.plugin.item', ...)` 注册 card，`key` 等于 A 中的 namespace 名

3. Card 组件（.tsx）：
   - 列出当前 server 条目，每条可展开编辑，支持新增/删除
   - 复用 `card-form.ts` 的 staging 模式（draft -> save 才写），但列表场景下 `CardForm` 的单字段模型不够用，需自己实现类似的 staging + revision fencing（或用 `replace(ns, section)` 整体提交，带 `expectedRevision`）
   - 不要从 `ui-settings-plugins` 导入 `PluginCard`/`fields.tsx`/`card-form.ts` 的值（见约束），自己拥有 UI

4. `tsdown.config.ts`：用 `clientBundle(...)` preset（`packages/client/tsdown.client.ts`）构建成 closure-factory artifact

---

## 必须遵守的约束（来自仓库实际规则，违反会被构建/测试拒绝）

1. **Client bundle 纯度门（bundle-purity gate）**：client 包不得从现有 card chrome/form model 导入值（例如不能 `import { PluginCard } from '@deepseek-ai/dsh-client-ui-settings-plugins/...'`）。card 必须自己拥有 staging 和 revision fencing。跨插件协作只能走服务（`ctx.settingsScope` / `ctx.slots` / `ctx.remote`）和 type-only import

2. **client 包不得依赖 Host 包**：namespace 名称在 client 侧重新拼写（见 `bash-card-controller.ts` 里 `SHELL_NS = 'shell'` 的注释明确说明此点）

3. **ESM 到处**，`"type": "module"`，跨包用包名、本地相对引用用 `.ts`（tsx/esm hook 要求）

4. **所有 export 都要 JSDoc**（`verify-export-jsdoc`）；`strict` + `noImplicitAny`；不要硬编码可调参数，用 `Config` 字段

5. **settings 不是可信代码执行边界**：`command`/`env` 属于沙箱外可信代码，UI 上要有明确的安全提示，最好默认不预填可执行路径

6. **`redactSecrets` 的局限**：`role('secret')` 字段（如 token）不会在 wire 上返回。类似 WebSearchCard 的凭证写法：用 write-only 的 `CardSecretSpec`，或走 credentials domain（`ctx.remote` 的 credentials 写入），而不是普通 `CardFieldSpec`。`headers`/`env` 里的 token 同理

7. **所有写都带 `expectedRevision`**（settings service 的乐观锁），冲突时收 `SETTINGS_CONFLICT`，card 要能 re-read 并保留 draft 供用户修正

---

## 应该阅读的参考文件（按优先级）

- `packages/client/ui-settings-plugins/src/client/index.ts` — card 注册的完整样板（`slots.inject` 用法）
- `packages/client/ui-settings-plugins/src/client/bash-card-controller.ts` + `BashCard.tsx` — 最简单的标量 card 参考
- `packages/client/ui-settings-plugins/src/client/web-search-card-controller.ts` — 凭证/secret 字段的写法参考
- `packages/client/ui-settings-plugins/src/client/card-form.ts` — staging + revision fencing 的实现（理解后自己实现列表版本）
- `packages/client/ui-settings-plugins/README.md` — 扩展点和 Known Limitations 的权威说明
- `packages/settings/settings/README.md` — settings service 完整契约（`update`/`replace`/`mutate`/revision/`redactSecrets`）
- `packages/settings/settings/src/index.ts:863` — `installSettingsSection` 签名
- `packages/mcp/mcp-client/src/index.ts` — mcp-client 的 Config union（你的 card schema 要对齐它）
- `packages/client/tsdown.client.ts` — `clientBundle` preset（构建配置）
- `apps/cli/reference/README.md` — patch 层的 insert/`cordis.patch.yml` 语义和热重载行为

---

## 验收标准

- [ ] Host half 注册的 namespace 出现在 `settingsScope.describe()` 里（可用 `--dump-config` 验证）
- [ ] card 在设置页 Plugin configuration tab 出现（namespace 和 key 匹配）
- [ ] 在 UI 增加一个 server 并保存后，`cordis.patch.yml` 出现对应 mcp-client 行，且 HMR 热重载后模型能看到 `mcp__<serverName>__<tool>` 工具
- [ ] 删除/编辑 server 同理生效
- [ ] token 类字段不在响应里明文出现，只显示"已配置"
- [ ] `pnpm run build` 通过（含 bundle-purity gate、`verify-export-jsdoc`）
- [ ] 并发编辑冲突时收 `SETTINGS_CONFLICT`，card re-read 并保留 draft

---

## 开放问题（开发前需决定）

1. server 列表存在哪个 `cordis.patch.yml`？home 级（机器全局）还是 profile 级？
2. 列表写回时用整体 replace 还是精细 insert/update/remove 单行（影响和用户其他手动 patch 的合并）？
3. 是否需要连接状态/工具列表的只读展示（类似 plugin-inventory tab）？如果要，需要 mcp-client 暴露状态，这超出当前实现。
