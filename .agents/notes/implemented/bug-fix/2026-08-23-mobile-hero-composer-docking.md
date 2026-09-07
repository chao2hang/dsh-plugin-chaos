# Agent Note: mobile hero composer docking

Status: implemented

English | [中文](2026-08-23-mobile-hero-composer-docking.zh.md)

## Problem

On a phone, the new-session hero flex-centered the composer stack in the column: the input card floated mid-screen with the lower half empty, and tapping the model chip opened the compact model menu at the screen floor — far from its trigger. The menu pins to `calc(88px + safe-area-inset-bottom)`, the spot of a docked composer, so the centered hero broke that contract for every control anchored to it.

## Decision

`mobile.css` docks the hero phase's scroll body (`justify-content: flex-end` over the stable `[data-phase='hero'] [data-conversation-scroll]` anchors) while `data-chaos-mobile` is set. The hero chrome (brand mark, workspace row) rides down with the card; the desktop centering rule is untouched.

## Alternatives considered

**Re-anchor the bottom popups to the hero.** Rejected: every bottom-anchored popup shares the docked-composer contract, so each one would re-implement the same fix while the floating card itself stays broken.

**Dock through a fork-owned hero component.** Rejected: a fork component would duplicate the phase chrome to change one layout property; the stable data-phase anchors already identify the scroll body.

## Consequences

The hero composer rests at the column floor on phones and every bottom-anchored popup opens beside its trigger. `apps/web/tests/mobile-hero-composer.e2e.ts` pins both geometries at a phone viewport: card within 64px of the floor, open menu within 80px of the trigger top.
