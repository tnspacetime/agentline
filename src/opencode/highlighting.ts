import { isAgentReference } from "../language/index.ts"

export type AgentlineHighlightKind = "system" | "action" | "agent"

export type AgentlineHighlightRange = {
  kind: AgentlineHighlightKind
  start: number
  end: number
}

const graphemes = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
})

export function agentlineHighlightRanges(
  input: string,
): AgentlineHighlightRange[] {
  const ranges: AgentlineHighlightRange[] = []
  const tokens = input.matchAll(/\S+/gu)
  let tokenIndex = 0

  for (const match of tokens) {
    const token = match[0]
    const index = match.index
    let kind: AgentlineHighlightKind | undefined

    if (
      tokenIndex === 0 &&
      (token.startsWith("/") || token === ":")
    ) {
      kind = "system"
    } else if (
      tokenIndex === 0 &&
      (token.startsWith(".") || token.startsWith("?") || token.startsWith("!"))
    ) {
      kind = "action"
    } else if (isAgentReference(token)) {
      kind = "agent"
    }

    if (kind) {
      const start = inputOffsetWidth(input.slice(0, index))
      ranges.push({
        kind,
        start,
        end: start + inputOffsetWidth(token),
      })
    }

    tokenIndex += 1
  }

  return ranges
}

export function inputOffsetWidth(value: string) {
  let width = 0
  for (const part of graphemes.segment(value)) {
    width += part.segment === "\n" ? 1 : Bun.stringWidth(part.segment)
  }
  return width
}
