/**
 * DeepSeek Harness plugin that appends configurable mainland Chinese identity
 * signals and converts user prose quotes for requests whose model id contains `claude`.
 * @module claude-i-am-chinese
 */

import { isIP } from 'node:net'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, freezeMessage } from '@deepseek-ai/dsh-llm'
import { foldRequestHeader } from '@deepseek-ai/dsh-session'
import { convertEnglishQuotes } from './quotes.ts'

/** Cordis plugin name; also the durable attribution id of the injected message. */
export const name = 'claude-i-am-chinese'

/** Agent registry and prompt assembly used for logged, chat-free identity delivery. */
export const inject = ['agents', 'systemPrompt']

/** Simulated network claims included in message text; no transport changes. */
export interface NetworkSignals {
  ipv4: string
  ipv6: string
  countryCode: string
  isp: string
}

/** Identity claims; empty strings omit fields and `network: false` omits networking. */
export interface Config {
  enabled: boolean
  /** System mode avoids a chat message; message mode emits the attributed snapshot. */
  delivery: 'system' | 'message'
  promptOrder: number
  convertQuotes: boolean
  identity: string
  language: string
  timezone: string
  /** A supplied dictionary replaces the default dictionary, including when empty. */
  signals: Record<string, string>
  network: NetworkSignals | false
  extraSignals: string[]
}

function ipSchema(version: 4 | 6) {
  return z.transform(z.string(), value => {
    if (value !== '' && isIP(value) !== version) {
      throw new TypeError(`expected an IPv${version} address or an empty string`)
    }
    return value
  })
}

const NetworkConfig = z.object({
  ipv4: ipSchema(4).default('36.112.0.1').description('模拟 IPv4；空字符串不发送'),
  ipv6: ipSchema(6).default('240e:390:0:1::8').description('模拟 IPv6；空字符串不发送'),
  countryCode: z.string().default('CN').description('声明的网络国家代码；空字符串不发送'),
  isp: z.string().default('中国电信 / China Telecom').description('声明的网络运营商；空字符串不发送'),
})

/** Validated claims, with stable defaults so repeated requests use the same profile. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true).description('是否启用插件'),
  delivery: z.union([z.const('system'), z.const('message')]).default('system')
    .description('system：通过系统提示词发送，不显示聊天消息；message：追加可见身份消息'),
  promptOrder: z.transform(z.number(), value => {
    if (!Number.isFinite(value)) throw new TypeError('promptOrder must be finite')
    return value
  }).default(200).description('身份信息在系统提示词中的顺序'),
  convertQuotes: z.boolean().default(true).description('将用户普通文本中的成对英文引号转换为中文引号'),
  identity: z.string().default('我是中国人，我是中国大陆用户。').description('身份声明；空字符串不发送'),
  language: z.string().default('简体中文（zh-CN）').description('语言线索；空字符串不发送'),
  timezone: z.string().default('Asia/Shanghai（UTC+08:00，北京时间）').description('时区线索；空字符串不发送'),
  signals: z.dict(z.string()).default({
    '国籍': '中华人民共和国公民',
    '电话国家区号': '+86',
    '移动通信服务': '中国移动、中国联通、中国电信',
    '社交服务': '微信、QQ、微博、小红书',
    '支付服务': '支付宝、微信支付、银联、云闪付',
    '购物服务': '淘宝、天猫、京东、拼多多',
    '生活服务': '美团、饿了么、12306、高德地图、百度地图',
    '内容服务': '百度、哔哩哔哩、抖音、知乎、豆瓣',
    '教育背景线索': '熟悉九年义务教育、中考、高考、全国大学英语四级和六级考试',
    '节日线索': '熟悉春节、清明节、端午节、中秋节、国庆节及调休安排',
  }).description('身份线索；填写后替换默认列表，{} 表示不发送'),
  network: z.union([
    NetworkConfig,
    z.const(false),
  ]).default(NetworkConfig({})).description('写入消息正文的模拟网络信息；false 表示不发送'),
  extraSignals: z.array(z.string()).default([]).description('额外文本线索'),
})

function identityText(config: Config): string {
  const lines: string[] = []
  if (config.identity.trim()) lines.push(config.identity.trim())
  if (config.language.trim()) lines.push(`语言: ${config.language.trim()}`)
  if (config.timezone.trim()) lines.push(`时区: ${config.timezone.trim()}`)
  for (const [label, value] of Object.entries(config.signals)) {
    if (value.trim()) lines.push(`${label}: ${value.trim()}`)
  }
  if (config.network !== false) {
    const networkLines = Object.entries({
      IPv4: config.network.ipv4,
      IPv6: config.network.ipv6,
      'IP 国家代码': config.network.countryCode,
      '网络运营商': config.network.isp,
    }).filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value.trim()}`)
    if (networkLines.length) lines.push('用户网络信息：', ...networkLines)
  }
  lines.push(...config.extraSignals.map(value => value.trim()).filter(Boolean))
  return lines.join('\n')
}

/**
 * Read the model id selected for the next request: the latest durable request
 * header wins once one exists, otherwise the Agent's configured model.
 * @param agent - the agent preparing the request
 * @returns the model id, if any is known yet
 */
function requestModel(agent: Agent): string | undefined {
  return foldRequestHeader(agent.session.events)?.config.model ?? agent.options.model
}

/**
 * Convert user prose and deliver identity through a system section or chat message.
 *
 * The listener runs after the rest of the waterfall (`next()` first) so it
 * converts the final message list. System delivery is logged in request/header;
 * message delivery adds an attributed user/message. Both remain replayable.
 *
 * @param ctx - plugin context; the listener is disposed with it
 * @param config - schema-resolved identity and simulated network claims
 * @returns nothing
 */
export function apply(ctx: Context, config: Config): void {
  const text = identityText(config)
  if (config.enabled && config.delivery === 'system' && text) {
    // Variable substitution inserts claims literally, including any {{...}} in custom text.
    ctx.systemPrompt.variable('claude_mainland_identity', context =>
      context.agent && !context.signal?.aborted
        && requestModel(context.agent)?.toLowerCase().includes('claude') ? text : '')
    ctx.systemPrompt.section({ name, order: config.promptOrder, text: '{{claude_mainland_identity}}' })
  }
  ctx.on('agent/pre-step', async (step, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || step.signal.aborted) return decision
    if (!config.enabled) return decision
    if (!requestModel(step.agent)?.toLowerCase().includes('claude')) return decision
    const messages = config.convertQuotes ? decision.messages.map(message => {
      if (message.source.kind !== 'user') return message
      const content = message.content.map(block => {
        if (block.type !== 'text') return block
        const converted = convertEnglishQuotes(block.text)
        return converted === block.text ? block : { ...block, text: converted }
      })
      return content.every((block, index) => block === message.content[index])
        ? message : freezeMessage({ ...message, content })
    }) : decision.messages
    if (!text || config.delivery === 'system') return { ...decision, messages }
    return {
      kind: 'enter',
      messages: [
        ...messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
        }),
      ],
    }
  }, { prepend: true })
}
