# Agent Note: 移动端 overlay 动作遵循布局服务

Status: implemented

[English](2026-08-22-mobile-overlay-layout-actions.md) | 中文

## 问题

`chaos-mobile` 通过 `shell.overlay` 渲染菜单和详情关闭控件，但它只读取一次 `ctx.get('layout')`，并将结果写入 `window.__chaos_layout`。该插件没有声明 `layout` 为必需服务，因此组合顺序可能导致全局值永久缺失。两个控件随后都会静默忽略按下操作。

## 决策

`chaos-mobile` 要求 `layout`，并向其 `shell.overlay` 条目注入范围收窄的 `toggleSidebar` 和 `closeDetails` 回调。`MobileOverlay` 直接调用这些回调。`ui-layout` 仍然拥有面板状态，其 `data-sidebar-collapsed` 和 `data-details-collapsed` 属性仍是抽屉、遮罩层和详情关闭控件可见性的来源。

## 曾考虑的替代方案

**保留 window bridge。** 可变全局引用绕过 Cordis 的依赖顺序，在渲染条目中没有类型化所有者，并且控件保持可见时它也可能缺失。

**为 chaos-mobile 提供第二个面板存储。** 重复存储需要与 `ui-layout` 同步每一次状态转换，并且可能与 CSS 已消费的 AppFrame 属性发生偏离。

**将整个 layout 服务传给组件。** overlay 只需要两个命令。注入这些回调使组件独立于无关的布局操作，同时仍将服务保留为它们的实现所有者。

## 后果

移动端按钮点击现在会在任意插件挂载顺序下触发与桌面 shell 相同的服务动作。jsdom 组件测试覆盖菜单、遮罩层和详情关闭点击，组合测试验证注入的回调调用当前的 `ctx.layout` 动作。未来的面板动作必须显式增加 overlay 回调和测试，不能再增加浏览器全局变量。
