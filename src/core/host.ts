import type {
  FormInfo,
  PermissionRequest,
  SessionInfo,
  SessionMessageUser,
  SessionPendingUser,
  SessionStatus,
} from "@opencode-ai/client"
import type {
  AgentlineActivity,
  AgentlineAgentID,
  AgentlineAgentRef,
  AgentlineState,
} from "./types"

/**
 * The host is the interpreter's boundary to effects outside Agent Language.
 *
 * Agentline owns identities, focus, activities, and interpretation. The host
 * owns no Agentline meaning. It provides storage and platform utilities, and
 * it exposes OpenCode through exact SDK types rather than Agentline-shaped
 * substitutes.
 *
 * OpenCode remains client/server: a host implementation calls the OpenCode
 * SDK and reads the TUI's synchronized OpenCode state. OpenCode events enter
 * the interpreter separately through observe(); the host does not interpret
 * or convert them into invented lifecycle states.
 *
 * Local agents do not require these OpenCode operations. The interpreter uses
 * them only when creating, attaching, opening, or messaging an OpenCode-backed
 * agent.
 */

export type AgentlineNotificationVariant =
  "info" | "success" | "warning" | "error"

export type AgentlineNotification = {
  variant: AgentlineNotificationVariant
  message: string
}

export type AgentlineOpenCodeSessionCreateInput = {
  name: AgentlineAgentRef["name"]
  directory: SessionInfo["location"]["directory"]
}

export type AgentlineOpenCodeMessageSubmission = {
  sessionID: SessionInfo["id"]
  messageID: SessionPendingUser["id"]
  message: SessionPendingUser["data"]["text"]
}

export type AgentlineOpenCodeStoredSubmission =
  SessionPendingUser | SessionMessageUser

export interface AgentlineHost {
  /** Read untrusted persisted data for startup decoding and migration. */
  readState(): Promise<unknown>

  /** Persist the environment's validated Agentline state. */
  writeState(state: Readonly<AgentlineState>): Promise<void>

  /** Create an opaque stable ID for a new Agentline identity. */
  createAgentID(): AgentlineAgentID

  /** Ask the user to set or clear one Agentline description. */
  promptAgentDescription(agent: AgentlineAgentRef): Promise<string | undefined>

  /** Resolve and validate a workspace directory. */
  resolveDirectory(
    inputDirectory: string,
  ): Promise<SessionInfo["location"]["directory"]>

  /** Create a new OpenCode session for an Agentline identity. */
  createSession(
    input: AgentlineOpenCodeSessionCreateInput,
  ): Promise<SessionInfo>

  /** Fetch and verify an existing OpenCode session, rejecting if unavailable. */
  loadSession(sessionID: SessionInfo["id"]): Promise<SessionInfo>

  /** Read a session from OpenCode's synchronized TUI state. */
  session(sessionID: SessionInfo["id"]): SessionInfo | undefined

  /** Read the exact synchronized OpenCode session status. */
  sessionStatus(sessionID: SessionInfo["id"]): SessionStatus | undefined

  /** Read pending OpenCode permission requests for a session. */
  permissions(sessionID: SessionInfo["id"]): readonly PermissionRequest[]

  /** Read pending OpenCode forms for a session. */
  forms(sessionID: SessionInfo["id"]): readonly FormInfo[]

  /** Load one exact admitted or promoted input for restart reconciliation. */
  loadSubmission(
    sessionID: SessionInfo["id"],
    messageID: SessionPendingUser["id"],
  ): Promise<AgentlineOpenCodeStoredSubmission | undefined>

  /** Create an ID accepted by OpenCode for durable prompt admission. */
  createMessageID(): SessionPendingUser["id"]

  /** Durably admit one queued message through OpenCode's v2 session path. */
  submitMessage(
    input: AgentlineOpenCodeMessageSubmission,
  ): Promise<SessionPendingUser>

  /** Navigate the TUI to an attached OpenCode session. */
  openSession(sessionID: SessionInfo["id"]): void

  /** Create an Agentline-owned activity ID. */
  createActivityID(kind: AgentlineActivity["kind"]): AgentlineActivity["id"]

  /** Return the current timestamp for Agentline-owned records. */
  now(): AgentlineActivity["createdAt"]

  /** Display an Agentline notification through the host UI. */
  notify(notification: AgentlineNotification): void
}
