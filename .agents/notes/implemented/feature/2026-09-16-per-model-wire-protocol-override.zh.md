# Agent Note: Per-model wire-protocol override for pi-ai routes

Status: implemented

[English](2026-09-16-per-model-wire-protocol-override.md) | 中文

## 问题

`llm-pi-ai` 的提供方路由只为整条路由命名一个线协议，而手工声明的网关只配置一个固定的 `baseURL`。现实中的多协议网关——聚合端点尤其如此——对外只暴露一个端点，却服务多种线格式：有的模型讲 Chat Completions，有的讲 Anthropic Messages，还有的讲 Google 的 Generative Language API。要用上这些模型，只能把提供方拆成多条 `api` 不同的路由，这会复制凭据引用与标头、割裂模型目录，还把物理上的同一个端点描述成多个。输入框的能力对话框（chaos-models）也无法表达这种差别：它编辑的是逐模型字段，而协议只存在于路由层。

## 决策

模型条目——`models[]` 的项或 `modelOverrides` 的值——接受 `api`，且条目优先于路由层字段。解析按 `entry.api ?? route.api ?? 已安装 catalog 协议 ?? 同路由已发布模型的共享协议` 分层，因此每个条目都自报协议的手工声明路由可以完全省去路由级 `api`。

提供方构造跟随解析后的模型集合：每个模型都保持其已安装 catalog 条目协议的路由仍原样复用 catalog 提供方；单协议路由的构造与从前完全一致；模型协议不一致的路由则按模型分发构造——即 pi-ai 的 api-map 形态——适配器协议表能服务的协议全部就地构造，而保持表外 catalog 协议（Bedrock、Vertex、Azure、Codex）的模型委托给已安装的 catalog 提供方。协议表本身新增 `google-generative-ai`，其密钥标头认证是 profile 能够表达的；此前缺席只是因为没有消费方。

chaos-models 的能力对话框随之新增「API 覆盖」选择器，选项即该词表。保存时经同一条设置路径变更写入模型条目的 `api`；选回默认则移除该键，模型回落到提供方的协议。已安装构建无法服务的协议会在设置写入处被两个层级共享的 schema 联合类型大声拒绝。

## 备选方案

**每种协议一条路由。** 不动解析也能工作，但每份副本都要复制凭据引用、标头与探测配置，把一个端点割裂成目录里的多条目，且无法表达「同一个端点、只有一个例外模型」——部署方要永远手工维护这种拆分。

**模型覆盖让位于路由协议。** 反过来的优先级让解析更简单（路由级 `api` 本就意为「替换每个 catalog 模型自己的协议」），但它会击垮主要场景：手工声明的网关今天就必须命名路由协议，输给它的模型级覆盖永远无法生效。

**对话框从 settings schema 联合类型读取协议选项**（如 Models 设置页经 settings schema 服务所做）。构造上零漂移，但这会把功能插件耦合进 schema 信封的内部表示，并为四个稳定标识符增加一条服务边；硬编码词表沿循既有 `THINKING_LEVELS` 的先例，过时的条目会在写入时失败，而不是发出端点无法解析的请求。

## 后果

一个固定的 `baseURL` 无需拆分路由即可服务混合协议的模型目录，能力对话框也在它早已编辑的容量旁覆盖了协议选择。过时的对话框词表会在写入处被抓住，而不是静默发出端点无法解析的请求。代价是：带有一个改指模型的 catalog 路由不再把它的模型整体委托给 catalog 提供方——保持表内协议的模型改由适配器自行构造，接线的是 pi-ai 工厂所用的同一批惰性实现并保留 catalog 认证，但会丢掉 catalog 提供方携带的其他东西（其动态模型刷新本就被复用路径丢弃）。catalog.spec 套件钉住条目优先、仅条目声明的手工路由、`modelOverrides` 改指并保留同级、经 Bedrock 实现自身 error 事件验证的 catalog 委托，以及双协议线路路径与各自的认证标头；config.spec 钉住两个层级的 schema 边界；models.client.spec 在两条写路径上钉住设置、清除与保持。
