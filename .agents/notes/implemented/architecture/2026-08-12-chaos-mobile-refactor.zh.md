# Agent Note: 将 chaos-mobile 从 CSS 劫持重构为 iOS 风格移动呈现

Status: implemented

[English](2026-08-12-chaos-mobile-refactor.md) | 中文

## 问题

`chaos-mobile` 插件通过 22 处 `[class*=...]` 选择器匹配 CSS Modules 的哈希类名片段，加上 37 处 `!important` 覆盖，将桌面布局适配为移动端。ui-layout 的 AppFrame CSS Modules 中任何重命名都会导致移动端整体失效。弹窗被 `[role='dialog'], [role='menu'], [role='listbox']` 的 CSS 覆盖全局劫持，与仍在运行的 JS portal 定位逻辑冲突。没有导航模型（详情是带浮空关闭按钮的全屏覆盖层），没有 sheet 交互模式（抓手、detent、拖拽关闭、焦点陷阱），且悬停驱动的交互（Tooltip、pointer-grace、hover 显形）在触屏设备上不可达。

## 决策

跨越两个客户端包和插件的三项协同变更：

1. **ui-layout 发布稳定布局锚点**：AppFrame 在其结构节点上发出 `data-shell-column="sidebar|center|details"`、`data-shell-handle` 和 `data-shell-frame`。这些被记录为契约：重命名或删除它们需要协同更新 chaos-mobile。测试断言它们的存在和状态变化。

2. **ui-primitives 开启 SurfacePresentation 接缝**：一个模块级 store（`useSyncExternalStore`）让 Modal、Menu 和 Tooltip 询问应以内联（桌面）还是底部 sheet（移动端）方式呈现。默认为 inline 且无 sheet 呈现器，桌面行为不变。当调用 `setSurfacePresentation({ mode: 'sheet', presentAsSheet })` 时，Modal 和 Menu 将内容委托给呈现器（由呈现器拥有遮罩、抓手、detent、拖拽关闭），而 Tooltip 抑制气泡。store 为模块级而非 React context，因为 Modal 和 Menu portal 到 `document.body`——React 树中的 context provider 无法触达它们。三者都发出稳定的 `data-surface` 属性。

3. **chaos-mobile 成为薄移动外壳**：`MobileOverlay` 在挂载时（移动视口）调用 `setSurfacePresentation`，在桌面/卸载时调用 `resetSurfacePresentation`。`MobileSheet` 提供基于 token 的玻璃 sheet；可访问的抓手可在 medium/large detent 之间停靠，只有继续向下拖拽才会关闭，同时保留滚动锁、焦点陷阱和 reduced-motion 行为。`MobileNavBar` 是 44pt 半透明导航栏，取代浮空汉堡和关闭按钮——CSS 由 `data-details-collapsed` 驱动，在菜单开关和返回之间切换左侧按钮。`mobile.css` 仅针对稳定的 `data-shell-*` 属性：列和手柄的 `[class*=]` 选择器降为零（headerUtilities 还剩一处，为已知限制）。

附加移动交互：`useKeyboardInset` 通过 Visual Viewport API 追踪屏幕键盘；`useEdgeSwipe` 提供边缘滑动打开抽屉；每条非空白 Session 行右滑显示既有的重命名／分叉控件、左滑显示归档，不会直接执行操作或打开 Session；`history.pushState` 集成使系统返回键关闭详情推进页（iOS 返回导航模型）。

## 考虑的替代方案

### 为何不替换 root slot？

将 chaos-mobile 自己的 AppFrame 以更低优先级注册到 `root` 单一 slot 会影子覆盖 ui-layout 的 AppFrame，但影子条目无法重新声明其子 slot（`sidebar`、`conversation`、`details`、`shell.overlay`）——`SlotCore.register` 抛出 `slot "sidebar" is already declared`，因为第一个注册方已拥有这些声明。影子覆盖而不重新声明意味着影子组件无法调用 `renderSlot('sidebar', ...)`，因为它没有渲染授权。这条路径在类型和运行时层面都被封死。

### 为何不用更强选择器的纯 CSS 方案？

用更具体的匹配强化 `[class*=]` 选择器，在 CSS Modules 哈希变化时仍会失效。根本脆弱性在于 CSS Modules 类名是所属包的实现细节，不是契约。稳定的 data 属性才是正确的契约表面。

### 为何自建 MobileSheet 而非使用 vaul / react-modal-sheet？

sheet 必须与 ui-primitives 的 `SurfacePresentation` 接缝集成（接受 `children`、`onClose`、`title` 作为 props），遵循仓库的 `--dsw-*` token 体系，尊重 `prefers-reduced-motion`，且不引入仓库不携带的 React 版本或样式系统依赖。sheet 的范围有界：抓手、两档 detent、拖拽关闭、焦点陷阱、滚动锁——约 120 行的组件是合适的尺寸。

### 为何用模块级 store 而非 React context 实现 SurfacePresentation？

Modal 和 Menu 通过 `createPortal` 将内容 portal 到 `document.body`。chaos-mobile 的 MobileOverlay 所在的 `shell.overlay` slot 是会话/侧边栏列的同级，不是 portal 内容的祖先。React context 无法跨越 portal 边界触达，除非在 document-body 级别有 provider，而没有任何插件拥有这一层。模块级 store 配合 `useSyncExternalStore` 可触达每个消费方，不受 React 树位置限制。

## 后果

- chaos-mobile 的 `mobile.css` 从 322 行降至 191 行；`[class*=]` 选择器从 22 处降至 1 处（headerUtilities，已知限制）；`!important` 从 37 处降至 23 处。
- 桌面行为可证明未变：ui-layout + ui-primitives 的 575 个已有测试全部无修改通过；8 个新 SurfacePresentation 测试断言默认 inline 模式产生相同 DOM。
- `SurfacePresentation` 接缝是一个能力接缝（Service Definition 在 ui-primitives，Provider 在 chaos-mobile）：从 web profile 移除 chaos-mobile 即可零代码变更恢复桌面形态。
- 一项已知限制保留：`[class*='headerUtilities']` 在 ui-conversation 中尚无稳定 data 锚点。添加锚点是需协调的上游变更，暂缓至后续工作。
- `history.pushState` 集成拥有详情推进页的返回键；未来的路由插件需要协调所有权。
