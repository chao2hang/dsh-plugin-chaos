---
description: "dsh Web 客户端的零 Cordis React 原子组件：按钮、菜单、模态、悬浮卡片、Toast 与首次使用引导层，ic_ds_* 图标与锚定浮层钩子，以及渲染不受信任 assistant 输出的 markdown、终端、read、diff、搜索与 web 结果卡片（KaTeX 公式、shiki 高亮、ANSI 回放）。"
kind: "package-library"
---

# @deepseek-ai/dsh-client-ui-primitives

[English](README.md) | 中文

## 概述

`dsh-client-ui-primitives` 是所有客户端功能共用的 React 组件库：控件（`Button`、`Pill`、`Input`、`Menu`、`Modal`、`Tooltip`）、状态标记（`StateDot`、`DisclosureRow`、`ConnectionIndicator`、`ic_ds_*` 图标家族）、浮层管道（`HoverCard`、`Toast`、`OnboardingSurface`、`useAnchoredMaxHeight`、`useAnchoredPosition`、`useDismissOnOutsidePointer`），以及结果卡片家族——`MarkdownText`、`TerminalBlock`、`ReadBlock`、`DiffBlock`、`SearchBlock` 与 `WebBlock`。调用方导入一个原子组件并通过带类型的 prop 传入完整的本地化 label：这些原子组件零 Cordis、不持有文案、也没有跨插件可变状态，因此任何组合都能消费它们，也可以整体重写而无需协调。重头是不受信任的 assistant 输出——`MarkdownText` 以 GFM 与 KaTeX 公式增量流式渲染、净化链接与图片并按列数决定表格尺寸，`TerminalBlock` 则以终端精确的列移动回放 ANSI 输出。任何客户端界面需要"呈现不拥有业务状态"时使用它。

## 目录

