# `@deepseek-ai/dsh-plugin-chaos-desktop-panel`

[English](README.md) | 中文

DeepSeek Harness Web GUI 的桌面工作台，交互模型选择性移植自 MIT 许可的 [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)。

## 用途

工作台在右上角提供与参考实现一致的控制：占用主界面宽度的右侧面板和可选的底部停靠区。两者可分别打开；可拖拽调整手柄，或聚焦手柄后使用方向键。右侧面板限制在 320–760 px，底部停靠区至少保留 160 px 的可用高度。状态按当前会话保存到浏览器本地存储。

右侧与底部工作台提供可展开且可搜索、支持文本上传的工作区文件树，带 HTML sandbox 预览和下载的可编辑文本文件标签，Git 审查、按会话和可见窗格隔离、具有受限回放和重连宽限期的常驻 Bash PTY、带历史导航的隔离浏览器、显示生命周期、生产者、时间与详情的当前会话后台任务和辅助对话。宿主路由要求同源请求，将每个选中的活动会话解析到其不可变的 `cwd`，拒绝指定未知会话或没有工作目录的会话，并且仅在请求未指定会话时使用 Web 服务进程目录。

内置浏览器仅接受非本机 HTTP/HTTPS 地址，并使用 iframe sandbox 与 `no-referrer` 策略。

## 组合

宿主部分在 `webServer` 上注册同源路由；浏览器部分通过 ui-layout 的 `shell.overlay` 插槽挂载 `DeskPanel`。Chaos Web bundle 的 `chaos-desktop-panel` 条目启用该插件。

## 终端配置

可选的 Cordis 设置 `terminal.argv`、`terminal.reconnectGraceMs`、`terminal.transcriptBytes` 和 `terminal.terminationGraceMs` 用于选择进程并限制重连、回放保留量和子进程终止宽限期。无效类型或值会阻止插件加载。默认 argv 为 `/bin/bash --noprofile --norc -i`。

## 模型体验

无。此浏览器工作台不新增模型可见指令、工具、Token 或 KV-cache 输入。

## 已知限制与延后工作

终端仅在当前 DSH 进程中持续：浏览器可在 30 秒宽限期内重连，但 DSH 重启后不会保留，并且当前使用纯流式 transcript 而非 escape-sequence emulator。Git 审查支持受限文件的暂存/取消暂存/丢弃、使用受限说明提交已暂存变更、本地分支切换和 30 条历史记录。escape-sequence emulator、连接后的终端 resize、Git 历史操作、还原/cherry-pick 和插件定义的工作台标签页仍待实现。
