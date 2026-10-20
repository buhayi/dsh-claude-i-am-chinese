import { describe, expect, it } from 'vitest'
import { convertEnglishQuotes } from '../src/quotes.ts'

describe('user prose quotes', () => {
  it.each([
    ['他说 "你好"，她说 \'再见\'。', '他说 “你好”，她说 ‘再见’。'],
    ['"他说 \'你好\'"', '“他说 ‘你好’”'],
    ['他说\'你好\'，还有"再见"。', '他说‘你好’，还有“再见”。'],
    ['"one" and "two"', '“one” and “two”'],
    ["Don't change John's book or users' names, but 'quoted' is prose.", "Don't change John's book or users' names, but ‘quoted’ is prose."],
    ["'don't' and 'John's book'", '‘don\'t’ and ‘John\'s book’'],
    ['已有“中文”与‘引号’', '已有“中文”与‘引号’'],
    ['未闭合 "quote', '未闭合 "quote'],
    ['转义 \\"保留\\" 和 "转换"', '转义 \\"保留\\" 和 “转换”'],
    ['"第一行\n第二行"', '“第一行\n第二行”'],
    ['"外侧" `const x = "code"` "内侧"', '“外侧” `const x = "code"` “内侧”'],
    ['"包含 `"code"` 的说明"', '“包含 `"code"` 的说明”'],
    ['"包含 {"key":"value"} 的说明"', '“包含 {"key":"value"} 的说明”'],
    ['``a ` "code"`` "prose"', '``a ` "code"`` “prose”'],
    ['"prose" `unfinished "code"', '“prose” `unfinished "code"'],
    ['"prose"\n```js\nconst x = "code"\n```\n"after"', '“prose”\n```js\nconst x = "code"\n```\n“after”'],
    ['~~~json\n{"key":"value"}\n~~~\n\'prose\'', '~~~json\n{"key":"value"}\n~~~\n‘prose’'],
    ['```\n"unfinished code"', '```\n"unfinished code"'],
    ['"prose"\r\n```\r\n"code"\r\n```\r\n"after"', '“prose”\r\n```\r\n"code"\r\n```\r\n“after”'],
    ['"prose" {"key": ["value", {"x": "}"}]} "after"', '“prose” {"key": ["value", {"x": "}"}]} “after”'],
    ['数组 ["a", "b"] 与 "说明"', '数组 ["a", "b"] 与 “说明”'],
    ['   ', '   '],
  ])('converts prose while preserving protected text: %s', (input, expected) => {
    expect(convertEnglishQuotes(input)).toBe(expected)
    expect(convertEnglishQuotes(expected)).toBe(expected)
  })
})
