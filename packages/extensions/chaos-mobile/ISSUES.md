# 视觉检测问题清单 — DSH Web GUI

> 检测方式：Playwright 无头 Chromium 实机截图 + DOM 计算样式取证 + 源码交叉验证
> 环境：运行中的 `dsh web` (127.0.0.1:3080)，master 分支工作树（有大量未提交改动）
> 视口：主 iPhone 14 Pro (393×660 dpr3)；另测 320×568、740×360 横屏、1440×900 桌面
> 截图存放：`/tmp/dsh-shots/`

---

## P0 — 阻断级

### P0-1 构建链断裂，浏览器加载的是过期 bundle（本次检测的头号问题）

`pnpm run typecheck` 与 `pnpm run build:lib:client` **均失败**，退出码非 0。
因此 `packages/extensions/chaos-mobile/lib/client.js` 停留在 16:52 的旧产物（8276 字节），
而源码已在 17:26–17:27 重写。**页面上跑的根本不是当前源码。**

初次截图 `m01-initial.png` 里左上角那两个"裸露的方框按钮"（☰ 与 ✕），
正是旧版 `MobileOverlay` 的悬浮按钮；当前源码里它们早已被 `MobileNavBar` 取代。

失败原因是 tsconfig 聚合未登记 extensions 包：

```
packages/extensions/chaos-auth/tests/session-store.spec.ts(6,8): error TS6307:
  File 'src/session-store.ts' is not listed within the file list of
  project 'tsconfig.host.json'.
packages/extensions/chaos-models/tests/models.spec.ts(3,54): error TS6142:
  Module '../src/client/ModelCapabilities.tsx' ... but '--jsx' is not set.
packages/extensions/chaos-mobile/tests/columns.client.spec.ts(6,8): error TS6307: ...
```

`grep chaos tsconfig.client.json tsconfig.host.json` → **无任何结果**。
`packages/AGENTS.md` 要求"registers in exactly one aggregate"，四个 chaos-* 包一个都没登记。

另有一处独立错误（与 chaos 无关，但同样卡住整条 host 构建）：

```
packages/client/connection/tests/node-half.host.spec.ts(175,30): error TS2352:
  Conversion of type '{ isAuthenticated ... }' to type 'WebServer' may be a mistake
```

**影响**：任何人 pull 之后跑 build 都会失败；线上看到的 UI 与源码不一致；
CI 若跑 typecheck 必红。**这条不修，下面所有修复都无法上线验证。**

> 我已手动单包 `tsc -b` + `tsdown` 重建 chaos-mobile 与 ui-primitives 以完成后续检测，
> 但**没有改动任何源码** —— 聚合登记问题仍然存在。

### P0-2 `useKeyboardInset` 写了但从未被引用 → 移动端键盘遮挡输入框

```
$ grep -rn 'useKeyboardInset' src/ | grep -v 'useKeyboardInset.ts:'
（空）
```

`src/client/useKeyboardInset.ts` 是**死代码**。`MobileOverlay.tsx` 只引了
`useEdgeSwipe` 和 `columns`。`todo.md` 却把"`visualViewport` 键盘避让"勾成了 `[x]`。

同时 `mobile.css` 把 `html, body` 钉死为 `height: 100dvh; overflow: hidden`。
iOS 上软键盘弹出**不会**改变 `100dvh`，只会改变 `visualViewport.height`。
在没有 JS 补偿的前提下，聚焦输入框时输入栏与发送按钮会被键盘直接盖住，且页面无法滚动露出。

**这是移动端最致命的可用性缺陷 —— 用户打字时看不见自己在打什么。**

---

## P1 — 严重

### P1-1 导航栏"更多"按钮是死的

`MobileNavBar.tsx:88-95` 的 overflow 按钮**没有 `onClick`**：

```tsx
<button type="button" className={css.button} data-chaos-overflow aria-label="More">
  <OverflowIcon />
</button>
```

实测点击前后 `document.body.innerHTML.length` 恒为 34730，**DOM 零变化**。
一个占据 44×44 常驻热区的按钮点了没反应，是明确的 UI 缺陷（见 `m20-overflow-click.png`）。

### P1-2 导航栏标题恒为空，D5"导航模型缺失"并未真正解决

`MobileNavBar.tsx:86`：`<div className={css.title} aria-live="polite" />` —— 永远是空 div。
实测 `titleText` 为 `""`，占据 273px 宽的中间区域一片空白（见 `m10-home.png`）。

`todo.md` D5 列的问题是"详情全屏只有浮空 ✕；**无标题**、无返回、无层级"。
返回按钮和历史栈做了，**标题这一项没做**，但 D5 已被视为完成。

### P1-3 chaos-models 弹窗不响应 Escape，且不走 SurfacePresentation 接缝

实测：打开"模型能力设置" → 按 Escape → 弹窗**仍在**（`AFTER_ESCAPE` 仍返回 rect）。

