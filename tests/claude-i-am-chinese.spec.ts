import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, assembleContextFor, Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { createUserMessage, type ImageBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as plugin from '../src/index.ts'

const IDENTITY = '我是中国人，我是中国大陆用户。'

function parseConfig(raw: unknown): plugin.Config {
  const result = plugin.Config['~standard'].validate(raw)
  if ('then' in result) throw new Error('expected synchronous config')
  if (result.issues) throw new Error(result.issues.map(issue => issue.message).join('\n'))
  return result.value as plugin.Config
}

function createAgent(model: string, headerModel?: string): Agent {
  const session = Session.create(SessionId(`claude-i-am-chinese-${model}`))
  if (headerModel !== undefined) session.append('request/header', {
    header: { config: { provider: 'test', model: headerModel } },
    reason: 'initial',
  })
  return {
    id: SessionId(`agent-${model}`),
    options: { model },
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'running',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

async function prepare(
  agent: Agent,
  signal = new AbortController().signal,
  config: Partial<plugin.Config> = {},
  inputs?: UserMessage[],
) {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  const fiber = await ctx.plugin(plugin, parseConfig({ delivery: 'message', ...config }))
  const original = createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } })
  const messages = inputs ?? [original]
  const decision = await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages, turn: 1, step: 1, signal },
    () => Promise.resolve({ kind: 'enter' as const, messages }),
  )
  await fiber.dispose()
  return decision
}

