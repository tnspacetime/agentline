import type {
  SessionExecutionFailed,
  SessionExecutionInterrupted,
  SessionInfo,
  SessionPendingUser,
} from "@opencode-ai/client"
import type { AgentlineAgentID } from "./types"

export type AgentlineResponseExecutionState =
  | Readonly<{ kind: "running" }>
  | Readonly<{ kind: "succeeded" }>
  | Readonly<{
      kind: "failed"
      error: SessionExecutionFailed["data"]["error"]
    }>
  | Readonly<{
      kind: "interrupted"
      reason: SessionExecutionInterrupted["data"]["reason"]
    }>

/** Agentline identity and execution state for one exact OpenCode input. */
export type AgentlineResponse = Readonly<{
  id: string
  agent: Readonly<{
    id: AgentlineAgentID
    name: string
  }>
  source: Readonly<{
    sessionID: SessionInfo["id"]
    inputID: SessionPendingUser["id"]
  }>
  createdAt: number
  execution: AgentlineResponseExecutionState
}>

export function agentlineResponseID(
  sessionID: SessionInfo["id"],
  inputID: SessionPendingUser["id"],
): AgentlineResponse["id"] {
  return `${sessionID}:${inputID}`
}

export function isTerminalResponse(response: AgentlineResponse): boolean {
  return response.execution.kind !== "running"
}
