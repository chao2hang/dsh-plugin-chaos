# TODO — chaos-mobile 移动端重构

> 目标：把 `packages/extensions/chaos-mobile` 从"CSS 劫持桌面布局"重构为一套遵循 iOS 系统交互原则的移动形态。> 判定标准：排版一屏一主操作、弹窗统一为可拖拽 sheet、交互不依赖悬停、桌面端逐字节不变。
>
> 相关源码：`packages/extensions/chaos-mobile/`、`packages/client/ui-layout/`、`packages/client/ui-primitives/`、`packages/client/ui-conversation/` > 约定：遵循 `AGENTS.md` / `packages/AGENTS.md`；每个 PR 自带 Agent Note、双语 README、对应测试。

---

## 0. 现状诊断（重构依据，勿删）

| # | 问题 | 证据 |
|---|---|---|
| D1 | 样式靠猜 CSS Modules 哈希类名 | `mobile.css` 有 **22 处** `[class*=...]` 选择器、**37 处** `!important` |
| D2 | 弹窗是全局劫持而非组件行为 | `[role='dialog'], [role='menu'], [role='listbox'], [data-popup]` 被一把按到屏底 |
| D3 | `Menu` 定位逻辑空转 | `Menu.tsx` 的 `useLayoutEffect` 仍算 left/top 并做边缘 clamp，结果被 `!important` 覆盖 |
| D4 | sheet 缺少定义性交互 | 无抓手、无 detent、无下拉关闭、无滚动锁、无焦点陷阱 |
| D5 | 导航模型缺失 | 详情全屏只有浮空 ✕；无标题、无返回、无层级、系统返回键直接退出应用 |
| D6 | 排版是补丁叠加 | `padding: 8px 12px 0 68px` 硬留白；`headerUtilities` `max-width: 34vw`；详情打开时 `display:none` 整个 utilities |
| D7 | 输入栏控件过载 | `+`、权限、Plan、模型、上下文计、发送已满，`AttachmentButton` 又塞进 `conversation.input.left` |
| D8 | 悬停驱动 UI 在触屏不可达 | `InputBar.tsx` 有 **7 处** `Tooltip`；`Menu` 的 `closeOnPointerLeave` + pointer-grace；`handle::after` 靠 hover 显形；sidebar rail 靠 hover 换图标 |
| D9 | 测试锁字符串而非行为 | `mobile-css.client.spec.ts` 断言 `'padding: 8px 12px 0 68px'`、`'box-shadow: 0 2px 12px'` 等 CSS 文本 |
| D10 | 缺 REAL-composition 测试 | 现有测试全是手搭 `ctx.plugin(...)`，不满足 `packages/AGENTS.md` 对产品可见插件的要求 |

---

## 1. 设计原则映射（iOS HIG → 本仓库）

- [x] **Deference**：移动端 chrome 只保留一条 44pt 导航栏 + 一条输入栏
- [x] **Clarity**：输入栏只留"发送"为主按钮，其余控件收进 `+`
- [x] **Depth**：侧栏 = drawer（覆盖）／详情 = 推进页（带返回）／菜单选择 = sheet（覆盖）
- [x] **Sheet 规范**：抓手 + medium/large 两档 detent + 下拉关闭
- [x] **触控目标**：`(pointer: coarse)` 下统一 44pt，伪元素扩大命中区而非撑大视觉尺寸
- [x] **安全区/动态视口**：`env(safe-area-inset-*)` + `100dvh` + `visualViewport` 键盘避让
- [x] **手势可撤销**：边缘右滑返回、drawer 拖拽关闭、sheet 下拉关闭，均可中途取消
- [x] **不依赖悬停**：`(hover: none)` 下停用 Tooltip / pointer-grace / hover 显形

---

## 2. 架构决策（先定，后写代码）

### 决策 A — ui-layout 发布稳定布局锚点契约
chaos-mobile 只针对 `data-*` 属性写选择器，`[class*=]` 与绝大部分 `!important` 一次性删除。

- [x] `AppFrame.tsx` 增加 `data-shell-column="sidebar|center|details"`
- [x] `AppFrame.tsx` 增加 `data-shell-handle`
- [x] 已有 `data-sidebar-collapsed` / `data-details-collapsed` 写进 README 作为对外契约