`ModelCapabilities.tsx` 自绘 `<section role="dialog" aria-modal="true">`，
既没有 keydown 监听，也没有 import `ui-primitives`：

```
$ grep -nE "Escape|keydown" packages/extensions/chaos-models/src/client/ModelCapabilities.tsx
（空）
```

对比 `ui-primitives/src/Modal.tsx:48` —— `if (e.key === 'Escape') onClose()`，是有的。

后果有二：
1. 键盘用户无法关闭弹窗（可访问性缺陷）；
2. 移动端它**不会**变成 bottom sheet，而是渲染成 361×438 的桌面卡片
   （见 `m41-settings.png`：居中浮层 + 右上角 ✕ + 底部"取消/保存"，
   横排 7 个 checkbox 在 393px 宽下挤成两行）。

### P1-4 四个主要弹出面绕过接缝，PR 2 的能力接缝只覆盖了一部分消费者

`SurfacePresentation` 接缝本身是**有效**的 —— 权限选择器实测正确弹出 sheet，
带抓手、圆角、backdrop（见 `m70-permission-surface.png`，`HAS_SHEET_GRABBER: true`）。

但这些消费者各自造轮子，完全绕过接缝：

| 包 | 文件 | 自绘内容 |
|---|---|---|
| `ui-model-selection` | `ModelSelect.tsx:248` | 自绘 `role="menu"` |
| `ui-commands` | `PopupSelectView.tsx:138` | 自绘 `role="listbox"` |
| `ui-input-trigger` | `MenuView.tsx:72` | 自绘 `role="listbox"` |
| `ui-settings-general` | `SettingsRoot.tsx:64` | 自绘 `role="dialog"` |
| `chaos-models` | `ModelCapabilities.tsx:199` | 自绘 `role="dialog"` |

实测模型选择器在 393px 视口下弹出 `{rect:[64,325,250,90], position:absolute, z:20}`
—— 桌面式锚定浮层，不是 sheet（`m40-model-menu.png`）。

`todo.md` PR 2 勾选了"Modal / Menu / Tooltip 接入该上下文"，
但**没人核对过究竟有多少 UI 真的经由 Modal/Menu 渲染**。
`packages/AGENTS.md` 的原则在此被违反：*"Enforce a decision in the operation that makes it.
Schema omission, prompt filtering, facades, wrappers ... are not enforcement when
direct or alternate callers can bypass them."*

### P1-5 触控目标普遍低于 44pt，且 `pointer: coarse` 规则只覆盖导航栏

实测（iPhone 14 Pro，`pointer: coarse`）尺寸不达标的控件：

| 控件 | 实测尺寸 |
|---|---|
| 侧栏折叠 / 新建会话 / 添加工作区 / 搜索会话 | 36×36 |
| 输入栏 `+`（命令） | 28×28 |
| 上传图片附件 | 28×28 |
| 模型能力设置 | 42×28 |
| 访问模式 | 44×28 |
| 模型选择器 | 141×28 |
| 发送按钮 | 34×34 |
| 工作区 / PTC 模式 | 114×28 / 110×28 |

`mobile.css:164-169` 的放大规则限定在 `[data-chaos-mobile-overlay] button` 之内 ——
**只作用于导航栏自己的三个按钮**，输入栏和侧栏一个都没覆盖到。

`todo.md` 却声明：`[x] 触控目标：(pointer: coarse) 下统一 44pt`。实测未达成。

### P1-6 横屏 740×360 下移动端形态与桌面网格并存，布局撕裂

断点是宽度单值 768px，`MOBILE_BREAKPOINT = 768`（`columns.ts:30`）。
740px 宽的横屏手机因此判定为"移动端"，但实测：

```
LANDSCAPE740 mobile=true navbar=true sidebarWidth=301 frameCols=56px minmax(0px, 1fr) 0px
```

导航栏出现了，**同时**侧栏仍占 301px 且 frame 仍是三列网格 —— 两套布局同时生效。
在仅 360px 高的横屏里再压上 44pt 导航栏，可用高度所剩无几。

`mobile.css:188` 只处理了 `textarea { max-height: 25dvh }`，没解决布局模型冲突。

---

## P2 — 中等

### P2-1 侧栏抽屉宽 301px 却仍渲染 56px 折叠轨，抽屉打开时右侧被遮挡

`m11-drawer.png` 可见抽屉右边缘紧贴屏幕、几乎不留 backdrop 可视区（393px 屏占 301px）。
且 `data-sidebar-collapsed` 变化只驱动 CSS transform，
`frameCols` 仍是 `280px minmax(0px,1fr) 0px` —— 网格列宽与抽屉宽度是两套并行状态。

### P2-2 安全区补偿重复计算

