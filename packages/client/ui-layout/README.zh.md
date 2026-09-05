---
description: "dsh Web 客户端的外壳框架插件：三栏 AppFrame 与 sidebar、conversation、details、shell.overlay 四个 slot，ctx.layout 面板操作接口，带让步链与窄视口自动折叠的拖动手柄，以及把 ctx.theme 快照投影到 document 的主题呈现器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | 中文

## 概述

`dsh-client-ui-layout` 是其他所有客户端界面的组合外壳：它把三栏 AppFrame 填入运行时拥有的 `root` slot，并声明 `sidebar`、`conversation`、`details` 与 `shell.overlay` 四个子 slot，供导航、对话、工具详情与全框架浮层注册。插件经 `ctx.layout`（`toggleSidebar`、`openDetails`、`closeDetails`）切换面板几何，或直接拖动列边界；让步链保证窗口收缩时中列仍可用，低于 1024px 的视口自动把侧边栏折叠为 56px 控制栏。该包还承载主题呈现器，把解析后的 `ctx.theme` 快照投影到 document——配色方案、暗色调色板属性、别名 token、内容与代码字号，以及浏览器 `theme-color`。结构节点带有稳定的 `data-shell-*` 属性，因此树外适配（移动端覆盖层）可以针对布局契约编写选择器，而不依赖 CSS Modules 的哈希类名。

## 目录

