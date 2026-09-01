# Agent Note: mobile model selector viewport

Status: implemented

[English](2026-08-23-mobile-model-selector-viewport.md) | 中文

## Problem

模型弹窗原本相对触发按钮定位。在窄手机视口中，输入框的相邻控件可能裁剪该按钮，使宽模型列表超出可见页面。

## Decision

模型弹窗读取 `visualViewport.width`。可见宽度不超过 600px 时，会添加固定视口 class，并使用安全区域感知的输入框偏移量和相对视口的高度上限。即使手机 Chrome 的布局视口仍是桌面尺寸，该条件也能识别手机端。桌面端仍保留相对触发按钮的定位。

## Consequences

每个模型行都会留在手机视口内，必要时在弹窗内部滚动。手机端菜单不再依赖可能被裁剪的触发按钮位置。
