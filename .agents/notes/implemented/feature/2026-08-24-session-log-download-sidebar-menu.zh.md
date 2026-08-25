# Agent Note: Session log download sidebar menu

[English](2026-08-24-session-log-download-sidebar-menu.md) | 中文

Status: implemented

## Problem

Session 日志下载控件占用了会话 Header，而它操作的是当前选中 Session 的持久化归档。

## Decision

已选中且非空白的 Session 侧边栏溢出菜单包含**下载日志**。该操作调用现有 Session 日志下载控制器。Header 保留 Session 范围的结果弹窗，但不再渲染下载按钮。

## Alternatives considered

**保留 Header 按钮。** 该控件会继续与其他 Session 管理操作分离，并占用有限的 Header 空间。

**在每个 Session 菜单中添加操作。** 下载跟随当前 Session 选择，因此仅在选中行提供入口可避免目标含糊。

## Consequences

归档操作被归入 Session 管理控件。斜杠命令导出仍与该操作共用同一控制器和弹窗。
