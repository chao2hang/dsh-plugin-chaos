# Agent Note: 手机端弹窗以大型档位打开并固定操作行

Status: implemented

[English](2026-09-05-mobile-sheet-dialog-footer.md) | 中文

## 问题

手机上所有基于 `Modal` 的弹窗（最直观的就是模型能力设置）都以中档高度（50dvh）打开，且操作行（取消/保存）跟随表单内容一起滚动。能力设置表单较高：两张各带 8 个常用值滑杆卡片、多模态行、思考等级分组。中档高度下只能看到第一张卡片，保存要滚动过全部内容去点一个屏幕外的按钮。

## 决策

`SurfaceSheetProps` 增加可选 `footer`：`Modal` 在 sheet 模式下把弹窗操作行与正文分开交给 sheet 展示器，`MobileSheet` 将其固定在可滚动正文之外（`data-chaos-sheet-footer`），并用 `:has()` 收回 sheet 自身的底部安全区内边距，避免重复计算。chaos-mobile 展示器把 `dialog` 面以大型档位（90dvh）打开，表单内容一次可见；`menu` 与 `tooltip` 面保持紧凑的中档。删除了 mobile.css 中两条指向 re-baseline 后组件从不输出的锚点的规则（`[data-model-capabilities-trigger]`、`[data-model-capabilities-field]`）；常用值按钮改为通过组件实际输出的锚点（`[data-model-capabilities-capacity]`）增大到 36px 触控高度。

## 曾考虑的替代方案

**可滚动正文内的粘性 footer。** 每个弹窗都能实现，但安全区处理留给各弹窗自己的 CSS，展示器对操作行位置没有统一抓手。

**所有 sheet 面都用大型档位。** 模型列表等菜单较短，90dvh 无谓地盖住会话，也损失了低位拖拽关闭的起点。

**保留死的能力规则。** 它们已匹配不到任何东西；隐藏一个不存在的触发器、重排不存在的字段，只会再制造一遍 fork 反复出现的锚点漂移。

## 后果

手机上弹窗的主操作在任意滚动位置都可见；能力表单（两张滑杆卡片加多模态行）连同固定的 footer 一屏放下。mobile-sheet 规格固定 footer 位于滚动容器之外；mobile-overlay 规格固定 dialog 大型档位、menu 中档；surface-presentation 规格固定 footer 的交接；mobile.css 规格固定两条死锚点规则的移除。
