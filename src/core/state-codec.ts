import { isAgentName } from "../language/index.ts"
import { isRecord } from "./errors"
import {
  type AgentlineActivity,
  type AgentlineAgentID,
  type AgentlineAgentRef,
  type AgentlineDispatchReceipt,
  type AgentlineDispatchTargetActivity,
  type AgentlineSubmissionActivity,
  type AgentlineState,
} from "./types"

export type AgentlineStateDecodeResult =
  | Readonly<{ kind: "empty"; state: AgentlineState }>
  | Readonly<{ kind: "loaded"; state: AgentlineState }>
  | Readonly<{ kind: "invalid"; reason: string }>
  | Readonly<{ kind: "unsupported"; version: number }>

/** Create the canonical empty durable state for a first Agentline run. */
export function emptyAgentlineState(): AgentlineState {
  return {
    version: 5,
    agents: {},
    activity: [],
  }
}

/** Decode untrusted persisted state without mutating an environment. */
export function decodeAgentlineState(
  value: unknown,
): AgentlineStateDecodeResult {
  if (value === undefined || value === null) {
    return { kind: "empty", state: emptyAgentlineState() }
  }
  if (!isRecord(value)) {
    return invalid("Persisted Agentline state must be an object.")
  }

  if (
    typeof value.version === "number" &&
    Number.isInteger(value.version) &&
    value.version !== 5
  ) {
    return { kind: "unsupported", version: value.version }
  }
  if (value.version !== 5) {
    return invalid("Persisted Agentline state has no valid version.")
  }
  if (!isRecord(value.agents)) {
    return invalid("Persisted Agentline state has no valid agents record.")
  }
  if (!Array.isArray(value.activity)) {
    return invalid("Persisted Agentline state has no valid activity array.")
  }

  const agents: Record<AgentlineAgentID, AgentlineAgentRef> = {}
  const agentIDsByName = new Map<string, AgentlineAgentID>()
  const attachedSessions = new Map<string, string>()
  for (const [key, candidate] of Object.entries(value.agents)) {
    if (!isRecord(candidate)) {
      return invalid(`Agent record ${JSON.stringify(key)} is not an object.`)
    }
    if (typeof candidate.name !== "string" || !isAgentName(candidate.name)) {
      return invalid(`Agent record ${JSON.stringify(key)} has an invalid name.`)
    }

    const id = candidate.id
    if (typeof id !== "string" || !isAgentID(id)) {
      return invalid(`Agent record ${JSON.stringify(key)} has an invalid ID.`)
    }
    if (id !== key) {
      return invalid(
        `Agent record ${JSON.stringify(key)} contains the different ID ${id}.`,
      )
    }
    if (agentIDsByName.has(candidate.name)) {
      return invalid(`Agent name @${candidate.name} is duplicated.`)
    }
    if (
      candidate.description !== undefined &&
      (typeof candidate.description !== "string" ||
        candidate.description.trim().length === 0)
    ) {
      return invalid(`Agent @${candidate.name} has an invalid description.`)
    }
    if (
      candidate.sessionID !== undefined &&
      typeof candidate.sessionID !== "string"
    ) {
      return invalid(`Agent @${candidate.name} has an invalid session ID.`)
    }
    if (typeof candidate.sessionID === "string") {
      const owner = attachedSessions.get(candidate.sessionID)
      if (owner) {
        return invalid(
          `OpenCode session ${candidate.sessionID} is attached to both @${owner} and @${candidate.name}.`,
        )
      }
      attachedSessions.set(candidate.sessionID, candidate.name)
    }

    agentIDsByName.set(candidate.name, id)
    agents[id] = {
      id,
      name: candidate.name,
      ...(typeof candidate.description === "string"
        ? { description: candidate.description }
        : {}),
      ...(typeof candidate.sessionID === "string"
        ? { sessionID: candidate.sessionID }
        : {}),
    }
  }

  const activity: AgentlineActivity[] = []
  const activityIDs = new Set<string>()
  for (const [index, candidate] of value.activity.entries()) {
    const decoded = decodePersistedActivity(candidate, index)
    if (decoded.kind === "invalid") return decoded
    if (activityIDs.has(decoded.activity.id)) {
      return invalid(`Activity ID ${decoded.activity.id} is duplicated.`)
    }
    activityIDs.add(decoded.activity.id)
    activity.push(decoded.activity)
  }

  const state: AgentlineState = {
    version: 5,
    agents,
    activity,
  }
  return { kind: "loaded", state }
}

/** Clone durable state before it crosses the environment boundary. */
export function cloneAgentlineState(state: AgentlineState): AgentlineState {
  const agents = Object.fromEntries(
    Object.entries(state.agents).map(([id, agent]) => [id, { ...agent }]),
  ) as Record<AgentlineAgentID, AgentlineAgentRef>

  return {
    version: 5,
    agents,
    activity: state.activity.map(cloneAgentlineActivity),
  }
}

/** Clone one durable activity and its per-agent delivery records. */
export function cloneAgentlineActivity(
  activity: AgentlineActivity,
): AgentlineActivity {
  if (activity.kind === "system") return { ...activity }
  return {
    ...activity,
    targets: activity.targets.map(cloneDispatchTarget),
  }
}

function cloneDispatchTarget(
  target: AgentlineDispatchTargetActivity,
): AgentlineDispatchTargetActivity {
  if (target.destination.kind === "local") {
    return {
      agentID: target.agentID,
      name: target.name,
      submission: { ...target.submission },
      destination: { kind: "local" },
      receipt: { kind: "local" },
    }
  }
  return {
    agentID: target.agentID,
    name: target.name,
    submission: { ...target.submission },
    destination: { ...target.destination },
    ...(target.receipt ? { receipt: { kind: "opencode" } } : {}),
  }
}

