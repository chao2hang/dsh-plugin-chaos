# Agent Note: Web 修复中保持能力与所有权检查

Status: implemented

[English](2026-08-24-web-remediation-capability-ownership.md) | 中文

## Problem

多个 Web 路径接受的条件弱于其暴露操作所需的条件。重启在进程控制完成前确认成功，已认证的远程 WebSocket 升级被当作不受信任请求，文件路由只信任工作区路径的词法形式。客户端控件也假定能力始终可用、重复拥有 sheet 关闭责任，或将本地默认值写入 provider catalog 模型能力。

## Decision

受影响的 Host 与客户端路径现在在拥有操作的层面执行决定条件。只有进程控制成功后，重启才报告成功。事件 WebSocket 升级接受可信 API 请求或已认证请求。桌面工作区文件和 Git 操作会在使用前，将已有目标和新目标父目录解析到会话工作目录之下。

客户端能力编辑器保留初始有效值，并且只写入用户修改的字段，从而保留 catalog 提供的图片输入和推理配置。sheet 菜单在 sheet 内导航嵌套条目，sheet 模式只有一个 Escape 关闭所有者。可选客户端服务和原生文档操作只在对应能力可用时调用。

## Alternatives considered

**保留乐观确认或词法路径检查。** 拒绝，因为调用者会在所拥有操作完成前观察到成功，符号链接也能将词法有效的工作区路径重定向到允许目录之外。

**每次保存都写入完整模型能力对象。** 拒绝，因为本地 override 无法区分继承的 provider 能力和显式的负值；未修改字段必须保持缺失。

**在移动 sheet 中保留桌面 hover 子菜单。** 拒绝，因为其定位子列表位于 sheet 外，hover 无法提供触摸交互路径。

## Consequences

已认证远程客户端可以维持事件连接，而不扩展可信主机规则。工作区文件访问遵循真实文件系统目标，而非请求拼写。除非用户明确 override，catalog 能力仍由 provider 拥有。移动 sheet 菜单通过可达的下钻视图暴露嵌套选项，Escape 每次只关闭一个 sheet 表面。

聚焦的 Host、扩展和客户端测试覆盖了变更路径；客户端 catalog 已重新生成并检查。API proxy 现在通过专用 client project 编译其 browser-safe API 与 fetch client，使 Host Context 声明不再进入 client aggregate。其他既有 client test 与 Web e2e project 错误不属于本次修复。
