# `@deepseek-ai/dsh-plugin-chaos-think-tags`

[English](README.md) | 中文

将 assistant 文本中以 `<think>…</think>` 分隔的内容接入现有的默认折叠 Think 展开项。

## 行为

该插件只替换 `assistant-step` 对话 renderer。它会在解析分隔符之前合并相邻 text block，因此流式响应可把任意一个标签拆到多个 chunk 中。匹配区域内的内容成为 reasoning block，区域外的内容保持 assistant markdown。已有 Think 行拥有折叠摘要、展开动作和流式状态。

插件不改变 session event、provider request、持久消息，或没有匹配起始标签的文本。未闭合的起始标签会让该 assistant step 的余下内容显示在 Think 展开项中。

## 组合

`@deepseek-ai/dsh-plugin-chaos` bundle 以 `chaos-think-tags` 插入该插件。从 bundle patch 移除该行即可让 provider 输出的分隔符作为普通 assistant 文本显示。

## 模型体验

无影响。该插件只在 provider request 完成或流式输出后读取浏览器对话快照。

#### KV Cache 影响

无影响。该插件不组装也不发送 provider request。

## 已知限制与暂缓事项

- 分隔符解析仅用于呈现。历史导出和 provider 重试仍保留原始 text block 与分隔符。
- 未闭合的 `<think>` 会将该 assistant step 的余下内容视为 reasoning，与 provider 已开启区域的含义一致。
