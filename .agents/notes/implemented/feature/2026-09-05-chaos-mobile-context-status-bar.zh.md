# Agent Note: chaos-mobile 上下文用量移入顶部状态条与省略号弹窗

Status: implemented

[English](2026-09-05-chaos-mobile-context-status-bar.md) | 中文

## 问题

chaos-mobile 的输入框操作行在手机上折成了两行。桌面操作行（指令、自带回形针、权限、模型、上下文圆环、发送）加上插件的三选附件入口控件过多，超出单行容量，行的 `flex-wrap` 把模型、圆环和发送按钮挤到了第二行。mobile.css 的操作行规则选择的是 dsh 0.1.3-alpha.1 InputBar 从未输出的 data 锚点（`data-input-actions-row`、`data-input-tools`、`data-composer-trailing`、`data-composer-command`、`data-composer-primary`），隐藏自带回形针靠的是特定语言包下的 `aria-label` 匹配，因此这些规则全部失效，两个回形针同时可见。

## 决策

InputBar 输出 mobile.css 操作行所选择的全部稳定锚点：行上有 `data-input-actions-row`，分组上有 `data-input-tools`、`data-composer-modes`、`data-composer-trailing`，控件上有 `data-composer-command`、`data-composer-attach`、`data-composer-primary`。mobile.css 改用锚点而不是文案隐藏 `[data-composer-attach]`，插件的三选附件入口成为手机上唯一的附件入口；单行 nowrap 操作行规则随之生效。

上下文圆环退出手机操作行。`conversation.input.left` 会话作用域列表新增 `ContextStatusBar` 条目：它通过会话标准套件读取 `contextPressure` 与 `contextBreakdown` 投影，把折出的占用值发布到插件本地存储，并门控渲染一条固定于导航栏下方的 3px 全宽进度条。进度条按有界占用百分比填充，颜色从业务蓝在 70% 处转为警告色、在 90% 处转为危险色。省略号弹窗读取同一存储，渲染「上下文占用」一节：占用百分比、已用 / 窗口 token 数，以及系统 / 工具 / 对话三行启发式构成。条目卸载时清空存储，进度条与弹窗小节随会话一起消失。桌面端保留圆环及其点按面板。

## 曾考虑的替代方案

**按位置或文案隐藏自带回形针。** aria-label 匹配在目标语言包之外已经失效，位置选择器则会在桌面行组成变化时出错。

**从 shell overlay 渲染顶部状态条。** `shell.overlay` 是全局作用域，拿不到投影套件；而输入框的会话作用域槽位本来就随会话挂载与卸载，在那里读取投影可以让状态条生命周期跟随会话，不必把读取逻辑搬进布局层。

**让弹窗自己读投影。** 弹窗渲染在 overlay 的全局作用域槽位，没有 `useProjection`；一个单值的插件本地存储比把会话作用域桥接进 overlay 更小。

## 后果

手机输入框操作行为一行：指令、附件入口、权限、模型、发送。上下文占用以对话上方细条的形式一眼可见，token 构成明细位于弹窗中既有「会话统计」一节旁边。InputBar 规格固定所输出的锚点；组件规格覆盖占用折值、投影值优先、100% 上限、变色阈值、存储的按值通知与卸载清空；overlay 规格覆盖弹窗小节的出现与缺省；mobile.css 规格固定锚点隐藏与状态条位置。
