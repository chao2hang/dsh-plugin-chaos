# Agent Note：所有原生路径打开入口都以已上报的能力为准

Status: implemented

[English](2026-08-23-native-open-affordance-gating.md) | 中文

## 问题

在一台没有可用桌面的 Linux Host 上（无 `DISPLAY`/`WAYLAND_DISPLAY`，也没有 `xdg-open` 二进制），点击聊天工具行里的文件路径仍会触发 `host.openPath`。spawn 以 `ENOENT` 失败，而错误抵达对话框时前缀被叠加了两层——`path open failed: path open failed: spawn xdg-open ENOENT`——因为网关包装一次（`openTarget`），客户端运行时的 `workspaces.openPath` 又包装一次。设置页在上一层有同样的洞：`settings.describe` 只凭提供方（`documentPath !== undefined`）上报 `hasDocument`，于是"打开配置文件"按钮照常渲染并同样失败。其余每个界面（交付物、预设位置、工作区浏览器）早已查询 `host.describe.canOpenPath`；这两处只是绕过了它。

## 决策

- `ui-tool`：`ToolCallOwnerProps.openFile` 改为可选。`ToolCallTree` 从注入的 host-description hook 推导 `canOpenPath`，当 Host 未声明该能力时省略 opener；行组件本就在没有 opener 货币时把 `filePath` 渲染为纯文本，因此死入口直接消失，无需改动任何行。
- `dsh-host-apiproxy`：`settings.describe.hasDocument` 现在除提供方文档外还要求 `canOpenPaths()`。原生交接是该标志的唯一消费方，agent-preset 名册今天就用 `canOpenPaths()` 划的同一条线。
- 点击 read 摘要链接的 e2e 泳道（`seeded-history`、`navigation-panes`）通过共享的 `native-open.overlay.yml` 钉住 `nativeOpen: true`，与既有的 `produced-files.overlay.yml` 模式一致。

## 曾考虑的替代方案

**包装或本地化失败文案而不是隐藏控件。** 否决：这类主机上的点击永远不可能成功，每次点击只会继续制造一个注定失败的对话框。

**新增扩展 seam 让其他插件替换打开器。** 暂缓：当前没有消费方需要替换 `xdg-open`；能力标志加平台检查已经能判定可达性，没有属主的 seam 只会是投机设计。

## 后果

- 无头部署中，工具行的文件路径显示为不可点的文本，设置文档动作被隐藏，不再每次点击都失败。
- 检测结果会误导的部署（容器里设了 `DISPLAY` 却什么都看不见）应设置网关的 `nativeOpen: false`；此次修复之后该开关同样覆盖这两个界面。
- 在具备能力的宿主上真正打开失败时，客户端侧的双层前缀仍然存在（`workspaces.openPath` 会再包一层服务端消息）；去除它需要改动面向 wire 的快照，收益仅是观感，暂缓处理。
