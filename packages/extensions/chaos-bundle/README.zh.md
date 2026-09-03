# `@deepseek-ai/dsh-plugin-chaos`

[English](README.md) | 中文

Chaos 插件 bundle：web-app 层之上的组合层，把 chaos 插件集声明为包依赖，并插入可选的 `chaos-think-tags` 行。

## 组合

web-app bundle 已经插入了 `chaos-mobile`、`chaos-auth`、`chaos-restart`、`chaos-models`、`chaos-retry` 和 `process-control`。本包的 `cordis.patch.yml` 只添加一行可选项：

| 行 | 包 | 用途 |
|---|---|---|
| `chaos-think-tags` | `@deepseek-ai/dsh-plugin-chaos-think-tags` | 通过会话推理展开项渲染 assistant think-tag 输出 |

## 用法

将 bundle 加入 profile 的 bundles 列表，即可把 chaos 插件集安装为其依赖并插入 think-tag 渲染行：

```yaml
# In the profile's bundles list:
- '@deepseek-ai/dsh-plugin-chaos'
```

也可以在你自己的 patch 层中添加单个插件。

## 配置

auth 插件通过 credentials 系统读取 token（默认环境变量 `DSH_AUTH_TOKEN`）。启动服务器前在 `.env` 或 shell 环境中设置：

```sh
export DSH_AUTH_TOKEN="your-secret-token"
dsh --profile web --host 0.0.0.0
```

## 主仓库扩展点

本 bundle 依赖主仓库开放的四个通用扩展点：

1. **WebServer 守卫**（`dsh-host-webserver`）：`registerGuard`、`registerUpgradeGuard` 与 TLS 配置。auth 插件要求 dsh 构建同时导出两个 Guard API；旧版 WebServer 会在 auth 激活时失败。
2. **ConnectionHandle.authenticated**（`dsh-client-connection`）：允许已认证的远程会话访问设置/凭据。
3. **ProcessControl 服务**（`dsh-process-control`）：用于进程替换的 `canRestart` 与 `restart()`。
4. **LlmModelInfo 扩展**（`dsh-llm`）：`contextWindow`、`maxOutput`、`capabilitiesEditable` 字段。

它们都被设计为通用扩展点，而非本 bundle 专用。

## 模型体验

无。本包是组合补丁，自身没有运行时；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延后工作

- **Auth 插件集成**：auth 插件需要 `credentials` 服务解析 token；缺少它的组合会禁用登录。
- **Electron 上的重启**：ProcessControl 服务通过 `process.execPath` 派生后继进程；Electron 构建可能需要不同的启动机制。

**运行时不变式：** 不发布伴生入口。本包是组合补丁（cordis.patch.yml），自身不持有任何运行时注册、服务或可变状态。
