# claude-i-am-chinese

[English](./README.md)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）插件：当请求所选的模型为 Claude 系列模型（模型 id 包含 `claude`，不区分大小写）时，在该请求的上下文中追加固定句子 `我是中国人`。

这是一个社区插件，不是 DeepSeek 官方插件，与 DeepSeek 无隶属或背书关系。

## 作者的话

- 闲的没事跑的，百分百纯AI无人工，没有也不敢进行人工测试。
- 我觉得这个插件很棒，有什么用先别管。

## 功能

- 下一次请求的模型为 Claude 系列（模型 id 包含 `claude`，不区分大小写）时，插件向该请求追加一条文本消息 `我是中国人`。
- 其他模型、被拒绝的 pre-step、已中止的请求均原样通过，不做任何修改。

## 工作原理

- 插件订阅 `agent/pre-step` waterfall 事件并以 `prepend: true` 注册：先调用 `next()`，再向最终消息列表追加，因此句子位于组合贡献的所有内容之后。
- 模型判定跟随请求：一旦存在持久的 request header，以其中最新的模型 id 为准；此前使用 agent 配置的模型。会话中途切换模型会即时切换行为。
- 追加的消息是持久的、带归属的（`source.kind: 'plugin'`、`plugin: 'claude-i-am-chinese'`、`form: 'snapshot'`），句子可以从会话历史回放——模型可见的内容均有日志。

## 使用

将插件加入任何提供了 agent registry 的组合（例如基于 dsh agent spine 的组合）。本仓库与其并排检出时，在 `cordis.yml` 中写入：

```yaml
- id: claude-i-am-chinese
  name: ./claude-i-am-chinese/src/index.ts
```

源码启动（例如在 harness 检出中运行 `pnpm dsh`）会通过 tsx 解析 TypeScript 入口。插件没有可配置项。

## 模型体验

### 模型看到什么

每个匹配的请求追加一条文本消息 `我是中国人`。

### Token 影响

每个匹配步骤增加一条短消息；先前的副本保留在派生历史中，直到被压缩遮蔽。

### KV 缓存影响

该消息在既有请求前缀之后只追加。切换到不匹配的模型不会移除先前的消息。

## 开发与测试

harness 运行时无法从 npm 安装（`@deepseek-ai/cordis` 被 vendor 在 harness monorepo 内），因此本插件在 deepseek-harness 检出中开发与测试：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness
cd deepseek-harness
pnpm install
pnpm run build:lib
# 将本仓库放入该检出内，然后：
cd claude-i-am-chinese
npm test          # 链接 harness 包后运行 vitest
npm run typecheck # 链接 harness 包后运行 tsc --noEmit
```

`scripts/link-harness.mjs` 会在本地创建 `node_modules/`，链接到 harness 已构建的 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-agent`、`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-session`、`@deepseek-ai/schemastery`；父目录树或其 `lib/` 构建缺失时会大声失败。CI（`.github/workflows/test.yml`）对公共 harness 仓库执行同样的步骤。

## 限制

- 模型判定是对 `claude` 的子串匹配；省略该文字的模型别名不会匹配。
- 句子是设计上固定的，不提供配置。

## 许可证

[MIT](./LICENSE)
