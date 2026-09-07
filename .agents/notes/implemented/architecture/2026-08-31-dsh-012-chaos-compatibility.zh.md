# Agent Note：dsh 0.1.2 客户端兼容适配器

Status: implemented

[English](2026-08-31-dsh-012-chaos-compatibility.md) | 中文

## 问题

Chaos 扩展最初面向更旧的 dsh 浏览器与 web 服务器表面编写。已安装的 dsh 0.1.2 客户端通过 `ctx.remote.settings` 暴露设置，而扩展仍依赖旧版 connection API；当前的 web 服务器也没有暴露新的请求守卫方法。

## 决策

读写走当前的 settings remote，同时通过一个窄作用域的适配器保留既有组件 API；模型目录走 session remote，因为运行时 remote 不是 session 服务。retry dock 的异常结束状态从会话快照派生，因此不需要崩溃恢复事件注册表。认证预先要求两个 web 服务器守卫方法，缺失时在激活处抛错。

## 考虑过的替代方案

**fork 会话与设置表面。** 否决：复制上游 UI 会把每个上游修复都拖进 fork；适配器让一个组件契约覆盖已安装的运行时。

**运行时继续容忍缺失的守卫方法。** 否决：警告后继续会让受保护的部署静默失去认证；在激活处失败能立即点名过期的主机。

## 后果

模型能力对话框使用当前的一元 settings remote 并保留 revision 感知写入。retry dock 在任何 dsh 构建上都可用，不依赖事件注册表。认证要求 dsh web 服务器实现两个守卫方法，旧主机在激活处失败。聚焦测试与包 bundle 覆盖了变更模块。
