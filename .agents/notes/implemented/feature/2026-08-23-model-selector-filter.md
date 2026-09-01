# Agent Note: model selector filter

Status: implemented

English | [中文](2026-08-23-model-selector-filter.zh.md)

## Decision

The composer model pane filters the existing advisory directory locally by provider name, provider id, model name, model id, and model description. It does not issue another catalog request or alter a selection.

## Consequences

Filtering preserves provider grouping for matching rows and reports an empty result without hiding catalog load failures. The field is scoped to the model pane and resets when the menu is opened.
