# claude-i-am-chinese

[English](./README.md)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）插件：默认通过系统提示词向 Claude 发送可配置的中国大陆身份线索，聊天界面不新增身份消息，并将用户普通文本中的英文引号转换为中文引号。

这是一个社区插件，不是 DeepSeek 官方插件，与 DeepSeek 无隶属或背书关系。

## 作者的话

- 闲的没事跑的，百分百纯AI无人工，没有也不敢进行人工测试。
- 我觉得这个插件很棒，有什么用先别管。

## 功能

- 下一次请求的模型 id 包含 `claude`（不区分大小写）时，发送大陆身份信息，默认包含大陆用户声明、国籍、简体中文、北京时间、+86 区号、常用大陆服务、教育和节日线索，以及模拟 IPv4、IPv6、`CN` 和运营商。默认不包含出生地、居住地或人民币。
- 默认 `delivery: system` 将身份信息写入系统提示词，不生成聊天消息或上下文行。会话日志和请求详情中仍可查看；已有身份消息保留。`delivery: message` 使用可见的插件身份消息。
- 默认将用户发送的普通文本中成对的 `"…"` 转为 `“…”`，`'…'` 转为 `‘…’`。Markdown 围栏代码块、行内代码、有效 JSON 对象和数组、转义引号、英文单词中的撇号和未配对引号保留原样。仅处理 `source.kind: 'user'` 的文本块；Claude 回复、其他插件消息和附件不受影响。
- 其他模型、被拒绝的 pre-step、已中止的请求均原样通过，不做任何修改。

## 工作原理

- 系统方式通过 `systemPrompt` 注册有序身份段落，每次装配时根据模型选择返回信息；agent 将最终系统提示词记入 `request/header`。若部署设置了 `complete: true` 的完整系统提示词，Harness 会排除其他段落，此时需使用 `delivery: message`。
- 插件订阅 `agent/pre-step` waterfall 事件并以 `prepend: true` 注册：先调用 `next()`，转换最终列表里的用户文本；消息方式再将身份信息追加到列表末尾。
- 模型判定跟随请求：一旦存在持久的 request header，以其中最新的模型 id 为准；此前使用 agent 配置的模型。会话中途切换模型会即时切换行为。
- 消息方式以 `source.kind: 'plugin'`、`plugin: 'claude-i-am-chinese'`、`form: 'snapshot'` 记录身份信息。转换后的用户消息保留原有 id、角色和来源，agent 将转换后的文本写入 `user/message`，模型看到的文本可以从会话日志回放。

## 使用

将插件加入提供 agent registry 和 systemPrompt 的组合（例如基于 dsh agent spine 的组合）。本仓库与其并排检出时，在 `cordis.yml` 中写入：

```yaml
- id: claude-i-am-chinese
  name: ./claude-i-am-chinese/src/index.ts
```

源码启动（例如在 harness 检出中运行 `pnpm dsh`）会通过 tsx 解析 TypeScript 入口。不写 `config` 即启用所有默认功能。

### 配置

所有设置都写在插件的 `config` 下：

| 字段 | 默认值与行为 |
| --- | --- |
| `enabled` | `true`；`false` 关闭身份信息和引号转换 |
| `delivery` | `system`；系统提示词方式不显示聊天消息；`message` 使用可见身份消息 |
| `promptOrder` | `200`；系统身份段落的排序，必须是有限数值 |
| `convertQuotes` | `true`；`false` 关闭引号转换 |
| `identity` | `我是中国人，我是中国大陆用户。`；空字符串不发送 |
| `language` | `简体中文（zh-CN）`；空字符串不发送 |
| `timezone` | `Asia/Shanghai（UTC+08:00，北京时间）`；空字符串不发送 |
| `signals` | 默认大陆服务和文化线索字典；显式配置替换整份字典，`{}` 不发送；空值跳过 |
| `network` | 默认模拟网络信息；`false` 不发送；对象中省略的字段使用默认值 |
| `network.ipv4` | `36.112.0.1`；必须是有效 IPv4 或空字符串 |
| `network.ipv6` | `240e:390:0:1::8`；必须是有效 IPv6 或空字符串 |
| `network.countryCode` | `CN`；空字符串不发送 |
| `network.isp` | `中国电信 / China Telecom`；空字符串不发送 |
| `extraSignals` | `[]`；额外文本线索，忽略空白项 |

模拟 IP 是写入消息正文的声明，不会读取真实 IP、修改 HTTP 请求头、改变网络出口或验证 IP 的地理归属。模型是否据此判断为大陆用户取决于模型行为，没有真实 Claude API 效果验证。

例如保留默认身份信息，同时指定模拟网络并增加线索：

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

仅保留引号转换时，将 `identity`、`language`、`timezone` 设为 `''`，`signals` 设为 `{}`，`network` 设为 `false`，`extraSignals` 设为 `[]`。

## 模型体验

### 模型看到什么

匹配请求中的新用户文本经过引号转换；身份信息默认进入系统提示词，消息方式则追加一条身份消息。插件不会控制 Claude 是否在回复中提到身份信息。

### Token 影响

系统方式在每个匹配请求的系统提示词中包含一份身份信息，不在消息历史中积累副本。消息方式每个匹配步骤增加一条身份消息，先前副本保留至压缩遮蔽。长度取决于配置。

### KV 缓存影响

系统方式会改变系统提示词及请求前缀；固定配置保持该段落稳定，切换到不匹配模型时不发送该系统段落。消息方式追加在既有前缀之后。历史身份消息和引号转换不会被撤销。

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
npm run demo      # 本地适配器驱动实际 agent，打印请求与会话文本；不调用真实 API
```

`scripts/link-harness.mjs` 会在本地创建 `node_modules/`，链接 harness 已构建的运行时及示例所需的 agent-loop、system-prompt、tools 包；父目录树或其 `lib/` 构建缺失时会报错。CI（[test.yml](./.github/workflows/test.yml)）执行同样的步骤。测试覆盖配置、模型匹配、引号保护规则，以及[实际 agent 示例](./examples/identity-demo.ts)的请求与会话快照。[设计说明](./docs/notes/2026-10-20-mainland-signals.md)记录配置和文本转换的取舍。

## 限制

- 模型判定是对 `claude` 的子串匹配；省略该文字的模型别名不会匹配。
- 引号转换仅处理插件启用后的新用户文本，不重新改写已有会话历史。代码请放在 Markdown 围栏或行内代码中；裸露的程序片段可能被当作普通文本。

## 许可证

[MIT](./LICENSE)
