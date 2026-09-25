import {
  EXPLICIT_ACTIONS,
  SYSTEM_COMMANDS,
  type ExplicitAction,
  type SystemCommand,
} from "../language/index.ts"
import type { AgentlineAgentStatus } from "../core/types"

export type SuggestionMode = "/" | "." | "@"

export type SuggestionContext = {
  mode: SuggestionMode
  query: string
  start: number
  end: number
}

export type SuggestionAgent = {
  name: string
  status: AgentlineAgentStatus
}

export type AgentlineSuggestion = {
  id: string
  label: string
  description: string
  insertion: string
  disabled: boolean
}

const COMMAND_DESCRIPTIONS: Record<SystemCommand, string> = {
  list: "List registered agents",
  active: "Show active agents",
  waiting: "Show agents needing attention",
  changed: "Show agents with changed files",
  errors: "Show agent errors",
  search: "Search across agents",
  create: "Create an agent, optionally with a workspace",
  attach: "Attach an existing session",
  detach: "Detach an agent without deleting its session",
  describe: "Set or edit an agent description",
}

const IMPLEMENTED_COMMANDS = new Set<SystemCommand>([
  "create",
  "attach",
  "detach",
  "describe",
])
const IMPLEMENTED_ACTIONS = new Set<ExplicitAction>(["focus", "tell"])

const ACTION_DESCRIPTIONS: Record<ExplicitAction, string> = {
  focus: "Open and remember one agent",
  tell: "Send an instruction to agents",
  explain: "Ask agents to explain their work",
  review: "Review work from agents",
}

const COMMAND_SUGGESTIONS = SYSTEM_COMMANDS.map(
  (command): AgentlineSuggestion => ({
    id: `command:${command}`,
    label: `/${command}`,
    description: COMMAND_DESCRIPTIONS[command],
    insertion: `/${command} `,
    disabled: !IMPLEMENTED_COMMANDS.has(command),
  }),
)

const ACTION_SUGGESTIONS = EXPLICIT_ACTIONS.map(
  (action): AgentlineSuggestion => ({
    id: `action:${action}`,
    label: `.${action}`,
    description: ACTION_DESCRIPTIONS[action],
    insertion: `.${action} `,
    disabled: !IMPLEMENTED_ACTIONS.has(action),
  }),
)

export function suggestionContext(
  input: string,
  cursorOffset = input.length,
): SuggestionContext | undefined {
  const offset = Math.max(0, Math.min(cursorOffset, input.length))
  const beforeCursor = input.slice(0, offset)

  if (beforeCursor.startsWith("/") && !/\s/.test(beforeCursor)) {
    return {
      mode: "/",
      query: beforeCursor.slice(1),
      start: 0,
      end: offset,
    }
  }

  if (beforeCursor.startsWith(".") && !/\s/.test(beforeCursor)) {
    return {
      mode: ".",
      query: beforeCursor.slice(1),
      start: 0,
      end: offset,
    }
  }

  const agentToken = /(?:^|\s)(@[^\s@]*)$/.exec(beforeCursor)
  if (!agentToken) return

  const token = agentToken[1]
  const start = beforeCursor.length - token.length
  return {
    mode: "@",
    query: token.slice(1),
    start,
    end: offset,
  }
}

export function suggestionsFor(
  context: SuggestionContext | undefined,
  agents: readonly SuggestionAgent[],
): AgentlineSuggestion[] {
  if (!context) return []

  const suggestions =
    context.mode === "/"
      ? COMMAND_SUGGESTIONS
      : context.mode === "."
        ? ACTION_SUGGESTIONS
        : agents.map(
            (agent): AgentlineSuggestion => ({
              id: `agent:${agent.name}`,
              label: `@${agent.name}`,
              description: agent.status,
              insertion: `@${agent.name} `,
              disabled: agent.status === "unavailable",
            }),
          )

  const query = context.query.toLowerCase()
  return suggestions
    .filter((suggestion) =>
      suggestion.label.slice(1).toLowerCase().includes(query),
    )
    .sort((first, second) => {
      const firstStarts = first.label
        .slice(1)
        .toLowerCase()
        .startsWith(query)
      const secondStarts = second.label
        .slice(1)
        .toLowerCase()
        .startsWith(query)
      if (firstStarts !== secondStarts) return firstStarts ? -1 : 1
      return first.label.localeCompare(second.label)
    })
}

export function applySuggestion(
  input: string,
  context: SuggestionContext,
  suggestion: AgentlineSuggestion,
) {
  if (suggestion.disabled) return

  const value =
    input.slice(0, context.start) +
    suggestion.insertion +
    input.slice(context.end)

  return {
    value,
    cursorOffset: context.start + suggestion.insertion.length,
  }
}
