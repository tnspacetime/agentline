import {
  SYSTEM_COMMANDS,
  type AgentLanguageAction,
  type AgentLanguageParseError,
  type AgentLanguageParseErrorCode,
  type AgentLanguageParseResult,
  type AgentReference,
  type ParseAgentLanguageOptions,
  type SourceSpan,
  type SystemCommand,
} from "./types.ts"

const AGENT_NAME_PATTERN =
  /^[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?$/
const SYSTEM_COMMAND_SET = new Set<string>(SYSTEM_COMMANDS)

type SourceSlice = {
  text: string
  offset: number
}

type Token = {
  value: string
  start: number
  end: number
}

type ErrorLocation = {
  token?: string
  span?: SourceSpan
}

type TargetPrefixResult =
  | {
      ok: true
      targets: AgentReference[]
      targetTokens: Token[]
      remainder: SourceSlice
    }
  | {
      ok: false
      error: AgentLanguageParseError
    }

export function isAgentName(value: string): boolean {
  return AGENT_NAME_PATTERN.test(value)
}

export function isAgentReference(value: string): value is AgentReference {
  return value.startsWith("@") && isAgentName(value.slice(1))
}

export function parseAgentLanguage(
  rawInput: string,
  options: ParseAgentLanguageOptions = {},
): AgentLanguageParseResult {
  const source = trimSource({ text: rawInput, offset: 0 })

  if (source.text.length === 0) {
    return fail(
      "empty_input",
      "Enter a command or instruction.",
      insertionLocation(source),
    )
  }

  switch (source.text[0]) {
    case "/":
      return parseSystemCommand(source)
    case ".":
      return parseExplicitAction(source)
    case "?":
      return parseExplain(trimStartSource(sliceSource(source, 1)))
    case "!":
      return parseReview(trimStartSource(sliceSource(source, 1)), "fast")
    case ":":
      return parseDescribeShortcut(trimStartSource(sliceSource(source, 1)))
    case "@":
      return parseTargetedFastForm(source)
    default:
      return parseImplicitTell(source, options)
  }
}

function parseSystemCommand(source: SourceSlice): AgentLanguageParseResult {
  const tokens = tokenize(source)
  const commandToken = tokens[0]

  if (commandToken === undefined) {
    return fail(
      "empty_input",
      "Enter a command or instruction.",
      insertionLocation(source),
    )
  }

  const commandName = commandToken.value.slice(1)

  if (!SYSTEM_COMMAND_SET.has(commandName)) {
    return fail(
      "unknown_command",
      `Unknown system command: ${commandToken.value}`,
      tokenLocation(commandToken),
    )
  }

  const argumentsSource = remainderFrom(source, tokens, 1)
  const command = commandName as SystemCommand

  if (command === "create") {
    return parseCreateCommand(source, tokens)
  }

  if (command === "attach") {
    return parseAttachCommand(source, tokens)
  }

  if (command === "detach") {
    return parseDetachCommand(source, tokens)
  }

  if (command === "describe") {
    return parseDescribeCommand(source, tokens)
  }

  if (command === "search" && argumentsSource.text.length === 0) {
    return fail(
      "missing_search_query",
      "/search requires a query.",
      insertionLocation(argumentsSource),
    )
  }

  return succeed({
    type: "system",
    command,
    arguments: argumentsSource.text,
  })
}

function parseDescribeCommand(
  source: SourceSlice,
  tokens: Token[],
): AgentLanguageParseResult {
  return parseDescribe(source, tokens, 1, "/describe")
}

function parseDescribeShortcut(
  source: SourceSlice,
): AgentLanguageParseResult {
  return parseDescribe(source, tokenize(source), 0, ":")
}

function parseDescribe(
  source: SourceSlice,
  tokens: Token[],
  aliasIndex: number,
  command: "/describe" | ":",
): AgentLanguageParseResult {
  const aliasToken = tokens[aliasIndex]
  if (aliasToken === undefined) {
    return fail(
      "missing_agent_alias",
      `${command} requires an explicit @agent alias.`,
      insertionLocation(remainderFrom(source, tokens, aliasIndex)),
    )
  }

  const aliasError = validateDeclaredAlias(aliasToken, command)
  if (aliasError !== undefined) return { ok: false, error: aliasError }

  const description = remainderFrom(source, tokens, aliasIndex + 1)
  return succeed({
    type: "system",
    command: "describe",
    alias: aliasToken.value as AgentReference,
    ...(description.text ? { description: description.text } : {}),
  })
}

function parseCreateCommand(
  source: SourceSlice,
  tokens: Token[],
): AgentLanguageParseResult {
  const aliasToken = tokens[1]

  if (aliasToken === undefined) {
    return fail(
      "missing_agent_alias",
      "/create requires an explicit @agent alias.",
      insertionLocation(remainderFrom(source, tokens, 1)),
    )
  }

  const aliasError = validateDeclaredAlias(aliasToken, "/create")

  if (aliasError !== undefined) {
    return { ok: false, error: aliasError }
  }

  const directory = remainderFrom(source, tokens, 2)

  return succeed({
    type: "system",
    command: "create",
    alias: aliasToken.value as AgentReference,
    ...(directory.text ? { directory: directory.text } : {}),
  })
}

function parseAttachCommand(
  source: SourceSlice,
  tokens: Token[],
): AgentLanguageParseResult {
  const aliasToken = tokens[1]

  if (aliasToken === undefined) {
    return fail(
      "missing_agent_alias",
      "/attach requires an explicit @agent alias.",
      insertionLocation(remainderFrom(source, tokens, 1)),
    )
  }

  const aliasError = validateDeclaredAlias(aliasToken, "/attach")

  if (aliasError !== undefined) {
    return { ok: false, error: aliasError }
  }

  const sessionToken = tokens[2]

  if (sessionToken === undefined) {
    return fail(
      "missing_session_id",
      "/attach requires an explicit native session ID.",
      insertionLocation(remainderFrom(source, tokens, 2)),
    )
  }

  const unexpected = tokens[3]

  if (unexpected !== undefined) {
    return fail(
      "unexpected_argument",
      "/attach accepts exactly one native session ID.",
      tokenLocation(unexpected),
    )
  }

  return succeed({
    type: "system",
    command: "attach",
    alias: aliasToken.value as AgentReference,
    sessionId: sessionToken.value,
  })
}

function parseDetachCommand(
  source: SourceSlice,
  tokens: Token[],
): AgentLanguageParseResult {
  const aliasToken = tokens[1]
  if (aliasToken === undefined) {
    return fail(
      "missing_agent_alias",
      "/detach requires an explicit @agent alias.",
      insertionLocation(remainderFrom(source, tokens, 1)),
    )
  }

  const aliasError = validateDeclaredAlias(aliasToken, "/detach")
  if (aliasError !== undefined) return { ok: false, error: aliasError }

  const extra = tokens[2]
  if (extra !== undefined) {
    return fail(
      "unexpected_argument",
      "/detach accepts exactly one @agent alias.",
      tokenLocation(extra),
    )
  }

  return succeed({
    type: "system",
    command: "detach",
    alias: aliasToken.value as AgentReference,
  })
}

function validateDeclaredAlias(
  token: Token,
  command: "/create" | "/attach" | "/detach" | "/describe" | ":",
): AgentLanguageParseError | undefined {
  if (!token.value.startsWith("@")) {
    return makeError(
      "missing_agent_alias",
      `${command} requires an @agent alias as its first argument.`,
      tokenLocation(token),
    )
  }

  if (!isAgentReference(token.value)) {
    return makeError(
      "invalid_agent_reference",
      `Invalid agent reference: ${token.value}`,
      tokenLocation(token),
    )
  }

  return undefined
}

function parseExplicitAction(source: SourceSlice): AgentLanguageParseResult {
  const tokens = tokenize(source)
  const actionToken = tokens[0]

  if (actionToken === undefined) {
    return fail(
      "empty_input",
      "Enter a command or instruction.",
      insertionLocation(source),
    )
  }

  const remainder = remainderFrom(source, tokens, 1)

  switch (actionToken.value) {
    case ".focus":
      return parseFocus(remainder)
    case ".tell":
      return parseExplicitTell(remainder)
    case ".explain":
      return parseExplain(remainder)
    case ".review":
      return parseReview(remainder, "explicit")
    default:
      return fail(
        "unknown_action",
        `Unknown agent action: ${actionToken.value}`,
        tokenLocation(actionToken),
      )
  }
}

function parseFocus(source: SourceSlice): AgentLanguageParseResult {
  const prefix = parseTargetPrefix(source)

  if (!prefix.ok) {
    return { ok: false, error: prefix.error }
  }

  if (prefix.targets.length === 0) {
    return failAtNextTokenOrInsertion(
      "missing_target",
      ".focus requires one agent target.",
      source,
    )
  }

  const secondTarget = prefix.targetTokens[1]

  if (secondTarget !== undefined) {
    return fail(
      "multiple_focus_targets",
      "Only one agent board may be focused at a time.",
      tokenLocation(secondTarget),
    )
  }

  if (prefix.remainder.text.length > 0) {
    return failAtNextTokenOrInsertion(
      "unexpected_argument",
      ".focus accepts only one agent target.",
      prefix.remainder,
    )
  }

  const target = prefix.targets[0]

  if (target === undefined) {
    return fail(
      "missing_target",
      ".focus requires one agent target.",
      insertionLocation(source),
    )
  }

  return succeed({ type: "focus", target })
}

function parseExplicitTell(source: SourceSlice): AgentLanguageParseResult {
  const prefix = parseTargetPrefix(source)

  if (!prefix.ok) {
    return { ok: false, error: prefix.error }
  }

  if (prefix.targets.length === 0) {
    return failAtNextTokenOrInsertion(
      "missing_target",
      ".tell requires at least one agent target.",
      source,
    )
  }

  if (prefix.remainder.text.length === 0) {
    return fail(
      "missing_instruction",
      ".tell requires an instruction.",
      insertionLocation(prefix.remainder),
    )
  }

  return succeed({
    type: "tell",
    targets: prefix.targets,
    instruction: prefix.remainder.text,
    implicitTarget: false,
  })
}

function parseTargetedFastForm(
  source: SourceSlice,
): AgentLanguageParseResult {
  const prefix = parseTargetPrefix(source)

  if (!prefix.ok) {
    return { ok: false, error: prefix.error }
  }

  if (prefix.targets.length === 0) {
    return failAtNextTokenOrInsertion(
      "missing_target",
      "Expected an agent reference.",
      source,
    )
  }

  if (prefix.remainder.text.length === 0) {
    const secondTarget = prefix.targetTokens[1]

    if (secondTarget !== undefined) {
      return fail(
        "multiple_focus_targets",
        "Bare multiple agent references cannot be focused together.",
        tokenLocation(secondTarget),
      )
    }

    const target = prefix.targets[0]

    if (target === undefined) {
      return fail(
        "missing_target",
        "Expected an agent reference.",
        insertionLocation(source),
      )
    }

    return succeed({ type: "focus", target })
  }

  return succeed({
    type: "tell",
    targets: prefix.targets,
    instruction: prefix.remainder.text,
    implicitTarget: false,
  })
}

function parseImplicitTell(
  source: SourceSlice,
  options: ParseAgentLanguageOptions,
): AgentLanguageParseResult {
  const focusedAgent = options.focusedAgent

  if (focusedAgent === undefined) {
    return fail(
      "no_focused_agent",
      "Focus an agent before sending an untargeted instruction.",
      sourceLocation(source),
    )
  }

  if (!isAgentReference(focusedAgent)) {
    return fail(
      "invalid_agent_reference",
      `Invalid focused agent reference: ${focusedAgent}`,
      { token: focusedAgent },
    )
  }

  return succeed({
    type: "tell",
    targets: [focusedAgent],
    instruction: source.text,
    implicitTarget: true,
  })
}

function parseExplain(source: SourceSlice): AgentLanguageParseResult {
  const prefix = parseTargetPrefix(source)

  if (!prefix.ok) {
    return { ok: false, error: prefix.error }
  }

  if (prefix.targets.length === 0) {
    return failAtNextTokenOrInsertion(
      "missing_target",
      "Explain requires at least one agent target.",
      source,
    )
  }

  const action: AgentLanguageAction =
    prefix.remainder.text.length === 0
      ? {
          type: "explain",
          targets: prefix.targets,
        }
      : {
          type: "explain",
          targets: prefix.targets,
          question: prefix.remainder.text,
        }

  return succeed(action)
}

function parseReview(
  source: SourceSlice,
  form: "explicit" | "fast",
): AgentLanguageParseResult {
  const prefix = parseTargetPrefix(source)

  if (!prefix.ok) {
    return { ok: false, error: prefix.error }
  }

  if (prefix.targets.length === 0) {
    return failAtNextTokenOrInsertion(
      "missing_target",
      "Review requires at least one work target.",
      source,
    )
  }

  if (prefix.remainder.text.length === 0) {
    return succeed({ type: "review", targets: prefix.targets })
  }

  const modifierTokens = tokenize(prefix.remainder)
  const modifier = modifierTokens[0]

  if (modifier === undefined) {
    return succeed({ type: "review", targets: prefix.targets })
  }

  const isReviewerModifier =
    modifier.value === ".by" || (form === "fast" && modifier.value === "by")

  if (!isReviewerModifier) {
    if (modifier.value.startsWith(".")) {
      return fail(
        "unknown_modifier",
        `Unknown review modifier: ${modifier.value}`,
        tokenLocation(modifier),
      )
    }

    return fail(
      "unexpected_argument",
      "Review accepts only an optional reviewer modifier.",
      tokenLocation(modifier),
    )
  }

  const reviewerToken = modifierTokens[1]

  if (reviewerToken === undefined) {
    const reviewerSource = remainderFrom(prefix.remainder, modifierTokens, 1)
    return fail(
      "missing_target",
      `${modifier.value} requires one reviewer target.`,
      insertionLocation(reviewerSource),
    )
  }

  if (!reviewerToken.value.startsWith("@")) {
    return fail(
      "missing_target",
      `${modifier.value} requires an agent reference.`,
      tokenLocation(reviewerToken),
    )
  }

  if (!isAgentReference(reviewerToken.value)) {
    return fail(
      "invalid_agent_reference",
      `Invalid reviewer reference: ${reviewerToken.value}`,
      tokenLocation(reviewerToken),
    )
  }

  const unexpected = modifierTokens[2]

  if (unexpected !== undefined) {
    return fail(
      "unexpected_argument",
      "A review accepts exactly one assigned reviewer.",
      tokenLocation(unexpected),
    )
  }

  return succeed({
    type: "review",
    targets: prefix.targets,
    reviewer: reviewerToken.value,
  })
}

function parseTargetPrefix(source: SourceSlice): TargetPrefixResult {
  const tokens = tokenize(source)
  const targets: AgentReference[] = []
  const targetTokens: Token[] = []
  const seen = new Set<AgentReference>()
  let nextTokenIndex = 0

  for (const token of tokens) {
    if (!token.value.startsWith("@")) {
      break
    }

    if (!isAgentReference(token.value)) {
      return {
        ok: false,
        error: makeError(
          "invalid_agent_reference",
          `Invalid agent reference: ${token.value}`,
          tokenLocation(token),
        ),
      }
    }

    targetTokens.push(token)

    if (!seen.has(token.value)) {
      targets.push(token.value)
      seen.add(token.value)
    }

    nextTokenIndex += 1
  }

  return {
    ok: true,
    targets,
    targetTokens,
    remainder: remainderFrom(source, tokens, nextTokenIndex),
  }
}

function tokenize(source: SourceSlice): Token[] {
  const tokens: Token[] = []

  for (const match of source.text.matchAll(/\S+/g)) {
    const value = match[0]
    const localStart = match.index ?? 0
    const start = source.offset + localStart
    tokens.push({ value, start, end: start + value.length })
  }

  return tokens
}

function remainderFrom(
  source: SourceSlice,
  tokens: Token[],
  tokenIndex: number,
): SourceSlice {
  const token = tokens[tokenIndex]

  if (token === undefined) {
    return { text: "", offset: source.offset + source.text.length }
  }

  const localStart = token.start - source.offset
  return trimSource({
    text: source.text.slice(localStart),
    offset: token.start,
  })
}

function sliceSource(source: SourceSlice, start: number): SourceSlice {
  return {
    text: source.text.slice(start),
    offset: source.offset + start,
  }
}

function trimSource(source: SourceSlice): SourceSlice {
  const firstContentIndex = source.text.search(/\S/)

  if (firstContentIndex === -1) {
    return { text: "", offset: source.offset + source.text.length }
  }

  let end = source.text.length

  while (end > firstContentIndex && /\s/.test(source.text[end - 1] ?? "")) {
    end -= 1
  }

  return {
    text: source.text.slice(firstContentIndex, end),
    offset: source.offset + firstContentIndex,
  }
}

function trimStartSource(source: SourceSlice): SourceSlice {
  const firstContentIndex = source.text.search(/\S/)

  if (firstContentIndex === -1) {
    return { text: "", offset: source.offset + source.text.length }
  }

  return {
    text: source.text.slice(firstContentIndex),
    offset: source.offset + firstContentIndex,
  }
}

function failAtNextTokenOrInsertion(
  code: AgentLanguageParseErrorCode,
  message: string,
  source: SourceSlice,
): AgentLanguageParseResult {
  const token = tokenize(source)[0]
  return fail(
    code,
    message,
    token === undefined ? insertionLocation(source) : tokenLocation(token),
  )
}

function tokenLocation(token: Token): ErrorLocation {
  return {
    token: token.value,
    span: { start: token.start, end: token.end },
  }
}

function insertionLocation(source: SourceSlice): ErrorLocation {
  const index = source.offset + source.text.length
  return { span: { start: index, end: index } }
}

function sourceLocation(source: SourceSlice): ErrorLocation {
  return {
    span: {
      start: source.offset,
      end: source.offset + source.text.length,
    },
  }
}

function succeed(action: AgentLanguageAction): AgentLanguageParseResult {
  return { ok: true, action }
}

function fail(
  code: AgentLanguageParseErrorCode,
  message: string,
  location: ErrorLocation = {},
): AgentLanguageParseResult {
  return { ok: false, error: makeError(code, message, location) }
}

function makeError(
  code: AgentLanguageParseErrorCode,
  message: string,
  location: ErrorLocation = {},
): AgentLanguageParseError {
  return { code, message, ...location }
}