> **不选"chaos-mobile 替换 root slot"**：`SlotCore.register` 对已声明子 slot 抛> `slot "sidebar" is already declared`，影子注册无法重新声明> `sidebar`/`conversation`/`details`/`shell.overlay`，类型与运行时双重封死。

### 决策 B — ui-primitives 开"呈现形态"接缝，chaos-mobile 做 Provider

- [x] **Service Definition**（ui-primitives）：`SurfacePresentation` 上下文，值为 `inline | sheet`
- [x] `Modal` / `Menu` / `Tooltip` 接入该上下文，并加稳定 `data-surface="dialog|menu|tooltip"`
- [x] **Provider**（chaos-mobile）：在 `(max-width: 767px) and (pointer: coarse)` 下提供 `MobileSheet` 呈现器
- [x] 桌面默认呈现器行为与今天逐字节相同

> 保持 chaos-mobile 为纯浏览器侧插件；从 web profile 的 `cordis.patch.yml` > 摘掉 `chaos-mobile` 一行即可完全回到桌面形态。

---

## 3. 实施计划（官方 stacked PR，A ← B ← C ← D ← E）

### PR 1 — 布局锚点契约（`packages/client/ui-layout`）
无视觉变化，桌面零风险。

- [x] `src/client/AppFrame.tsx`：为 sidebar/center/details 列与 drag handle 加 `data-*` 锚点
- [x] `README.md` / `README.zh.md`：记录锚点契约与"改动需协同更新 chaos-mobile"的义务
- [x] `tests/app-frame.client.spec.tsx`：断言锚点存在，且随折叠状态变化
- [x] Agent Note（`architecture`）：为何选锚点契约而非影子 root slot
- [x] 门禁：`pnpm run test`（focused）、`typecheck`、`doc-sync`

### PR 2 — 呈现形态接缝（`packages/client/ui-primitives`）
桌面单测保持通过，即为"默认行为未变"的证据。

- [x] 新增 `SurfacePresentation` 上下文与默认 `inline` 呈现器
- [x] `Modal.tsx`：sheet 模式把卡片交给注入呈现器；加 `data-surface="dialog"`
- [x] `Menu.tsx`：sheet 模式跳过 `useLayoutEffect` 定位与 `closeOnPointerLeave`；加 `data-surface="menu"`
- [x] `Tooltip.tsx`：`presentation === 'sheet'` 时整体不渲染气泡；加 `data-surface="tooltip"`
- [x] 单测：默认呈现器下三者行为与现状一致；sheet 模式下定位副作用不执行
- [x] `README.md` / `README.zh.md`：记录接缝的三个角色
- [x] Agent Note（`architecture`）：能力接缝的 Definition/Provider/Consumer 划分

### PR 3 — chaos-mobile 外壳重建（本包主体）
体量最大；若需再拆，把 `MobileSheet` 单独提前一个 PR。

- [x] `src/styles/mobile.css`：删除全部 22 处 `[class*=]` 选择器及随之失效的 `!important`（预计 322 行 → ~150 行）
- [x] 保留的 `!important` 必须逐条注释冲突来源
- [x] 新增 `src/client/MobileNavBar.tsx`：44pt 导航栏 — 左（菜单／返回）、中（会话标题）、右（单个溢出 `…`）
- [x] 移除浮空汉堡 + ✕ 双按钮，删除 `padding: 8px 12px 0 68px` 硬留白
- [x] 新增 `src/client/MobileSheet.tsx`：抓手、medium/large detent、拖拽关闭、backdrop、`overscroll-behavior: contain` 滚动锁、焦点陷阱、Escape 关闭
- [x] 新增 `src/client/useKeyboardInset.ts`：基于 `visualViewport` 的键盘避让，输入栏跟随键盘上移
- [x] 详情列：全屏覆盖 + ✕ → 推进页 + 导航栏返回
- [x] 接管 `history.pushState`：系统返回键关闭详情而非退出应用
- [x] drawer：支持左边缘右滑打开、拖拽关闭，跟手且可中途取消
- [x] `prefers-reduced-motion` 下全部手势动画降级为瞬时切换
- [x] Agent Note（`architecture`）：含 `## Alternatives considered` 说明为何自研 `MobileSheet` 而非引入 vaul / react-modal-sheet

