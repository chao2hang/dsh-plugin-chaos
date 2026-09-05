# `@deepseek-ai/dsh-plugin-chaos`

[English](README.md) | 中文

Chaos 插件组合层：在 web-app 层之上组合全部 chaos 插件。

## Composition

bundle 的 `cordis.patch.yml` 插入这些行（web-app bundle 已插入 chaos-mobile、chaos-auth、chaos-restart、chaos-models、chaos-retry 与 process-control）：

| Row | Package | Purpose |
|---|---|---|
| `chaos-think-tags` | `dsh-plugin-chaos-think-tags` | 可选的思考标签渲染器 |
| `chaos-janitor` | `dsh-plugin-chaos-janitor` | 保留清理器：日志静默超过 `maxArchivedDays`（默认 0 不清理）即删除归档会话 |

## Usage

把 bundle 加入 profile 即可启用全部 chaos 插件：

```yaml
# In the profile's bundles list:
- '@deepseek-ai/dsh-plugin-chaos'
```

或在自建 patch 层里加单个插件。

## Configuration

auth 插件通过 credentials 系统读取 token（默认环境变量 `DSH_AUTH_TOKEN`）。启动前在 `.env` 或 shell 环境中设置：

```sh
export DSH_AUTH_TOKEN="your-secret-token"
dsh --profile web --host 0.0.0.0
```

## Main-repo Extension Points

本 bundle 依赖主仓库打开的三个通用扩展点：

1. **WebServer 守卫**（`dsh-host-webserver`）：`registerGuard`、`registerUpgradeGuard` 与 TLS 配置。
2. **ConnectionHandle.authenticated**（`dsh-client-connection`）：已认证远程会话可访问设置/凭据。
3. **ProcessControl 服务**（`dsh-process-control`）：进程替换的 `canRestart` 与 `restart()`。
4. **LlmModelInfo 扩展**（`dsh-llm`）：`contextWindow`、`maxOutput`、`capabilitiesEditable` 字段。

均为通用扩展点设计，不特定于本 bundle。

## Known Limitations and Deferred Work

- **Auth 插件集成**：auth 插件需要 `credentials` 服务解析 token；缺少该服务的组合会禁用登录。
- **Electron 上的重启**：ProcessControl 服务经 `process.execPath` 生成后继进程；Electron 构建可能需要不同的启动机制。

No runtime invariant companion is published; the bundle is a distribution format for config rows and owns no runtime code.
