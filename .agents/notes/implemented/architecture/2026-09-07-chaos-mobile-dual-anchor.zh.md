# Agent Note：chaos-mobile 在已发布前端上——双锚点与插件自有的详情推页

状态：已实现

[English](2026-09-07-chaos-mobile-dual-anchor.md) | 中文

## 问题

`chaos-mobile` 是面向 fork 的 0.1.3-alpha.1 web 客户端构建的，其 AppFrame 会发出 `data-shell-frame`、`data-shell-column` 和 `data-shell-handle`。已发布的 `dsh` 0.1.2-rc.1 AppFrame 完全不发这些属性：只有 `data-sidebar-collapsed` / `data-details-collapsed`（仅在折叠时存在，且为 frame 独占）、slot 座位和 overlay 层。全局安装切换到发布构建后，chaos-mobile 的所有选择器全部失配：抽屉 CSS 从未生效（侧边栏停留在 core 的 56px 图标栏，而没有变成滑入抽屉），模型选择菜单渲染被裁剪，每个名字的前 56px 被图标栏遮住。

## 决定

**双锚点 CSS。** 每条布局规则现在同时面向两种运行时。fork 前端保留 `data-shell-*` 锚点；已发布前端用结构性锚点：

- frame 是唯一以 overlay 层为直接子元素的内容——`:has(> [data-shell-overlay])`——overlay 层在两种运行时中都是 frame 的直接子元素，它取代 `data-shell-frame` 承担 frame 级规则（移除 core 折叠图标栏的单列 grid 覆写）。
- 列由列内直接的 `data-slot` 渲染座位识别（`:has(> [data-slot='sidebar'|'conversation'|'details'])`）。
- 打开/关闭转换在 html 级探测——`:not(:has([data-sidebar-collapsed]))` 及 details 的同款形式——这依赖两个状态属性保持 frame 独占，而所有已发布前端中它们确实如此。

**禁止嵌套 `:has()`。** Chrome 151 把嵌套 `:has()` 判为非法选择器并静默丢弃整条规则；第一次 grid 覆写尝试（`:has(> :has(> [data-slot=…]))`）正是这样被丢弃的，而同样式表的其他规则继续工作，使故障看起来像应用层问题。回归测试禁止样式表中的 `:has(> :has(` 与 `:has(:has(`；单层的 `:has(> …)` 和 `:not(:has(…))` 仍然合法，是唯一使用的形式。

**详情推页由插件自有。** core 的列求解器保持 640px 的 center 下限，因此视口低于约 996px 时它永远无法把详情列渲染为打开——手机上 `data-details-collapsed` 因此永远不会翻转，任何基于该属性的可见性或历史机制在那里都是无效信号（fork 运行时同样如此，它发布的是同一个求解器）。overlay 现在拥有推页的打开状态：溢出菜单的打开入口设置该状态并镜像为 `<html data-chaos-details-open>`，驱动 sheet 可见性与导航栏返回/菜单状态。布局 store 同时被写入（`openDetails` / `closeDetails`），以便宽视口运行时在重新拉宽时恢复真实列。sheet 从 44px 导航栏下方开始，使 core 详情头部自带的关闭按钮保持可达，overlay 拦截该按钮以关闭页面。每次打开推送一个历史条目，任何页内关闭或卸载时移除；系统返回键的 popstate 与导航栏返回按钮共享同一条关闭路径。

## 备选方案

**补丁已发布的 dsh 或从 fork 运行服务。** 被所有者否决：插件必须兼容已安装的 dsh，而不是反过来。

**从布局 store 驱动 sheet。** 不可行：store 在 ui-layout 之外不暴露，而 frame 唯一的外部信号是求解后的 grid，它在窄视口下按构造强制 details 为 0。

**保留 0.1.3 的属性驱动详情机制作为回退。** 因为求解器下限，它在所有已发布运行时上都是死代码，因此被替换而不是作为第二信号源保留。

## 后果

该插件在 fork 与已发布前端上都能完整渲染，无需配置。详情推页现在能在手机上打开和关闭——这是此前做不到的、经过端到端验证的真实行为修复。代价：sheet 与导航栏返回/菜单状态除 ui-layout 的属性外还依赖一个插件自有的属性，已记录在 README 已知限制中；且两个状态属性必须继续保持 frame 独占，html 级探测才保持可靠。

## 测试

`pnpm exec vitest run packages/extensions/chaos-mobile`——94/94，包括新的状态驱动详情历史测试（从溢出菜单打开、经 core 关闭按钮关闭、系统返回、双重 popstate 无操作）和嵌套 `:has()` 样式表禁令。针对带完整配置的真实 0.1.2-rc.1 启动的 Playwright iPhone 13（390x660）通过 17/17：单列 grid、屏外固定抽屉、未裁剪的模型菜单、会话选择、详情推页打开加两条关闭路径、桌面三列回归、无控制台错误、无 4xx。