- [使用本包](#use-this-package)
- [表面与浮层](#surfaces-and-overlays)
- [内容渲染](#content-rendering)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 何时使用

`packages/client` 下的每个功能包都经这些原子组件渲染——ui-conversation、ui-workspace、ui-sidebar、ui-settings 与外壳层都从这里导入控件、状态标记、浮层管道与结果卡片。当一个组件必须脱离 Cordis 渲染时使用本库而非插件：原子组件只接受普通 prop、不订阅任何东西、也不触达任何 service，因此它们可以同样地组合进 slot、portal 与 sheet 呈现器。共享运行时代码只属于这样的窄静态 owner；功能插件不得运行时导入另一功能插件的值，因此共享呈现落在这里。

### 入口

```tsx
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'

<Button variant="outline" onClick={act}>{label}</Button>
```

成功即一枚 token 样式的按钮渲染在它被挂载的确切位置——没有 context、没有 provider、没有 store。缺少必填 label prop 是针对原子组件带类型 prop 的编译期失败，绝不是运行时回退：面向用户的文案归渲染点所有，原子组件不渲染默认文本。

-----

<a id="surfaces-and-overlays"></a>
## 表面与浮层

### 呈现形态接缝

`SurfacePresentation` 是一个能力接缝，让 `Modal`、`Menu` 和 `Tooltip` 在桌面（inline）与移动端（底部 sheet）之间适配呈现方式。默认为 `inline` 且无 sheet 呈现器，因此所有消费方行为与之前完全一致，除非 `setSurfacePresentation` 覆盖。移动插件调用 `setSurfacePresentation` 传入 `mode: 'sheet'` 和 `presentAsSheet` 回调（用 `resetSurfacePresentation` 恢复桌面）；此时 `Modal` 和 `Menu` 将内容委托给该回调（由回调渲染带抓手、detent 和下拉关闭的 sheet），而 `Tooltip` 完全抑制气泡。该 store 为模块级（`useSyncExternalStore`）而非 React context，因此可触达 portal 的 Modal/Menu 实例，不受 React 树位置限制。sheet 中的 Menu 会把自身 portal 内容登记为 Menu 文档级外部指针监听器的内部目标，因此移动端点击会先选中条目，再关闭菜单。三者都发出稳定的 `data-surface` 属性（`dialog`、`menu`、`tooltip`），使 CSS 可针对契约编写选择器，无需依赖 CSS Modules 的哈希类名。

### 悬浮卡片

`HoverCard` 通过指针离开宽限期，使采用 portal 渲染的预览在跨过与锚点之间的间隙时仍可触及。消费方还可传入 `copyText`：此时卡片为指针与键盘激活提供按钮语义，其无障碍名称会在 `copyLabel` 前缀后包含该值，通过包内剪贴板辅助函数原样写入该值，并且只有宿主接受写入后，才会临时将内容替换为 `copiedLabel`。与卡片相交的非折叠文本选区会阻止指针点击激活；成功反馈保持卡片原有高度，并随卡片关闭或在一秒后清除。`copyLabel` 和 `copiedLabel` 采用 label prop，是因为这个零 Cordis 原子组件无法读取应用 locale；省略 `copyText` 时，卡片维持只读且可选择文本的行为。历史依据见[已归档的悬浮卡片复制 Agent Note](../../../.agents/notes/archived/feature/2026-07-31-hover-card-click-copy.md)。

### Toast

`Toast` 是顶部的短时横幅：滑入后满不透明度停留三秒，再用一秒淡出，随后调用 `onDone` 由持有方卸载。它渲染 `role="alert"`，带可选的前置图标插槽，文案是必填 prop（零 Cordis，由持有方本地化）。它经 body portal 渲染且 `pointer-events: none`，距视口顶部 120px，水平中心跟随可选的 `anchor` 元素（窗口尺寸变化时重测）——composer 传入自己的卡片，横幅因此在聊天列而非整个窗口上居中——不传则回退到视口居中。重复展示同一条消息需要重新挂载，持有方用每次展示递增的序号作为 key，让相同文案重新走完停留与淡出，而不是静默复用已淡出的横幅。`prefers-reduced-motion: reduce` 下去掉滑入，只保留延迟淡出。它的层级高于图片灯箱的遮罩，预览打开时报出的失败仍然可读。

### OnboardingSurface

`OnboardingSurface` 是首次使用接管层：portal 到 body 的遮罩加不透明展示层，在且仅在自身生命周期内保持 `#root` 为 `inert`，卸载时恢复。步骤在展示层内渲染自己的内容。

-----

<a id="content-rendering"></a>
## 内容渲染

### Markdown 渲染

`MarkdownText` 通过 React 元素渲染来自不受信任 assistant 输出的 GFM 与 `$…$`、`$$…$$`、`\(…\)` 和 `\[…\]` TeX 公式，公式由 KaTeX 排版并禁用受信任命令；块级同一行 `$$…$$` 是显示公式并支持 `\tag{}`。一个小范围的 micromark 扩展允许由星号标记、以标点结尾的粗体在紧邻的 CJK 文本前闭合，以适应 CJK 文本通常省略 CommonMark 所要求空格的写法；单星号强调、紧邻非 CJK 文本的情况、转义、代码与数学公式仍沿用上游解析行为。它会省略原始 HTML，使相对链接及非 HTTP(S)/mailto 链接失效，以安全的外部链接属性打开 HTTP(S) 链接，并在不发送 referrer 的情况下渲染采用绝对 HTTP(S) URL 的图片；相对路径、绝对本地路径、`file:` URL 与不受支持的 scheme 会保留其 alt 文本。完整内容为绝对 HTTP(S) URL 的行内代码会保留代码样式，并获得同样安全的外部链接；命令、非完整 URL、其他 scheme 与围栏代码仍不会成为链接。可选的 `fileMentions` 解析器让持有该组件的视图为命名真实文件的行内代码添加可点击入口：token 保留代码样式，并获得一个连接到解析所得 opener 的按钮，按钮带有解析器提供的无障碍标签和以完整路径为值的 `title`。渲染器绝不猜测哪些内容像路径：未解析的 token 保持不可交互；文件提及仅应用于已定稿的渲染（流式缓存不得固化可能过期的 handler）；锚点内的 token 也保持不可交互，因为按钮不能嵌套其中。回复流式输出期间，`MarkdownText` 增量解析：除末尾两个块外全部冻结为缓存的 React 元素，每个分片只重新解析其后的源文本尾部，因此每分片的工作量跟随尾部而非整个回复（[机制与 DOM 一致性约定](../../../.agents/notes/implemented/architecture/2026-08-06-web-markdown-incremental-ast-renderer.zh.md)）。表格按列数决定尺寸（对齐 deepsuite chat）：不足四列——或位于 blockquote 内——的表格填满所在列，单元格文本换行收缩至最小可读列宽；四列及以上的表格保持自然宽度、在包裹层内横向滚动，并携带稳定的 `md-table-wide` 类，供宿主布局把包裹层加宽到所在列之外（`dsh-client-ui-conversation` 中聊天转录区的容器查询突破样式）；宽表的横向滚动条在悬停或键盘聚焦（包裹层带 `tabindex="0"`）时才出现、不再常驻（[决策记录](../../../.agents/notes/implemented/feature/2026-08-19-web-markdown-wide-table-view.zh.md)）。`MessageText` 仍是用户创作内容使用的字面文本原语。`extractMarkdownPlainText` 会移除 Markdown 呈现标记以用于紧凑标签，同时将原始 HTML 保留为字面文本。元素间距、响应式图片、表格、链接与行内代码使用与 deepsuite `@deepseek/md` 相同的 `--dsw-alias-markdown-*` / `--dsw-font-markdown-*` token。围栏代码块通过 `CodeBlock` 渲染（语言横幅、复制控件，以及对已注册语法使用 shiki）。

### 终端输出

`TerminalBlock` 将一条 shell 命令渲染为终端表层：命令的每一行各占一个提示行（缩短后的 `cwd` 标签只出现在第一行，因为视图只知道一个工作目录，而一个 `cd` 就会让后面的行去到别处，标签之后是该行）、命令输出、非零退出码或终止信号对应的状态胶囊，以及写入原始 `output` prop 的复制控件。一枚运行状态 `StateDot` 为整次调用标记一次，位于第一行，以脱离文档流的方式落在卡片以自身左内边距预留的落区中，因此它位于卡片盒之内、提示文字之左。它用到 `StateDot` 的三种状态——`running` 期间为追逐动画，与渲染状态胶囊相同的退出状态为红色，其余为绿色——因此卡片直接陈述其命令是否仍在运行，而不是让人从有无输出中推断；由于 `StateDot` 是 `aria-hidden`，它携带一处视觉隐藏的文本标签。无论多少行都只有一枚状态点是有意为之：退出状态属于整次调用，因此每行一枚就会声称一个视图并不携带的逐行结果。命令文本使用 `white-space: pre`，因此重复空格、制表符与缩进续行都原样呈现，同时该行仍保持单行并以省略号截断。ANSI 转义序列通过 `anser`（打进本包浏览器产物）解析为 React span；光标移动在剥除无显示意义控制符之前先重放进逐行的列缓冲，因为回车与退格只移动光标：单是 `100%` 加回车再加 `OK` 显示为 `OK0%`，而 spinner 随重绘写出的 `\x1b[K` 会擦掉尾巴，因此 `100%\r\x1b[KOK` 显示为 `OK`。行内擦除的三种参数形式都被遵循，光标按终端列推进（8 列制表位；emoji 与 CJK 占两列；组合标记不占列），SGR 状态按单元格归一化存储，与终端一致，并跨行延续、在行结束时的状态处收束；基础 16 色前景色映射到 `--dsw-*` token，而 256 色板与真彩色值按字面 rgb 透传。输出保持 `white-space: pre` 并支持横向滚动，因此按列对齐的输出保留其对齐而不会软换行；超过 `maxLines`（默认 16）时折叠为头部切片加尾部切片，由展开按钮控制。原理见[Web 终端卡片笔记](../../../.agents/notes/implemented/feature/2026-07-28-web-terminal-card.zh.md)。

### Read 渲染

`ReadBlock` 将返回的文件窗口渲染为带行号、语法高亮的代码表层：一个粗体路径（或 presenter 提供的标题）横幅加复制控件，其下是内容行，行号槽里是文件自身的行号（窗口化的 read 保留文件本身的编号，因此偏移之后的 read 从大于 1 处起始）。`totalLines` 超过窗口行数时画出 `showing N of M` 提示；超过 `maxLines`（默认 16，与 TerminalBlock 相同的切分算法）时折叠为头部切片加尾部切片，由展开按钮控制。高亮走与 `CodeBlock` 相同的 shiki 路径。原理见[Web read 卡片笔记](../../../.agents/notes/implemented/feature/2026-07-30-web-read-card.zh.md)。

### Diff 渲染

`DiffBlock` 将一次文件改动渲染为内联 diff 表层：每个文件一个粗体路径头、删除行（`- `，error token）在新增行（`+ `，success token）之上、同文件第二个 hunk 前一个 `⋯` gap，以及暗色 `└ +A -R · N file(s)` 页脚。各行使用 `white-space: pre` 并横向滚动，因此源码行保留其缩进而不软换行；超过 `maxLines`（默认 16，与 `TerminalBlock` 相同的切分算法）时折叠为头部切片加尾部切片，由展开按钮控制。新建（`oldText: null`）没有删除侧。复制控件写入带前缀的 diff 文本（路径头、`- `/`+ ` 行、gap），使多文件复制保持可归属，并浮在右上角而非占据自己的 banner 行。几何结构与 `CodeBlock`/`TerminalBlock` 一致。原理见[Web diff 卡片笔记](../../../.agents/notes/implemented/feature/2026-07-30-web-diff-card.zh.md)。

### 搜索结果

`SearchBlock` 渲染一次已完成的搜索，并通过 `kind` 判别，由一个组件处理两种结果。`matches`（grep）将每个文件显示为粗体路径头及其 `lineNumber: line` 行，各文件组均可折叠；`paths`（glob）显示扁平的路径列表。两者都摊平成一个行列表，由高度上限对其做头尾切片（默认 16，与 `TerminalBlock` 相同的切分算法），且都不软换行——较长的匹配行或路径会横向滚动而非折行。当工具截断结果时，banner 摘要会包含截断前的总数，使卡片绝不把截断后的结果呈现为完整结果；无论是否触及上限或哪些组处于折叠状态，复制控件都会写入完整的结构化结果。几何结构与 `CodeBlock`/`TerminalBlock` 一致。原理见[Web 搜索卡片笔记](../../../.agents/notes/implemented/feature/2026-07-30-web-search-card.zh.md)。

### Web 检索

`WebBlock` 渲染一次已完成的 web 检索，用一个组件绘制 `web` 渲染意图的两种 kind（由 `kind` 判别）。`search` 在有序引用列表上方显示可选的提供方回答（通过 `MarkdownText`）：每个 source 是一个安全外链，以其标题为标签，或以其主机名为标签，当 URL 无法解析或没有主机名（`file:`/`data:` URL）时回退到原始 URL，因此标签绝不为空；其下渲染 snippet 与发布日期。只有 http(s) URL 会成为锚点（设置 `target`/`rel`）——这是 `MarkdownText` 对不受信任链接所用 allowlist 的 http(s) 子集（该 allowlist 还允许 `mailto:`，此处排除）；任何其他 URL 渲染为纯文本。整份列表渲染在一个定高滚动容器里（`max-height: 320px`、`overflow-y: auto`），因此超出该高度的列表在原地纵向滚动，而不是把卡片撑高；`<li value>` 固定每个 source 的引用编号，从 1 起连续，而不依赖 `<ol>` 的隐式计数。当一次 search 合法地返回无 answer 且无 source 时，卡片显示一个明确的空状态提示，而不是空的 `<ol>`（chat 行不呈现原始 result content）。`fetch` 显示一个紧凑摘要：带链接的最终 URL 及其 HTTP 状态。两者都会标记一次被截断的检索。原理见[Web result 卡片笔记](../../../.agents/notes/implemented/feature/2026-07-30-web-result-card-frontend.zh.md)与[来源滚动笔记](../../../.agents/notes/implemented/feature/2026-08-03-web-search-source-scroll.zh.md)。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节补充模块地图与共享几何；各组件的可观察行为已在上文说明。

### 设计说明

原子组件只通过从 CSS Modules 消费的 `--dsw-*` token 获得样式——没有字面颜色、没有组件库——因此一次设计 token 变更即可让所有消费方同时换肤。浮层定位集中在两个钩子里：`useAnchoredMaxHeight` 把底部锚定的浮层高度收敛到锚点上方的视口空间（在 resize、scroll 与调用方提供的依赖变化时重新测量），`useAnchoredPosition` 让固定定位的浮动面板跟住锚点（测量、偏移、按视口边距钳制，并在捕获阶段滚动、窗口缩放与面板自身尺寸变化时重新定位）。结果卡片共享同一套头尾折叠算法（`head-tail-cap.ts`）与同一套卡片几何，使转录读起来像一个整体。markdown 管线把纯解析层（`parse.ts` 与 CJK 友好的粗体扩展）与渲染层（`render.tsx`）分开，流式期间由 `incremental.ts` 冻结末尾两个块之前的所有块；`TerminalBlock` 保留自己的 ANSI 到 span 回放（`ansi.ts`），使终端状态（列缓冲、逐单元格 SGR）保持终端精确。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/SurfacePresentation.tsx`](src/SurfacePresentation.tsx) | 模块级 inline/sheet 呈现形态接缝 |
| [`src/useAnchoredPosition.ts`](src/useAnchoredPosition.ts) | 固定定位浮层放置钩子 |
| [`src/useAnchoredMaxHeight.ts`](src/useAnchoredMaxHeight.ts) | 底部锚定浮层高度钳制钩子 |
| [`src/markdown/MarkdownText.tsx`](src/markdown/MarkdownText.tsx) | 不受信任输出的 markdown 渲染器与链接策略 |
| [`src/markdown/incremental.ts`](src/markdown/incremental.ts) | 仅追加流的增量块解析器 |
| [`src/TerminalBlock.tsx`](src/TerminalBlock.tsx) | ANSI 回放终端卡片（旁边是 `ansi.ts`） |
| [`src/head-tail-cap.ts`](src/head-tail-cap.ts) | 共享的头尾折叠算法 |
| [`src/icons/index.tsx`](src/icons/index.tsx) | `ic_ds_*` 图标家族 |
| — | 不发布 `./invariant` 入口：纯 props-in 原子组件，无 Cordis API。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当原子组件的约定不够用时阅读以下页面。

- [Web 样式](../../../docs/web-styling.zh.md)——原子组件遵循的 token 与 CSS Module 规则。
- [增量 markdown 渲染器](../../../.agents/notes/implemented/architecture/2026-08-06-web-markdown-incremental-ast-renderer.zh.md)——流式解析器机制。
- [locale 持有的客户端 UI 文案](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)——为什么每个 label 都是 prop。
- [ui-conversation](../ui-conversation/README.zh.md)——把卡片组合进转录区的最大消费方。

-----

<a id="model-experience"></a>
## 模型体验

无，因为该包在浏览器中渲染纯 React 原子组件；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明原子组件在边界处如何表现；它们是当前包约束，不是组件路线图。

- **流式渲染推迟跨边界引用解析**：引用式链接或脚注的定义落在增量冻结边界另一侧时，回复流式期间渲染为字面文本；定稿时的完整解析会将其解析。
- **长高亮 fence 会保留完整 token DOM**：流式路径避免重新解析、重新 tokenize 和 reconcile 已完成前缀，但不会丢弃旧颜色或虚拟化 token span。因此最终 DOM 数量仍随 fence 的 token 数增长；嵌套／容器内 fence 与病态的单个超长行仍走通用尾部路径。
- **字形级图标是重新绘制的近似版本**：鱼形标志与闪光标记来自字体字形，而本地设计数据无法导出其矢量几何；在获得精确导出路径前，使用手工重建版本代替。
- **`Pill` 与 `Input` 没有设计来源**：两个原子组件均自行定义；与其相似的侧边栏搜索字段和视图标签条由消费方组合，不是这些原子组件。
- **`StateDot` 没有 `Active` 变体**：支持的状态为 done、warning、ongoing 和 error。
- **面向用户的文案必须由渲染点提供**：这些原子组件是零 Cordis 的，拿不到 `ctx.locale`；各功能必须通过 primitive 的带类型 prop 提供完整本地化 label（见[决策](../../../.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.zh.md)）。
- **`TerminalBlock` 不是终端模拟器**：它渲染已结束或仍在运行的命令输出，而不是交互式会话：SGR 颜色、回车、退格、行内擦除、制表位与字符宽度会被遵循；绝对光标定位、清屏与备用屏幕序列会被剥离。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。这些是纯 props-in React 原子组件，没有 Cordis API、事件、service 或跨插件可变状态；渲染约定由本包的组件测试覆盖。
