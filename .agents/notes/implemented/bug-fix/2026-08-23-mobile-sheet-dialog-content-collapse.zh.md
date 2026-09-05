# Agent Note: 移动端 sheet 对话框内容塌缩

Status: implemented

[English](2026-08-23-mobile-sheet-dialog-content-collapse.md) | 中文

## 问题

在手机上，通过 chaos-mobile 底部 sheet 打开的工作区目录对话框只显示头部和底部：主目录列表已经返回、行也已渲染，但 Miller 分栏塌缩为零高度，所有行都被裁剪出视野。

桌面端 Modal 卡片是固定 500px 的 flex 列，浏览器的 `.content { flex: 1 1 0 }` 因此获得确定高度。而 sheet 的主体原本是普通块级滚动容器：没有任何东西给内容区确定高度；又由于 Miller 行和各分栏都是滚动容器（`overflow` 非 `visible`），其内容对内在尺寸（intrinsic sizing）贡献为零——整条自动高度链在每一层都解析为 0px。

## 决策

MobileSheet 的主体改为确定高度的 flex 列（`display: flex; flex-direction: column; min-height: 0`），与桌面卡片的布局契约一致。headless 对话框内容继续拥有自己的弹性中部；sheet 只保证该中部所需的父级。菜单与其他 sheet 表面布局不变（全宽块级子元素作为 auto 高度的 flex item 表现相同）。

## 后果

目录选择器在手机上可见地列出条目；`apps/web/tests/mobile-directory-picker.e2e.ts` 在手机视口下钉住行几何，对塌缩布局会失败。未来任何带弹性中部的 headless sheet 对话框都按构造获得正确尺寸，无需重新推导。
