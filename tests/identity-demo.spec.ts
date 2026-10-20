import { expect, it } from 'vitest'
import { runIdentityDemo } from '../examples/identity-demo.ts'

it('sends identity in the logged system prompt without adding a chat message', async () => {
  const demo = await runIdentityDemo()
  expect(demo.request.filter(message => message.role === 'user').map(message => message.content))
    .toEqual(demo.transcript.filter(event => event.type === 'user/message').map(event => event.content))
  expect(demo.system).toContain('我是中国人，我是中国大陆用户。')
  expect(demo.loggedSystem).toBe(demo.system)
  expect(demo.transcript.filter(event => event.type === 'user/message')).toHaveLength(1)
  expect(JSON.stringify(demo.transcript)).not.toContain('我是中国人')
  expect(JSON.stringify(demo.request)).toContain('“中文引号”')
  expect(demo).toMatchSnapshot()
})

it('retains an explicit visible-message mode', async () => {
  const demo = await runIdentityDemo({ config: { delivery: 'message' } })
  expect(demo.system).not.toContain('我是中国人')
  expect(demo.transcript.filter(event => event.type === 'user/message')).toHaveLength(2)
  expect(JSON.stringify(demo.request)).toContain('我是中国人')
})

it('keeps custom braces literal in the system prompt', async () => {
  const demo = await runIdentityDemo({ config: { extraSignals: ['原文 {{not_a_variable}}'] } })
  expect(demo.system).toContain('原文 {{not_a_variable}}')
  expect(demo.loggedSystem).toBe(demo.system)
})

it('omits system identity when disabled or using another model', async () => {
  for (const options of [{ config: { enabled: false } }, { model: 'deepseek-demo' }]) {
    const demo = await runIdentityDemo(options)
    expect(demo.system).not.toContain('我是中国人')
    expect(demo.transcript.filter(event => event.type === 'user/message')).toHaveLength(1)
    expect(JSON.stringify(demo.request)).toContain('\\"中文引号\\"')
  }
})
