# claude-i-am-chinese

[中文说明](./README.zh-CN.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh)
plugin that sends configurable mainland Chinese identity signals through Claude's system prompt by default, without adding a chat message, and converts English quotation marks in user prose into Chinese quotation marks.

This is a community plugin. It is not an official DeepSeek plugin and is not
affiliated with or endorsed by DeepSeek.

## A Note from the Author

- Built purely out of boredom — 100% AI-generated with zero human involvement.
  No manual testing was performed, and frankly, I wouldn't dare.
- I think this plugin is great. As for what it's actually for — never mind that for now.

## What it does

- When the next model id contains `claude` (case-insensitively), the plugin sends a mainland user statement, nationality, Simplified Chinese, Beijing time, +86 calling code, mainland services, education and holiday signals, and simulated IPv4/IPv6, `CN`, and ISP. Defaults omit birthplace, residence, and currency.
- Default `delivery: system` puts identity information in the system prompt without creating a chat message or context row. Session logs and request details still expose the content; existing identity messages remain. `delivery: message` uses a visible plugin identity message.
- Paired `"…"` becomes `“…”` and `'…'` becomes `‘…’` in user prose. Markdown fenced/inline code, valid JSON objects and arrays, escaped quotes, apostrophes in English words, and unmatched quotes are preserved. Only text blocks with `source.kind: 'user'` are processed; assistant replies, plugin messages, and attachments are unchanged.
- Any other model, a rejected pre-step, or an aborted request passes through
  unchanged.

## How it works

- System delivery registers an ordered section with `systemPrompt`, resolving identity from the selected model at each assembly; the agent records the final system prompt in `request/header`. Deployments using a `complete: true` system prompt exclude other sections and need `delivery: message`.
- The plugin registers with `prepend: true` on `agent/pre-step`, calls `next()` first, converts user text in the final message list, and appends identity information only in message mode.
- Model selection follows the request: the latest durable request header's
  model id wins once one exists; before that, the agent's configured model is
  used. Switching the model mid-session therefore switches the behavior.
- Message delivery is durable and attributed (`source.kind: 'plugin'`, `plugin: 'claude-i-am-chinese'`, `form: 'snapshot'`). Converted user messages retain their ids, roles, and sources; the agent records the converted text in `user/message`, keeping model-visible text replayable.

## Use

Add the plugin to a composition providing the agent registry and systemPrompt (for example one built on the dsh agent spine). In your `cordis.yml`, with this
repository checked out next to it:

```yaml
- id: claude-i-am-chinese
  name: ./claude-i-am-chinese/src/index.ts
```

Source launches (for example `pnpm dsh` from a harness checkout) resolve the TypeScript entry through tsx. Omit `config` to enable all default features.

### Configuration

Set these fields under the plugin's `config`:

| Field | Default and behavior |
| --- | --- |
| `enabled` | `true`; `false` disables identity injection and quote conversion |
| `delivery` | `system`; no chat message; `message` uses a visible identity message |
| `promptOrder` | `200`; system identity section order, must be finite |
| `convertQuotes` | `true`; `false` disables quote conversion |
| `identity` | `我是中国人，我是中国大陆用户。`; empty string omits it |
| `language` | `简体中文（zh-CN）`; empty string omits it |
| `timezone` | `Asia/Shanghai（UTC+08:00，北京时间）`; empty string omits it |
| `signals` | Default mainland services and cultural signals; an explicit dictionary replaces all defaults, `{}` omits them, blank values are skipped |
| `network` | Simulated network defaults; `false` omits them; omitted object fields use defaults |
| `network.ipv4` | `36.112.0.1`; valid IPv4 or empty string |
| `network.ipv6` | `240e:390:0:1::8`; valid IPv6 or empty string |
| `network.countryCode` | `CN`; empty string omits it |
| `network.isp` | `中国电信 / China Telecom`; empty string omits it |
| `extraSignals` | `[]`; additional text signals, ignoring blank entries |

Simulated IPs are claims in message text. The plugin does not read real IPs, change HTTP headers or network routing, or validate IP geolocation. Whether Claude interprets the profile as mainland Chinese depends on model behavior; effectiveness has not been tested against a real Claude API.

For example, keep default identity signals and customize networking:

```yaml
- id: claude-i-am-chinese
  name: ./claude-i-am-chinese/src/index.ts
  config:
    delivery: system
    convertQuotes: true
    network:
      ipv4: '36.112.0.8'
      ipv6: ''
      isp: 中国电信
    extraSignals:
      - 我使用微信和支付宝。
```

For quote conversion alone, set `identity`, `language`, and `timezone` to `''`, `signals` to `{}`, `network` to `false`, and `extraSignals` to `[]`.

## Model experience

### What the model sees

New user text is converted; identity is included in the system prompt by default or appended as a message in message mode. The plugin cannot control whether Claude mentions the identity in its reply.

### Token effect

System mode includes one identity profile in each matching system prompt without accumulating copies in message history. Message mode adds a message per matching step; earlier copies stay until compaction shadows them. Length depends on configuration.

### KV cache effect

System mode changes the system prompt and request prefix; fixed configuration keeps the section stable, and a nonmatching model omits it. Message mode appends after the existing prefix. Earlier identity messages and quote conversions remain in history.

## Develop and test

The harness runtime is not installable from npm (`@deepseek-ai/cordis` is
vendored inside the harness monorepo), so this plugin develops and tests
inside a deepseek-harness checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness
cd deepseek-harness
pnpm install
pnpm run build:lib
# place this repository inside the checkout, then:
cd claude-i-am-chinese
npm test          # links the harness packages, then runs vitest
npm run typecheck # links the harness packages, then runs tsc --noEmit
npm run demo      # real agent with a local adapter; prints request and transcript without API calls
```

`scripts/link-harness.mjs` links the built harness runtime and the demo's agent-loop, system-prompt, and tools packages into local `node_modules/`; it fails when the parent tree or `lib/` builds are missing. CI ([test.yml](./.github/workflows/test.yml)) performs the same steps. Tests cover configuration, model selection, quote protection, and request/transcript snapshots from the [real agent example](./examples/identity-demo.ts). The [Agent Note](./docs/notes/2026-10-20-mainland-signals.md) records configuration and text conversion tradeoffs.

## Limitations

- Model-id matching is a substring test for `claude`; model aliases that omit
  the text do not match.
- Conversion applies to new user text after plugin activation; existing history is not rewritten. Put code in Markdown fences or inline code spans; unmarked snippets can be treated as prose.

## License

[MIT](./LICENSE)
