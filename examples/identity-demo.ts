/** Keyless example: a real agent turn with a deterministic local model adapter. */
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, LlmAdapter, type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as plugin from '../src/index.ts'

class LocalAdapter extends LlmAdapter {
  requests: GenerateOptions[] = []
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model }
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const text = 'DEMO_OK "reply stays unchanged"'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 10 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/**
 * Run a real agent loop locally and collect the model request and durable transcript.
 * @param options - optional delivery configuration and selected model
 * @returns stable content suitable for snapshot review; no real API is called
 */
export async function runIdentityDemo(options: { config?: Partial<plugin.Config>; model?: string } = {}) {
  const ctx = new Context()
  try {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(plugin, plugin.Config({ ...plugin.Config(), ...options.config }))
    const adapter = new LocalAdapter()
    ctx.llm.registerAdapter(['identity-demo'], adapter)
    const agent = ctx.agentLoop.create(SessionId('identity-demo'), { provider: 'identity-demo', model: options.model ?? 'claude-demo' })
    const idle = new Promise<void>(resolve => {
      const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
        if (subject === agent && status === 'idle') { dispose(); resolve() }
      })
    })
    agent.followup(createUserMessage({
      source: { kind: 'user' },
      content: [{ type: 'text', text: '请解释 "中文引号" 和 \'单引号\'，保留 `"code"` 与 {"key":"value"}。' }],
    }))
    await idle
    if (adapter.requests.length !== 1) throw new Error('demo expected exactly one model request')
    return {
      system: adapter.requests[0]!.system,
      loggedSystem: agent.session.requestHeader()?.system,
      request: adapter.requests[0]!.messages.map(({ role, content }) => ({ role, content })),
      transcript: [...agent.session.events].filter(event => event.type === 'user/message' || event.type === 'assistant/message')
        .map(event => {
          const message = event.type === 'user/message' ? event.data : event.data.message
          return { type: event.type, content: message.content, source: message.source }
        }),
    }
  } finally {
    await ctx.fiber.dispose()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runIdentityDemo(), null, 2)}\n`)
}