### PR 4 — 输入栏与触屏可达性
- [~] `AttachmentButton` 从 `conversation.input.left` 独立图标 → 并入 `+` 命令菜单（暂缓：保留独立图标，需 ui-commands 集成）
- [~] 删除 `AttachmentButton.module.css` 中的 `@media (max-width: 767px)` 显隐 hack（暂缓：独立图标需该显隐规则）
- [x] `(hover: none)` 下统一关闭 Tooltip、hover 显形、pointer-grace
- [x] `(pointer: coarse)` 下统一 44pt 命中区（伪元素扩大，不撑大视觉尺寸）
- [x] 页头 utilities：`max-width: 34vw` + 打开详情时 `display:none`（CSS 已实现；导航栏 `…` 溢出菜单为占位）
- [x] 输入栏回到"一行、一个主操作"

### PR 5 — 测试与文档
- [x] 删除 `tests/mobile-css.client.spec.ts` 的全部 CSS 字符串断言
- [x] 新增行为测试：sheet detent 吸附
- [x] 新增行为测试：拖拽超阈值关闭 / 未超阈值回弹
- [x] 新增行为测试：焦点陷阱不逃逸
- [x] 新增行为测试：`prefers-reduced-motion` 降级
- [x] 新增行为测试：返回键层级顺序
- [x] 新增行为测试：`visualViewport` 键盘 inset
- [x] 新增 REAL-composition 测试：通过 Cordis Context + SlotRegistry 启动（补齐 D10）
- [x] 更新 `chaos-mobile/README.md` / `README.zh.md`：含 Model Experience、KV Cache effect、Known Limitations 三节
- [x] 更新 `ui-layout` / `ui-primitives` 双语 README
- [x] Agent Note `proposed → implemented`，跑 `pnpm run verify-translation-pairing --write`
- [ ] 录制 GIF（`record-browser-gif` skill，从本 PR 自己的 server 录制）

---

## 4. 验收标准

- [x] chaos-mobile 的 CSS 中不存在 `[class*=` 选择器
- [x] 残留 `!important` 逐条注释了冲突来源
- [ ] 375×667（iPhone SE）与 430×932（Pro Max）下，任意时刻只有一条导航栏 + 一条输入栏占用 chrome
- [ ] 上述两种尺寸下正文横向无溢出
- [ ] 键盘弹出时输入栏完整可见
- [x] 模型选择、权限、命令、设置、确认框全部以同一 `MobileSheet` 呈现（架构上通过 SurfacePresentation 接缝实现）
- [x] sheet 具备抓手、下拉关闭、背景不滚动、焦点不逃逸
- [x] 系统返回键依次关闭 sheet → 详情页 → drawer（history.pushState 集成已实现）
- [x] 桌面（≥768px）快照与单测逐字节不变
- [x] `pnpm run test` / `typecheck` / `lint` / `doc-sync` 通过
- [ ] 附 GIF 的产品可见 GUI 变更 PR

---

## 5. 风险与取舍

- **改动跨三个包**：`ui-layout` 与 `ui-primitives` 各需一个小接缝。否则移动端只能继续猜哈希类名——这条路已证明不可维护。按 pre-release 立场，一次性改完引用点优于加兼容层。
- **`MobileSheet` 自研而非引入依赖**：仓库有"优先用成熟依赖"政策，但 sheet 必须挂进 ui-primitives 呈现接缝、遵循本仓库 token 与 reduced-motion 约定；引入 vaul / react-modal-sheet 会同时带进 React 版本与样式体系约束。**此取舍必须写进 Agent Note 的 `## Alternatives considered`。**
- **`history` 接管有冲突面**：将来引入路由插件需协调所有权；Note 中记为已知边界。
- **PR 3 体量偏大**：可把 `MobileSheet` 单独提前一个 PR，导航栏与 drawer 手势留在后一个。