- [使用本包](#use-this-package)
- [面板几何与让步链](#panel-geometry-and-the-concession-chain)
- [稳定布局锚点](#stable-layout-anchors)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

通过在四个子 slot 之一注册组件来组合进此外壳；`apply` 顺序不受约束，因此后置插件应使用 `ctx.slots.inject`。常用路径是显式的：拥有嵌套席位时在 `children` 中声明你的 slot，否则注册进既有 slot。

### 占用框架的 slot

`sidebar`（single，root scope）接收实时列状态——`collapsed` 与来自让步求解的渲染 `width`——由 ui-sidebar 的 SidebarRoot 占据，后者在其中声明 workspace 与 settings 席位；在此注册会整体替换导航列。`conversation`（single，session-maybe scope）横跨无会话 hero 与活动对话，跨会话切换保持 React 身份不变，不接收 owner prop。`details`（single，会话 scope）关闭时以零宽度保持挂载——关闭从不停卸载——是否打开由 `ctx.layout` 决定。`shell.overlay`（列表，root scope）是横跨所有列之上、可点击穿透的浮动层；条目之间自行排序并重新接入指针事件，因此占用方绝不阻挡下层应用。注册方通过标准框架钩子获取业务数据、从各自的 inject 接口获取操作；会话 owner share 为空，侧边栏 owner share 只含 `collapsed` 与 `width`。

### 主题呈现

主题呈现器消费解析后的 `ctx.theme` 快照，并以纯 DOM 写入投影到 document：用 `html { color-scheme }` 驱动原生 UA 控件（滚动条、表单控件）、依据当前配色方案设置 `body[data-ds-dark-theme]`、把主题别名 token 设为 body 上的内联变量、设置内容／UI／代码字号轴，并持有一个内容跟随计算后 body 背景的 `<meta name="theme-color">`。在应用调色板和 token 后进行测量，使渲染后的背景成为唯一的颜色依据；呈现器只回收自己写入的内容，dispose（资源释放）时会连同其他全局写入一并移除其自有的元数据节点。

-----

<a id="panel-geometry-and-the-concession-chain"></a>
## 面板几何与让步链

两个面板边界都是带指针捕获与 rAF 节流增量的拖动手柄；拖动基准是手势开始时捕获的渲染（让步钳制后）宽度，因此抓住一个被压缩的面板不会让它跳回存储的偏好值，轨道过渡在手势期间暂停。侧边栏的缩放边界是不可见命中条带，详情栏边界则保留其浮动胶囊。拖动写入钳制到约定区间——侧边栏 264–420px（默认 280），详情栏 300–520px（默认 360）——且绝不跨越开／关边界；偏好值即宽度，因此关闭面板会忘记其拖动宽度，重新打开恢复约定默认值。关闭的侧边栏保留 56px 控制栏，详情栏则关闭到零宽度（子树保持挂载）。

让步链由约定固定：先向最小值收缩详情栏以保持中列不低于 640px，随后自动关闭它；侧边栏绝不退让，中列作为最后手段吸收剩余的赤字。自动关闭派生零渲染宽度而不改写偏好宽度，因此窗口变宽时面板自动恢复。低于 1024px（deepsuite LG 断点）的视口自动把侧边栏折叠为控制栏；此时的手动切换翻转 `narrowExpanded` 覆盖值，在不触碰宽度偏好的情况下越过被压缩的中列重新展开，且向任一方向跨越断点都会丢弃该覆盖值。

布局 store 是瞬时状态：侧边栏以默认宽度启动，详情栏保持关闭，该 store 从不读写 `localStorage`。AppFrame 通过 rAF 节流的 ResizeObserver 跟踪框架自身的盒子（而非窗口），并忽略零宽度的上报。它还在未选中状态间保留最后一个非 blank 会话 id：选择不同的非 blank 会话会在绘制前关闭详情栏，返回同一会话时恢复其未改变的宽度，hero 或其他未选中表面派生零渲染详情宽度而不改动存储的偏好。

-----

<a id="stable-layout-anchors"></a>
## 稳定布局锚点

AppFrame 在其结构节点上发出稳定的 data 属性，使树外插件可以针对契约编写选择器，而非 CSS Modules 的哈希类名片段：

- `data-shell-frame`——frame div 上。
- `data-shell-column="sidebar|center|details"`——三个网格列各自标注。
- `data-shell-handle`——每个拖动手柄（所属列折叠时不存在）。
- `data-sidebar-collapsed`——侧边栏折叠时存在于 frame div 上。
- `data-details-collapsed`——详情栏宽度为零时存在于 frame div 上。
- `data-dragging`——面板拖动手势期间存在于 frame div 上。

这些属性属于布局契约：重命名或删除它们需要在消费方（例如 chaos-mobile 的 `mobile.css`）协同更新。`app-frame.client.spec.tsx` 中的测试断言它们的存在与状态变化。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明求解与 store 接线；可观察的 slot 约定已在上文说明。

### 设计说明

AppFrame 决定有效的侧边栏偏好（折叠控制栏、窄视口覆盖或存储宽度），并把它交给 `columns.ts` 中的纯求解器——求解器本身与断点无关：其输出是（视口, 偏好）的纯函数，没有滞回，这正是重新变宽时自动恢复的原因。布局 store（`stores.ts`）是根条目的独占 store——`register()` 接收工厂本身，由框架逐条目实例化——而 `LayoutController`（`service.ts`）是跨插件的 `ctx.layout` 接口：它经注册的 inject 钩子接纳 store 的绑定操作，因此该接口自条目首次渲染起即生效；未接线而到达它是启动顺序 bug，会直接抛错而不是需要容忍的竞态。主题呈现器是普通类：插件启动时经 getter 应用一次，之后由 `theme/change` 事件驱动——没有 React 路径。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/AppFrame.tsx`](src/client/AppFrame.tsx) | 三栏框架、拖动手柄、slot 渲染决策 |
| [`src/client/columns.ts`](src/client/columns.ts) | 约定冻结的几何常量与纯让步求解器 |
| [`src/client/stores.ts`](src/client/stores.ts) | 瞬时面板几何 store 工厂 |
| [`src/client/service.ts`](src/client/service.ts) | `ctx.layout` 背后的 `LayoutController` |
| [`src/client/theme-presenter.ts`](src/client/theme-presenter.ts) | 全局主题 DOM 应用器 |
| [`src/client/DocumentTitle.tsx`](src/client/DocumentTitle.tsx) | 由所选会话投影浏览器标题 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当外壳约定不够用时阅读以下页面。

- [Slots 参考](../../../docs/subsystems/slots.zh.md)——四个子 slot 背后的组合模型。
- [ui-sidebar](../ui-sidebar/README.zh.md)——占据 `sidebar` 的导航列。
- [ui-conversation](../ui-conversation/README.zh.md)——对话与详情栏的占用方。
- [ui-theme](../ui-theme/README.zh.md)——呈现器所投影其快照的主题服务。

-----

<a id="model-experience"></a>
## 模型体验

无，因为布局外壳管理浏览器查看状态；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明外壳不记忆或不锚定什么；它们是当前包约束。

- **面板几何信息是瞬时状态**：重新加载会恢复侧边栏默认值并使详情栏保持关闭；在不同会话 id 之间切换同样会关闭详情栏并忘记拖动后的宽度，而未选中表面会以零宽度渲染详情栏，但不会修改几何信息。
- **让步链自动关闭通过派生零宽度实现，不会改动宽度偏好**：窗口变宽时面板会自行恢复；消费方禁止把 store 中的详情宽度当作实际渲染状态。
- **挤压重排期间不提供滚动锚定**：布局变化可能移动读者的 viewport。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。`ctx.layout` 后面的 viewing-state store 不发出 Cordis 事件；clamp、prune 与 concession-chain 顺序由本包的 columns 与 service 测试覆盖。
