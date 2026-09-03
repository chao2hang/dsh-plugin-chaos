# `@deepseek-ai/dsh-plugin-chaos-mobile`

[English](README.md) | 中文

DeepSeek Harness Web GUI 的移动适配插件。

## 目的

在宽度低于 768px 时，该插件在不替换状态所有者的前提下适配现有布局：

- 44pt `MobileNavBar` 取代浮空汉堡和关闭按钮：左侧显示菜单开关（详情面板打开时显示返回按钮），中间显示当前会话标题和智能体模式，右侧显示单个溢出按钮。
- 侧边栏变为带背景遮罩的滑入抽屉，通过导航栏菜单开关打开。
- 详情列变为全屏推进页，通过导航栏返回按钮关闭。
- `MobileSheet` 将 Modal 和 Menu 呈现为 iOS 风格的玻璃面板：可访问的拖拽把手可在中等和大停靠高度之间切换，向下拖拽才会关闭；它还通过 ui-primitives 的 `SurfacePresentation` 接缝提供滚动锁定和焦点陷阱。
- `Tooltip` 在移动端完全抑制气泡（触屏设备无悬停）。
- 安全区内边距、动态视口高度和 44px 最小触控目标改善触屏体验。
- 通过 Visual Viewport API 持续跟踪可见高度和垂直偏移，输入栏在移动端键盘导致视口平移时仍贴住可见底部。
- 输入栏包含图片附件按钮，使用现有的准入、预览、限制和移除流程。
- CSS 针对稳定的 `data-shell-column`、`data-shell-frame`、`data-shell-handle` 和 `data-conversation-session-header` 锚点编写选择器——不使用 `[class*=]` 哈希类名选择器。

桌面宽度保留 ui-layout 未修改的三栏框架、拖动手柄和列求解器。

## 组合

客户端插件将 `MobileOverlay` 添加到 ui-layout 的 `shell.overlay` slot，将 `AttachmentButton` 添加到 `conversation.input.left`。它声明 `slots`、`conversation`、`layout` 和 `ui-primitives` 为必需服务。overlay 注册从 `ctx.layout` 注入 `toggleSidebar` 和 `closeDetails` 回调。挂载时，overlay 调用 `setSurfacePresentation({ mode: 'sheet', presentAsSheet })` 为所有 Modal/Menu/Tooltip 实例激活 `MobileSheet` 呈现器；卸载或桌面端时调用 `resetSurfacePresentation()`。

## 配置

无需配置。从 Web profile 的 `cordis.patch.yml` 中移除 `chaos-mobile` 一行即可使用不带移动适配的桌面布局。

## 模型体验

无。该浏览器侧插件不注册模型上下文或工具 schema。

#### KV Cache 影响

该插件不改变模型请求，因此不增加 token 也不改变 KV Cache 复用。

## 已知限制与暂缓事项

- **布局选择器**：抽屉和 sheet 的 CSS 针对 ui-layout 的稳定 data 属性（`data-shell-frame`、`data-shell-column`、`data-sidebar-collapsed`、`data-details-collapsed`）。这些属性的变更需协同更新。
- **历史集成**：详情推进页尚未拦截 `history.pushState` 以支持系统返回键。计划在后续工作中实现。

**运行时不变式：** 不发布伴生入口。本包只提供浏览器呈现；面板状态及其可观察的状态转换归 ui-layout 所有。