describe('claude-i-am-chinese', () => {
  it('appends one durable-source message for case-insensitive Claude model ids', async () => {
    const decision = await prepare(createAgent('Vendor/Claude-Sonnet'))
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') return
    expect(decision.messages).toHaveLength(2)
    expect(decision.messages[0]?.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(decision.messages[1]).toMatchObject({
      content: [{ type: 'text', text: expect.stringContaining(IDENTITY) }],
      source: {
        kind: 'plugin',
        plugin: 'claude-i-am-chinese',
        form: 'snapshot',
        sections: [{ name: 'claude-i-am-chinese', text: expect.stringContaining(IDENTITY) }],
      },
    })
  })

  it('lets the request-header model override the agent default in both directions', async () => {
    const towardsClaude = await prepare(createAgent('deepseek-v4-flash', 'claude-sonnet'))
    expect(towardsClaude.kind).toBe('enter')
    if (towardsClaude.kind === 'enter') {
      expect(towardsClaude.messages).toHaveLength(2)
      expect(towardsClaude.messages[1]?.content).toEqual([{ type: 'text', text: expect.stringContaining(IDENTITY) }])
    }

    const awayFromClaude = await prepare(createAgent('claude-sonnet', 'deepseek-chat'))
    expect(awayFromClaude).toMatchObject({ kind: 'enter', messages: [{ source: { kind: 'user' } }] })
  })

  it('leaves nonmatching models, rejected steps, and aborted requests untouched', async () => {
    const nonmatching = await prepare(createAgent('deepseek-v4-flash'))
    expect(nonmatching).toMatchObject({ kind: 'enter', messages: [{ source: { kind: 'user' } }] })

    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    const fiber = await ctx.plugin(plugin)
    const agent = createAgent('claude-sonnet')
    const rejected = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [], turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'reject' as const }),
    )
    expect(rejected).toEqual({ kind: 'reject' })
    const controller = new AbortController()
    controller.abort()
    const original = createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } })
    const aborted = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [original], turn: 1, step: 1, signal: controller.signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [original] }),
    )
    expect(aborted).toEqual({ kind: 'enter', messages: [original] })
    await fiber.dispose()
  })

  it('defaults to mainland signals, simulated IPs, Simplified Chinese and Shanghai time', async () => {
    const decision = await prepare(createAgent('claude-sonnet'))
    if (decision.kind !== 'enter') throw new Error('expected enter')
    const block = decision.messages[1]!.content[0]!
    if (block.type !== 'text') throw new Error('expected text')
    for (const value of ['简体中文', 'Asia/Shanghai', '+86', '微信', '支付宝', '高考', '春节', '36.112.0.1', '240e:390:0:1::8', 'CN', '中国电信']) {
      expect(block.text).toContain(value)
    }
    expect(block.text).not.toMatch(/出生|居住|人民币|CNY/)
    expect(decision.messages[1]!.source).toMatchObject({ sections: [{ text: block.text }] })
  })

  it('replaces default signals and accepts a partial network configuration', async () => {
    const config = parseConfig({
      delivery: 'message',
      identity: '自定义身份', language: '', timezone: '',
      signals: { 区号: '+86', 忽略: ' ' },
      network: { ipv4: '1.2.3.4', ipv6: '' },
      extraSignals: [' 使用银联 ', ''],
    })
    const decision = await prepare(createAgent('claude-sonnet'), undefined, config)
    if (decision.kind !== 'enter') throw new Error('expected enter')
    expect(decision.messages[1]!.content).toEqual([{ type: 'text', text:
      '自定义身份\n区号: +86\n用户网络信息：\nIPv4: 1.2.3.4\nIP 国家代码: CN\n网络运营商: 中国电信 / China Telecom\n使用银联',
    }])
  })

  it('converts user text without changing message identity, attachments or plugin text', async () => {
    const input = createUserMessage({ source: { kind: 'user' }, content: [
      { type: 'text', text: '请解释 "例子" 和 \'test\'，保留 `"code"`。' },
      { type: 'image', attachment: {
        attachmentId: 'fixture-image' as ImageBlock['attachment']['attachmentId'],
        mediaType: 'image/png', bytes: 10, width: 1, height: 1,
      } },
    ] })
    const context = createUserMessage({ source: { kind: 'plugin', plugin: 'other' }, content: [{ type: 'text', text: '"context"' }] })
    const decision = await prepare(createAgent('claude-sonnet'), undefined, {}, [input, context])
    if (decision.kind !== 'enter') throw new Error('expected enter')
    expect(decision.messages[0]!.id).toBe(input.id)
    expect(decision.messages[0]!.content).toEqual([
      { type: 'text', text: '请解释 “例子” 和 ‘test’，保留 `"code"`。' }, input.content[1],
    ])
    expect(input.content[0]).toEqual({ type: 'text', text: '请解释 "例子" 和 \'test\'，保留 `"code"`。' })
    expect(Object.isFrozen(decision.messages[0])).toBe(true)
    expect(decision.messages[1]).toBe(context)
  })

  it('supports quote-only mode, a disabled converter, an empty profile and a disabled plugin', async () => {
    const empty = { identity: '', language: '', timezone: '', signals: {}, network: false as const, extraSignals: [] }
    const input = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '"例子"' }] })
    const quotes = await prepare(createAgent('claude'), undefined, empty, [input])
    expect(quotes).toMatchObject({ messages: [{ content: [{ type: 'text', text: '“例子”' }] }] })
    for (const config of [{ ...empty, convertQuotes: false }, { enabled: false }]) {
      const decision = await prepare(createAgent('claude'), undefined, config, [input])
      if (decision.kind !== 'enter') throw new Error('expected enter')
      expect(decision.messages).toEqual([input])
    }
    const nonmatching = await prepare(createAgent('deepseek'), undefined, {}, [input])
    expect(nonmatching).toMatchObject({ messages: [input] })
  })

  it('rejects invalid IP syntax and config types before loading', () => {
    for (const network of [{ ipv4: '999.1.2.3' }, { ipv4: '::1' }, { ipv6: '1.2.3.4' }, { ipv6: 'not-an-ip' }]) {
      expect(() => parseConfig({ network })).toThrow()
    }
    expect(() => parseConfig({ convertQuotes: 'yes' })).toThrow()
    expect(() => parseConfig({ signals: { phone: 86 } })).toThrow()
    expect(() => parseConfig({ delivery: 'hidden' })).toThrow()
    expect(() => parseConfig({ promptOrder: Infinity })).toThrow()
  })

  it('defaults to system delivery, follows the model, and disposes the prompt registration', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    const fiber = await ctx.plugin(plugin)
    const agent = createAgent('Claude-Sonnet')
    const assembly = await ctx.systemPrompt.assemble(assembleContextFor(agent))
    expect(renderPrompt(assembly)).toContain(IDENTITY)
    expect(assembly.contexts.some(context => context.name === plugin.name)).toBe(false)
    const decision = await agentEvents(ctx, agent).waterfall('agent/pre-step',
      { messages: [], turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
    )
    expect(decision).toEqual({ kind: 'enter', messages: [] })
    for (const subject of [createAgent('deepseek'), createAgent('claude', 'deepseek')]) {
      expect(renderPrompt(await ctx.systemPrompt.assemble(assembleContextFor(subject)))).not.toContain(IDENTITY)
    }
    expect(renderPrompt(await ctx.systemPrompt.assemble(assembleContextFor(createAgent('deepseek', 'claude'))))).toContain(IDENTITY)
    const controller = new AbortController()
    controller.abort()
    expect(renderPrompt(await ctx.systemPrompt.assemble(assembleContextFor(agent, controller.signal)))).not.toContain(IDENTITY)
    await fiber.dispose()
    expect(renderPrompt(await ctx.systemPrompt.assemble(assembleContextFor(agent)))).not.toContain(IDENTITY)
  })
})
