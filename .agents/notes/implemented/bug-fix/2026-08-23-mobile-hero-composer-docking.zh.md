# Agent Note: 移动端 hero 输入框停靠

Status: implemented

[English](2026-08-23-mobile-hero-composer-docking.md) | 中文

## 问题

在手机上，新会话 hero 将输入框堆栈在列内 flex 居中：输入卡片悬浮在屏幕中部、下半屏全空；点击模型 chip 后，紧凑模型菜单弹在屏幕底部——远离触发点。该菜单钉在 `calc(88px + safe-area-inset-bottom)`，即"已停靠输入框"的位置，因此居中的 hero 破坏了一切以它为锚的控件的契约。

## 决策

设置 `data-chaos-mobile` 时，`mobile.css` 通过稳定的 `[data-phase='hero'] [data-conversation-scroll]` 锚点将 hero 阶段的滚动主体改为底部停靠（`justify-content: flex-end`）。hero 品牌区与工作区行随卡片一起下移；桌面端居中规则不受影响。

## 考虑过的替代方案

**把底部弹窗改锚到 hero。** 否决：所有底部锚定的弹窗共享"已停靠输入框"契约，逐个改锚等于重复同一修复，而悬浮卡片本身仍是坏的。

**通过 fork 自有的 hero 组件停靠。** 否决：为改一个布局属性而复制整套阶段 chrome；稳定的 data-phase 锚点已经标出了滚动主体。

## 后果

手机端 hero 输入框停靠在列底，所有底部锚定的弹窗都在触发点旁边打开。`apps/web/tests/mobile-hero-composer.e2e.ts` 在手机视口下钉住两处几何：卡片距屏底不超过 64px，打开的菜单距触发点顶部不超过 80px。
