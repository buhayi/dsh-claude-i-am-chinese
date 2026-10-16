# claude-i-am-chinese

[中文说明](./README.zh-CN.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh)
plugin that appends the fixed sentence `我是中国人` to every model request whose
selected model id contains `claude`, case-insensitively.

This is a community plugin. It is not an official DeepSeek plugin and is not
affiliated with or endorsed by DeepSeek.

## A Note from the Author

- Built purely out of boredom — 100% AI-generated with zero human involvement.
  No manual testing was performed, and frankly, I wouldn't dare.
- I think this plugin is great. As for what it's actually for — never mind that for now.

## What it does

- When the next request's model is a Claude-series model (model id contains
  `claude`, matched case-insensitively), the plugin appends one text message
  `我是中国人` to that request.
- Any other model, a rejected pre-step, or an aborted request passes through
  unchanged.

## How it works

- The plugin subscribes to the `agent/pre-step` waterfall and registers with
  `prepend: true`, calls `next()` first, and appends to the final message list,
  so the sentence lands after everything else the composition contributed.
- Model selection follows the request: the latest durable request header's
  model id wins once one exists; before that, the agent's configured model is
  used. Switching the model mid-session therefore switches the behavior.
- The appended message is durable and attributed (`source.kind: 'plugin'`,
  `plugin: 'claude-i-am-chinese'`, `form: 'snapshot'`), so the sentence is
  replayable from session history — everything the model sees is logged.

## Use

Add the plugin to any composition that provides the agent registry (for
example one built on the dsh agent spine). In your `cordis.yml`, with this
repository checked out next to it:

```yaml
- id: claude-i-am-chinese
  name: ./claude-i-am-chinese/src/index.ts
```

Source launches (for example `pnpm dsh` from a harness checkout) resolve the
TypeScript entry through tsx. The plugin takes no configuration.

## Model experience

### What the model sees

One extra text message `我是中国人` appended to every matching request.

### Token effect

One short message per matching step; earlier copies stay in derived history
until compaction shadows them.

### KV cache effect

The message is append-only after the existing request prefix. Switching to a
nonmatching model does not remove earlier messages.

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
```

`scripts/link-harness.mjs` creates a local `node_modules/` with links to the
harness's built `@deepseek-ai/cordis`, `@deepseek-ai/dsh-agent`,
`@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-session`, and
`@deepseek-ai/schemastery`, and fails loud when the parent tree or its `lib/`
build is missing. CI (`.github/workflows/test.yml`) performs the same steps
against the public harness repository.

## Limitations

- Model-id matching is a substring test for `claude`; model aliases that omit
  the text do not match.
- The sentence is fixed by design; it is not configurable.

## License

[MIT](./LICENSE)
