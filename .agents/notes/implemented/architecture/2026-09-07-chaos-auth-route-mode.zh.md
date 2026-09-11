# Agent Note：chaos-auth 双模式——发布的 webserver 上用入口路由门禁

状态：已实现

[English](2026-09-07-chaos-auth-route-mode.md) | 中文

## 问题

`chaos-auth` 只支持 fork `dsh-host-webserver` 的 `registerGuard`/`registerUpgradeGuard` 拦截缝，在旧宿主上于激活时抛出异常。发布的 `dsh-host-webserver`（0.1.2 全系）只有命名路由、逐路径 upgrade 属主与单一 fallback 席位，没有任何全请求守卫缝；全局 dsh 更新到发布版后，profile 里挂载的 chaos-auth 让整棵插件树加载失败。

## 决策

`apply` 在激活围栏后探测 webserver 表面并二选一：

- **守卫模式**（fork 宿主）：行为不变——请求守卫与升级守卫拦截一切。
- **路由模式**（发布宿主）：注册一条 `/` 精确路由。未认证浏览器 302 到 `/auth/login`；已认证 302 到 `/index.html`（SPA fallback 属主继续提供 dist）；携带 `?token=` 的请求交给 `connection.authorizeIndex` 在 `/` 原地处理——那是它消费启动令牌并签发浏览器会话 cookie 的唯一路径名（`authorizeIndex` 对 `url.pathname === '/'` 有硬编码要求，重定向到 `/index.html?token=` 会被 401 拒绝）。WebSocket 升级与 `/api` 由 client-connection 自身的通道认证保护。

登录/登出路由、`SessionStore`、凭据解析与激活条件在两种模式下完全共享。

## 考虑过的替代方案

**接管 fallback 席位自建静态服务。** 拒绝——frontend-static 由 `dsh-web-app` 在 `ctx.plugin` 里程序化挂载，无法经 profile 补丁禁用，席位冲突会让 web-runtime 直接失败。

**把通行密钥门户移到 caddy basicauth。** 拒绝——会改变既有门户体验（浏览器原生对话框替代定制登录页），且要求用户改 caddy 配置。

**给 `?token=` 重定向到 `/index.html?token=`。** 被 `authorizeIndex` 的路径名检查否决（401）。

## 后果

发布 dsh 上 profile 能完整加载，门户体验（定制登录页 + 通行密钥 + 会话 cookie）保持不变。代价：路由模式只门禁 SPA 入口——`/api`、WebSocket 升级与静态资源继续依赖 client-connection 认证与公开 dist 提供，这与上游自身部署模型一致，已在 README 已知限制中记录。守卫模式覆盖不变。

## 测试

`npx vitest run packages/extensions/chaos-auth`——33/33，新增 `tests/root-route.spec.ts` 覆盖路由模式三向行为（未认证重定向、令牌透传、已认证重定向）。另在发布 0.1.2-rc.1 上以真实 profile 做了组合启动与浏览器端到端验证：门户渲染、通行密钥登录、重定向链、SPA 启动与 Models 设置页全部通过。
