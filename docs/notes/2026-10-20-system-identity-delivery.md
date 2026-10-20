# Agent Note: System identity delivery without a chat message

Status: implemented

## Problem

Attributed identity messages appear as expandable context rows in the Harness chat UI. The user requests background identity delivery without those rows, while [the identity profile and quote conversion](./2026-10-20-mainland-signals.md) remain active.

## Decision

`delivery` defaults to `system`. The plugin registers a named system section at configurable `promptOrder` and resolves its text from the assembly's agent and latest selected model. A prompt variable inserts custom text literally, avoiding interpolation of braces inside identity claims. The agent logs the final system prompt in `request/header` and sends that same text to the model. No plugin user/message is created in this mode, so the chat classifier has no identity row to render.

`delivery: message` retains the attributed snapshot path for deployments that need it. Quote conversion stays on the existing pre-step waterfall. Registrations belong to the plugin context and disappear on disposal.

## Alternatives considered

**A hidden flag on the message source.** The current Harness message and chat classifier APIs provide no supported per-message hidden option. Adding an ignored flag would still show an identity row, while patching unrelated client packages would couple this community plugin to UI internals.

**Injecting unlogged text into provider requests.** This would violate the Harness requirement that model-visible content can be reconstructed from session records. The system prompt already has a supported durable path.

## Consequences

Identity content leaves the chat message list but remains readable in session logs, request inspection, configuration, and the model's possible replies. Existing identity messages are preserved. The identity section is part of the system prefix rather than append-only chat history, so switching delivery or model can invalidate prompt caching. System mode does not accumulate one message per step.

Deployments with an effective complete system prompt exclude contributed sections; they need message mode to send the profile. The plugin does not change the full-prompt precedence rule.

## Testing

Unit tests verify default system mode, model-header precedence, aborted assembly, invalid delivery and prompt order, and disposal. The [real agent example](../../examples/identity-demo.ts) and its [snapshot tests](../../tests/identity-demo.spec.ts) verify equality between transmitted and logged system text, absence of identity user/message rows, literal custom braces, unchanged assistant quotes, and explicit message mode.
