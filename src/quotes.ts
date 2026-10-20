/** Convert paired prose quotes while preserving Markdown code and JSON objects/arrays. */

const WORD = /[\p{Script=Latin}\p{N}_]/u

function proseQuotes(text: string, protectedRanges: Array<[number, number]> = []): string {
  const chars = text.split('')
  const openings = new Map<string, number>()
  let rangeIndex = 0
  for (let index = 0; index < chars.length; index++) {
    const range = protectedRanges[rangeIndex]
    if (range && index === range[0]) {
      index = range[1] - 1
      rangeIndex++
      continue
    }
    const char = chars[index]!
    if (char === '\\') { index++; continue }
    if (char !== '"' && char !== "'") continue
    const before = chars[index - 1] ?? ''
    const after = chars[index + 1] ?? ''
    if (char === "'" && WORD.test(before)) {
      // Contractions, possessives, and trailing apostrophes are not opening quotes.
      if (WORD.test(after) || !openings.has(char)) continue
    }
    const opening = openings.get(char)
    if (opening !== undefined) {
      chars[opening] = char === '"' ? '“' : '‘'
      chars[index] = char === '"' ? '”' : '’'
      openings.delete(char)
    } else if (after && !/\s/.test(after)) {
      openings.set(char, index)
    }
  }
  return chars.join('')
}

function jsonEnd(text: string, start: number): number | undefined {
  const stack: string[] = []
  let inString = false
  for (let index = start; index < text.length; index++) {
    const char = text[index]!
    if (inString) {
      if (char === '\\') index++
      else if (char === '"') inString = false
    } else if (char === '"') inString = true
    else if (char === '{' || char === '[') stack.push(char)
    else if (char === '}' || char === ']') {
      if (stack.pop() !== (char === '}' ? '{' : '[')) return
      if (!stack.length) {
        try { JSON.parse(text.slice(start, index + 1)) } catch { return }
        return index + 1
      }
    }
  }
}

function inlineQuotes(text: string): string {
  const ranges: Array<[number, number]> = []
  for (let index = 0; index < text.length; index++) {
    let end: number | undefined
    if (text[index] === '`') {
      const run = /^`+/.exec(text.slice(index))![0]
      let closing = text.indexOf(run, index + run.length)
      while (closing !== -1 && (text[closing - 1] === '`' || text[closing + run.length] === '`')) {
        closing = text.indexOf(run, closing + run.length)
      }
      // Preserve an unfinished inline code span while the user is still typing.
      end = closing === -1 ? text.length : closing + run.length
    } else if (text[index] === '{' || text[index] === '[') {
      end = jsonEnd(text, index)
    }
    if (end !== undefined) {
      ranges.push([index, end])
      index = end - 1
    }
  }
  return proseQuotes(text, ranges)
}

/**
 * Convert paired ASCII double/single quotes in user prose to Chinese quotes.
 * Fenced/inline code, valid JSON objects/arrays, escaped quotes, apostrophes,
 * and unmatched quotes retain their original text.
 * @param text - user text before it is recorded and sent to Claude
 * @returns converted text with protected spans unchanged
 */
export function convertEnglishQuotes(text: string): string {
  const fences = /^ {0,3}(`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)/gm
  let output = ''
  let start = 0
  let match: RegExpExecArray | null
  while ((match = fences.exec(text))) {
    const run = match[1]!
    const closing = new RegExp(`^ {0,3}${run[0]}{${run.length},}[ \\t]*(?:\\r?\\n|$)`, 'gm')
    closing.lastIndex = fences.lastIndex
    const close = closing.exec(text)
    const end = close ? closing.lastIndex : text.length
    output += inlineQuotes(text.slice(start, match.index)) + text.slice(match.index, end)
    start = end
    fences.lastIndex = end
  }
  return output + inlineQuotes(text.slice(start))
}