type PersistedActivityDecodeResult =
  | Readonly<{ kind: "decoded"; activity: AgentlineActivity }>
  | Readonly<{ kind: "invalid"; reason: string }>

function decodePersistedActivity(
  value: unknown,
  index: number,
): PersistedActivityDecodeResult {
  const label = `Activity at index ${index}`
  if (!isRecord(value)) return invalid(`${label} is not an object.`)
  if (typeof value.id !== "string" || value.id.length === 0) {
    return invalid(`${label} has an invalid ID.`)
  }
  if (
    typeof value.createdAt !== "number" ||
    !Number.isFinite(value.createdAt)
  ) {
    return invalid(`${label} has an invalid creation timestamp.`)
  }

  if (value.kind === "system") {
    if (typeof value.message !== "string") {
      return invalid(`${label} has an invalid message.`)
    }
    if (!isSystemLevel(value.level)) {
      return invalid(`${label} has an invalid system level.`)
    }
    return {
      kind: "decoded",
      activity: {
        id: value.id,
        kind: "system",
        level: value.level,
        message: value.message,
        createdAt: value.createdAt,
      },
    }
  }

  if (value.kind !== "dispatch") {
    return invalid(`${label} has an invalid kind.`)
  }
  if (typeof value.message !== "string") {
    return invalid(`${label} has an invalid message.`)
  }
  if (!Array.isArray(value.targets)) {
    return invalid(`${label} has no valid targets array.`)
  }

  const targets: AgentlineDispatchTargetActivity[] = []
  const targetIDs = new Set<AgentlineAgentID>()
  for (const [targetIndex, candidate] of value.targets.entries()) {
    const decoded = decodePersistedDispatchTarget(
      candidate,
      `${label}, target ${targetIndex}`,
    )
    if (decoded.kind === "invalid") return decoded
    if (targetIDs.has(decoded.target.agentID)) {
      return invalid(
        `${label} contains duplicate target @${decoded.target.name}.`,
      )
    }
    targetIDs.add(decoded.target.agentID)
    targets.push(decoded.target)
  }

  return {
    kind: "decoded",
    activity: {
      id: value.id,
      kind: "dispatch",
      message: value.message,
      targets,
      createdAt: value.createdAt,
    },
  }
}

type PersistedTargetDecodeResult =
  | Readonly<{
      kind: "decoded"
      target: AgentlineDispatchTargetActivity
    }>
  | Readonly<{ kind: "invalid"; reason: string }>

function decodePersistedDispatchTarget(
  value: unknown,
  label: string,
): PersistedTargetDecodeResult {
  if (!isRecord(value)) return invalid(`${label} is not an object.`)
  if (typeof value.name !== "string" || !isAgentName(value.name)) {
    return invalid(`${label} has an invalid agent name.`)
  }

  const agentID = value.agentID
  if (typeof agentID !== "string" || !isAgentID(agentID)) {
    return invalid(`${label} has an invalid agent ID.`)
  }

  const submission = decodeSubmission(value.submission)
  if (!submission) return invalid(`${label} has an invalid submission.`)

  const receipt = decodeReceipt(value.receipt)
  if (value.receipt !== undefined && !receipt) {
    return invalid(`${label} has an invalid dispatch receipt.`)
  }
  if (!isRecord(value.destination)) {
    return invalid(`${label} has an invalid destination.`)
  }

  if (value.destination.kind === "local") {
    if (receipt?.kind !== "local") {
      return invalid(`${label} has no valid local receipt.`)
    }
    return {
      kind: "decoded",
      target: {
        agentID,
        name: value.name,
        submission,
        destination: { kind: "local" },
        receipt: { kind: "local" },
      },
    }
  }

  if (value.destination.kind !== "opencode") {
    return invalid(`${label} has an invalid destination kind.`)
  }
  if (
    typeof value.destination.sessionID !== "string" ||
    value.destination.sessionID.length === 0
  ) {
    return invalid(`${label} has an invalid OpenCode session ID.`)
  }
  if (
    typeof value.destination.messageID !== "string" ||
    value.destination.messageID.length === 0
  ) {
    return invalid(`${label} has an invalid OpenCode message ID.`)
  }
  if (receipt?.kind === "local") {
    return invalid(`${label} has a local receipt for an OpenCode destination.`)
  }

  return {
    kind: "decoded",
    target: {
      agentID,
      name: value.name,
      submission,
      destination: {
        kind: "opencode",
        sessionID: value.destination.sessionID,
        messageID: value.destination.messageID,
      },
      ...(receipt ? { receipt: { kind: "opencode" } } : {}),
    },
  }
}

function invalid(reason: string): Readonly<{
  kind: "invalid"
  reason: string
}> {
  return { kind: "invalid", reason }
}

function isSystemLevel(
  value: unknown,
): value is "info" | "success" | "error" {
  return value === "info" || value === "success" || value === "error"
}

function decodeSubmission(
  value: unknown,
): AgentlineSubmissionActivity | undefined {
  if (!isRecord(value)) return
  if (value.status === "submitting") return { status: "submitting" }
  if (value.status === "submitted") return { status: "submitted" }
  if (
    value.status === "failed" &&
    typeof value.error === "string" &&
    value.error.length > 0
  ) {
    return { status: "failed", error: value.error }
  }
}

function decodeReceipt(
  value: unknown,
): AgentlineDispatchReceipt | undefined {
  if (!isRecord(value)) return
  if (value.kind === "local") return { kind: "local" }
  if (value.kind === "opencode") return { kind: "opencode" }
}

function isAgentID(value: string): value is AgentlineAgentID {
  return /^agt_[a-zA-Z0-9_-]+$/.test(value)
}
