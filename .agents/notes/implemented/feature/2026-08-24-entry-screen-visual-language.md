# Agent Note: Chinese ink-seal language for protected and boot entry screens

Status: implemented

English | [中文](2026-08-24-entry-screen-visual-language.zh.md)

## Problem

The protected login screen and framework-free web boot page are the first product states a visitor sees. Generic English copy, blue-accent chrome, and an unstyled loading indicator made those states feel unrelated to the Chinese web interface.

## Decision

The server-rendered login screen and `dsh-client-web` boot page use a shared warm-ink palette, paper-white text, cinnabar emphasis, Song-style Chinese typography, and the 「启」 seal. Product-facing entry copy is Chinese. The boot page owns its early-start colors and type stack because it renders before the theme plugin; `body[data-ds-dark-theme]` selects the dark ink palette, and the default is a paper-like light palette. The loading progress arc and complete failure diagnostics remain available. Failure reports use a Chinese title and preserve loader identifiers and report text unchanged.

## Alternatives considered

- **Use the ordinary UI theme tokens** — this would align with the loaded application, but the boot page must render when that token stylesheet or its plugin has failed.
- **Use gradients and illuminated effects as the visual signature** — these effects communicate generic AI-product styling rather than the restrained editorial character required for the entry flow.

## Consequences

- Protected and boot states share an identifiable visual language before the application mounts.
- The boot page keeps a small self-contained stylesheet that intentionally duplicates its early-start color and font choices.
- The post-boot application can retain its independently selected theme and component tokens.
- Boot-page tests pin the Chinese loading and failure states, ARIA status/alert semantics, progress arc, and persisted dark-theme background.
