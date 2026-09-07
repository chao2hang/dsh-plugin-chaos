# Agent Note: model selector filter

Status: implemented

English | [中文](2026-08-23-model-selector-filter.zh.md)

## Problem

The advisory model directory lists every provider group and model it knows; finding one model meant scrolling the whole directory with no way to narrow it.

## Decision

The composer model pane filters the existing advisory directory locally by provider name, provider id, model name, model id, and model description. It does not issue another catalog request or alter a selection.

## Alternatives considered

**Re-query the catalog with the filter.** Rejected: the directory is already loaded and advisory, so a second request adds latency and a new failure mode for no information gain.

**Filter on a single field.** Rejected: users match on provider names, model ids, and descriptions alike; a single-field filter would hide rows a multi-field substring finds.

## Consequences

Filtering preserves provider grouping for matching rows and reports an empty result without hiding catalog load failures. The field is scoped to the model pane and resets when the menu is opened.
