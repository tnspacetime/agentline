export const SYSTEM_COMMANDS = [
  "list",
  "active",
  "waiting",
  "changed",
  "errors",
  "search",
  "create",
  "attach",
  "detach",
  "describe",
] as const

export type SystemCommand = (typeof SYSTEM_COMMANDS)[number]
export type ViewSystemCommand = Exclude<
  SystemCommand,
  "create" | "attach" | "detach" | "describe"
>

export const EXPLICIT_ACTIONS = [
  "focus",
  "tell",
  "explain",
  "review",
] as const

export type ExplicitAction = (typeof EXPLICIT_ACTIONS)[number]

export type AgentReference = `@${string}`

export type ViewSystemAction = {
  type: "system"
  command: ViewSystemCommand
  arguments: string
}

export type CreateSystemAction = {
  type: "system"
  command: "create"
  alias: AgentReference
  /** Omitted for a local Agentline identity; present for an OpenCode workspace. */
  directory?: string
}

export type AttachSystemAction = {
  type: "system"
  command: "attach"
  alias: AgentReference
  sessionId: string
}

export type DetachSystemAction = {
  type: "system"
  command: "detach"
  alias: AgentReference
}

export type DescribeSystemAction = {
  type: "system"
  command: "describe"
  alias: AgentReference
  /** Omitted to open the description editor. */
  description?: string
}

export type SystemAction =
  | ViewSystemAction
  | CreateSystemAction
  | AttachSystemAction
  | DetachSystemAction
  | DescribeSystemAction

export type FocusAction = {
  type: "focus"
  target: AgentReference
}

export type TellAction = {
  type: "tell"
  targets: AgentReference[]
  instruction: string
  implicitTarget: boolean
}

export type ExplainAction = {
  type: "explain"
  targets: AgentReference[]
  question?: string
}

export type ReviewAction = {
  type: "review"
  targets: AgentReference[]
  reviewer?: AgentReference
}

export type AgentLanguageAction =
  | SystemAction
  | FocusAction
  | TellAction
  | ExplainAction
  | ReviewAction

export type AgentLanguageParseErrorCode =
  | "empty_input"
  | "invalid_agent_reference"
  | "missing_target"
  | "multiple_focus_targets"
  | "missing_instruction"
  | "no_focused_agent"
  | "unknown_command"
  | "unknown_action"
  | "unknown_modifier"
  | "missing_search_query"
  | "missing_agent_alias"
  | "missing_session_id"
  | "unexpected_argument"

export type SourceSpan = Readonly<{
  start: number
  end: number
}>

export type AgentLanguageParseError = {
  code: AgentLanguageParseErrorCode
  message: string
  token?: string
  span?: SourceSpan
}

export type AgentLanguageParseResult =
  | {
      ok: true
      action: AgentLanguageAction
    }
  | {
      ok: false
      error: AgentLanguageParseError
    }

export type ParseAgentLanguageOptions = {
  focusedAgent?: AgentReference
}