- `mobile.css:20-24`：`#root { padding-top: env(safe-area-inset-top) }`
- `mobile.css:86-89`：`[data-shell-column=center] { padding-top: calc(44px + env(safe-area-inset-top)) }`
- `MobileNavBar.module.css:12-13`：`height: calc(44px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 8px 0`

同一个 `safe-area-inset-top` 被叠加三次。刘海屏上 center 列会被多顶下去一个安全区高度。
（无头 Chromium 的 inset 为 0，故截图未暴露；真机 iPhone 会显现。）

### P2-3 `body { padding-bottom: env(safe-area-inset-bottom) }` 配 `box-sizing: content-box` 会溢出

实测 `BOX_SIZING body = content-box`，而 `body` 同时被设为 `height: 100dvh`。
content-box 下 padding 加在 100dvh **之外**，总高变成 `100dvh + inset-bottom`，
配合 `overflow: hidden` 会截掉底部内容。

### P2-4 导航栏 aria-label 硬编码英文，未接 i18n

```
MobileNavBar.tsx:63  aria-label="Mobile navigation"
MobileNavBar.tsx:71  aria-label="Open menu"
MobileNavBar.tsx:81  aria-label="Back"
MobileNavBar.tsx:92  aria-label="More"
```

界面其余部分均为中文（"打开侧边栏"、"新建会话"、"发送消息"），读屏体验中英混杂。

### P2-5 输入栏控件过载问题（D7）未解决，反而多了一个

`todo.md` D7 指出输入栏控件过载。实测当前一行仍有 6 个控件：
`+`(命令)、附件、访问模式、设置、模型选择、发送。

`m10-home.png` 与初版 `m01-initial.png` 对比可见：**新版多了一个回形针按钮** ——
`index.ts:62` 往 `conversation.input.left` 注册了 `AttachmentButton`，
而 `ui-attachment` 自己的"上传图片附件"按钮**依然在**。两个附件入口并存。

### P2-6 `headerUtilities` 仍在用猜哈希类名选择器

`mobile.css:135`：`[class*='headerUtilities']`。
D1 要求删除全部 22 处 `[class*=]`，剩这 1 处；文件头注释已承认是 known limitation，
但 `todo.md` PR 3 的"删除全部 22 处"仍是 `[x]`。

---

## P3 — 轻微 / 观察项

- **P3-1** 移动端首屏纵向空间浪费严重：`m10-home.png` 上方约 45% 是纯空白，
  品牌区 + 输入卡片被挤在下半屏。与 `todo.md`"排版一屏一主操作"的判定标准不符。
- **P3-2** 移动端无法进入 details 页：实测遍历所有 button 找不到"详情"触发器
  （`no details trigger found on mobile`）。back 按钮、`useDetailsHistory`、
  边缘返回手势这一整套逻辑目前**没有入口可以触达**，等于未经真实验证。
- **P3-3** 桌面端回归干净：1440×900 下无导航栏、无 `data-chaos-mobile`、
  菜单仍为 `position: absolute` 锚定浮层、无控制台报错。**桌面零风险这一条成立。**
- **P3-4** 320×568 无横向溢出（`scrollW == vw == 320`），窄屏基本盘没问题。
- **P3-5** 66 个单测全绿，却漏掉了上述全部缺陷 ——
  测试断言的是 CSS 文本与手搭 `ctx.plugin` 组合，
  没有一条在真实视口下验证过"按钮点了有反应""键盘不遮挡输入框"。
  这正是 `todo.md` 自己写下的 D9/D10，尚未真正解决。

---

## 复现方式

```bash
# 依赖：仓库内已装 playwright@1.61.1 + chromium-1228
node /tmp/shot5.mjs    # 移动端首屏
node /tmp/shot7.mjs    # 导航栏 / overflow / sheet 取证
node /tmp/shot12.mjs   # 溢出与触控目标审计
node /tmp/shot13.mjs   # 桌面端回归
node /tmp/shot17.mjs   # 安全区与横屏断点
```

## 建议修复顺序

1. **P0-1** 把四个 chaos-* 包登记进 tsconfig 聚合，修掉 `node-half.host.spec.ts` 的 TS2352，
   让 `pnpm run typecheck` / `build:lib:client` 恢复绿色 —— 否则一切修复无法验证上线。
2. **P0-2** 接上 `useKeyboardInset`，解决键盘遮挡。
3. **P1-1 / P1-2** overflow 按钮补 `onClick`（或先移除），标题接上真实会话标题。
4. **P1-4 / P1-3** 把五个自绘弹出面收编进 `Modal`/`Menu`，接缝才算真正落地。
5. **P1-5** 把 44pt 规则从 `[data-chaos-mobile-overlay]` 放宽到输入栏与侧栏。
6. **P1-6** 断点改为宽高联合判据，解决横屏撕裂。
7. 补真实视口的行为测试（P3-5），把 D9/D10 真正关掉。
