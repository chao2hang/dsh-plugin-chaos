# Agent Note：重启控制与崩溃恢复重试

Status: implemented

[English](2026-08-23-restart-and-crash-recovery-retry.md) | 中文

## 问题

`chaos-restart` 已经提供了可用的 `/api/system/restart` 路由，却没有任何 UI，因此它所宣称的重启能力在产品中无从触达。让它可触达又引出更难的问题：重启会杀死进行中的回合，操作者需要一条回来的路。

对此的调研暴露出一个缺口。持久化层在重新加载时已经会用 `turn/end { kind: 'interrupted' }` 关闭崩溃遗留的悬空回合，但**客户端没有任何 Definition 匹配这个 reason**。`turn-error` 和 `turn-max-tokens` 各有其一；中断这一情形依赖 ui-conversation 的「中断助手」兜底路径，而后者要求已流式产出内容作为证据（`hasInterruptionEvidence`）。在首个 token 到达前被杀死的回合——重启时的常见情形，因为回合通常正等待模型或工具——不会投影出任何东西。恢复在日志中是正确的，在 UI 中却不可见。

## 决策

三个部分，全部位于 extensions 层：

1. `chaos-retry` 贡献一个只匹配持久化写入标记的 `turn-interrupted` 节点 Definition 及其转录行。外部包可以注册 Definition（`ui-goal` 即如此），因此无需改动 `packages/client`。
2. `chaos-retry` 的检测从旧的 `session.nodes` 切片改为读取 Chat 目标（`session.chat.order` + `nodes.get`），因为贡献的节点只存在于那里。检测会跳过隐藏行和 turn-tail 页脚，以找到真正终结回合的那一行。
3. `chaos-restart` 新增浏览器半区：带能力检查、确认步骤、运行中会话警告和等待状态的「系统」设置区块。
4. `process-control` 会在派生 detached 后继进程前等待启动器拥有的 `appExit` 拆除。CLI 仅在根 fiber（包括 web listener）完成拆除后才 resolve 该回调，因此后继绑定前固定 Web 端口已经可用。

重启保持为需确认的运维动作，恢复保持为一次点击而非自动执行。

## 备选方案

**重启后自动重跑被中断的回合。** 已否决：被中断的回合可能已执行带副作用的工具，而日志无法区分「工具已完成但结果未记录」与「工具从未运行」。自动重放会静默地重复写操作。用户在此方案与「仅自动重跑无工具调用的回合」这一折中方案之间，选择了手动提示条。

**把节点 Definition 放进 ui-conversation，与 `turn-error` 并列。** 那可以说是它的自然归属——缺口就在自带节点体系里，在那里修复也能惠及未安装 chaos 插件的部署。用户选择将改动保留在扩展内；代价是未安装 `chaos-retry` 时看不到崩溃恢复行。

**把重启 UI 放进 `chaos-retry`**（它已是配置就绪的 client 包），而非将 `chaos-restart` 改造为双半区。已否决：`chaos-restart` 自身的清单早已描述了「settings page system section」，UI 本就属于它。该改造使其转入 client 聚合，并需恢复 ambient node 类型，因为它的宿主半区确实提供 HTTP 服务。

**重启后自动 rearm 活跃 goal。** 与用户共同否决：goal 在会话恢复后被有意置为 disarmed，自动 rearm 会让重启循环在无人值守下持续消耗 token。

## 后果

计时器不能证明后继进程已绑定 listener。重启动作现在以短暂不可用换取可靠的移交：它会在派生后继进程前关闭前驱 listener。无法提供这种 await 拆除的启动器会报告不支持重启。

`chaos-restart` 现在是双半区包：它从 `tsconfig.host.json` 移入 `tsconfig.client.json`（每个包只属于一个聚合），并声明 `"types": ["node", "client-build-environment"]`，因为 client 基座会丢弃其宿主半区所需的 ambient node 类型。它的宿主产物从约 1 kB 增至约 31 kB：共享的 `clientBundle` 预设只将生产依赖外置，而工作区中没有任何包把 `schemastery`/`cosmokit` 声明为生产依赖，因此它们被内联。purity 门禁通过，宿主半区加载行为不变。

该区块报告的是已接受，而非完成：它无法观测无关的后继启动失败。固定端口移交已有确定顺序，不再依赖启动窗口。

`chaos-restart` 同时补上了它从未有过的 README。其处理器会在开始拆除应用树前确认请求，使客户端可以进入重连等待。
