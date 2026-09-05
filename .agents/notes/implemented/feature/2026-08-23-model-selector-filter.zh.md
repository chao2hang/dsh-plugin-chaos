# Agent Note: model selector filter

Status: implemented

[English](2026-08-23-model-selector-filter.md) | 中文

## Decision

输入框的模型页会在本地按提供方名称、提供方 ID、模型名称、模型 ID 与模型说明筛选已有的建议目录。它不会再次请求目录，也不会改变选择。

## Consequences

筛选会保留匹配行的提供方分组，并在无结果时报告空结果，不会隐藏目录加载失败。该字段仅属于模型页，并在每次打开菜单时重置。
