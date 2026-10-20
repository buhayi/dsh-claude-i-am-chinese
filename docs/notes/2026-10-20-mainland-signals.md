# Agent Note: Configurable mainland identity signals and user quote conversion

Status: implemented

## Problem

A fixed identity sentence supplies few mainland Chinese signals and gives users no control over the profile. Users also need Chinese quotation marks in prose submitted to Claude without corrupting code or JSON.

## Decision

The plugin uses schema-validated configuration for identity, Simplified Chinese, Shanghai time, calling code, service and cultural signals, simulated network information, and arbitrary additional text. Defaults omit birthplace, residence, and currency. A supplied signal dictionary replaces the default dictionary; empty strings omit individual fields. Network fields use stable defaults rather than random values so one session presents a consistent profile.

The pre-step waterfall delegates first and converts new user text while retaining message identity and source. Identity delivery defaults to a logged system section; explicit message mode appends an attributed identity snapshot. The [system delivery decision](./2026-10-20-system-identity-delivery.md) owns this choice. Only Claude model ids match, following the latest request header.

Quote conversion pairs ASCII quotes in prose, preserving fenced and inline code, valid JSON objects and arrays, escaped quotes, English apostrophes, and unmatched delimiters. Other plugin messages, attachments, and assistant replies are unchanged.

## Alternatives considered

**Sending actual or simulated transport headers.** The existing extension point provides model messages rather than networking configuration. Text claims satisfy the requested information injection without changing provider routing or relying on undocumented forwarding headers.

**Replacing every ASCII quotation mark.** Blind replacement corrupts JSON, code, and contractions. Paired prose conversion retains those protected spans; users mark other code with Markdown.

**Randomizing the profile every request.** Changing IPs and other claims adds contradictory history and unnecessary request variation. Stable configurable values keep repeated steps consistent.

## Consequences

The expanded default profile costs more tokens per matching request. Explicit message mode retains earlier copies in history until compaction, including when the selected model changes. Text claims do not change the real network source or prove geographic origin. Their effect on Claude identity recognition is unverified against a real API.

## Testing

Unit tests cover profile overrides, omitted fields, IP syntax validation, model selection, rejected/aborted steps, immutable message identity, and protected quote spans. The runnable [local example](../../examples/identity-demo.ts) uses the actual agent loop with a deterministic adapter; its [snapshot test](../../tests/identity-demo.spec.ts) checks that recorded user content and system prompt equal model request content and assistant quotes remain unchanged. No real provider call is required.
