import type { SessionInfo } from "@opencode-ai/client"
import {
  cloneAgentlineActivity,
  cloneAgentlineState,
} from "./state-codec"
import {
  type AgentlineActivity,
  type AgentlineAgentID,
  type AgentlineAgentRef,
  type AgentlineDispatchReceipt,
  type AgentlineSubmissionActivity,
  type AgentlineState,
} from "./types"

/**
 * Agentline's environment owns durable Agentline state and its invariants.
 *
 * Agent identities belong to Agentline and exist without OpenCode. An
 * optional session ID records an attachment to OpenCode; it does not define
 * the Agentline identity. Transient language, operation, persistence, and UI
 * publication state belongs to the interpreter instead.
 *
 * This contract owns no OpenCode behavior. It records attachment IDs, but the
 * host creates, reads, and controls the corresponding OpenCode sessions.
 * It stores activity records, per-agent submission calls, and independent
 * dispatch receipts chosen by the interpreter, but does not interpret the
 * later OpenCode input lifecycle.
 */

export interface AgentlineEnvironment {
  /** Return the durable Agentline state as a read-only snapshot. */
  state(): Readonly<AgentlineState>

  /** Find an Agentline identity by its language name. */
  agent(
    name: AgentlineAgentRef["name"],
  ): AgentlineAgentRef | undefined

  /** Find an Agentline identity by its stable ID. */
  agentByID(id: AgentlineAgentID): AgentlineAgentRef | undefined

  /** Find the Agentline identity attached to an OpenCode session. */
  agentBySessionID(
    sessionID: SessionInfo["id"],
  ): AgentlineAgentRef | undefined

  /** Create an unattached Agentline identity immediately. */
  createAgent(
    ref: AgentlineAgentRef,
  ): AgentlineAgentRef

  /** Remove an Agentline identity without deleting an OpenCode session. */
  removeAgent(id: AgentlineAgentID): void

  /** Attach an existing or newly created OpenCode session. */
  attachSession(
    id: AgentlineAgentID,
    sessionID: SessionInfo["id"],
  ): AgentlineAgentRef

  /** Remove the attachment while preserving the Agentline identity. */
  detachSession(
    id: AgentlineAgentID,
  ): AgentlineAgentRef

  /** Set or clear Agentline-owned profile text. */
  setDescription(
    id: AgentlineAgentID,
    description: string | undefined,
  ): AgentlineAgentRef

  /** Append durable history. Activity order is oldest first. */
  appendActivity(activity: AgentlineActivity): void

  /**
   * Each target has its own Agentline submission call. Updating that call must
   * not overwrite receipt evidence arriving independently from OpenCode.
   */
  updateDispatchSubmission(
    activityID: string,
    agentID: AgentlineAgentID,
    submission: AgentlineSubmissionActivity,
  ): void

  /**
   * A multi-agent dispatch can receive one receipt per target, independently
   * of both the other targets and the corresponding submission call.
   */
  recordDispatchReceipt(
    activityID: string,
    agentID: AgentlineAgentID,
    receipt: AgentlineDispatchReceipt,
  ): void
}

/**
 * In-memory durable Agentline state used by the interpreter.
 *
 * Persistence is intentionally absent: the interpreter decides when a
 * semantic change is durable and writes the resulting state through its
 * AgentlineHost.
 *
 * A few implementation choices are deliberately simple at this stage:
 *
 * - agentBySessionID performs a linear lookup. Agent boards are expected to be
 *   small, and a reverse index would introduce another synchronized invariant.
 *   Add one only if real event-processing measurements justify it.
 * - state() returns a defensive clone so callers cannot mutate environment
 *   state. If UI integration demonstrates wasteful rerenders, this can become
 *   a cached immutable snapshot without changing the environment contract.
 * - attachments are one-to-one. Rebinding requires an explicit detach first,
 *   so neither an Agentline identity nor an OpenCode session is silently
 *   displaced.
 *
 * Durable activity is an uncapped chronological history. Presentation code
 * may select or virtualize a recent window, but it must not mutate or truncate
 * the durable environment to achieve that presentation.
 */
export class AgentlineMemoryEnvironment implements AgentlineEnvironment {
  private currentState: AgentlineState

  /** Construct only from state already decoded by the startup boundary. */
  constructor(initialState: AgentlineState) {
    this.currentState = cloneAgentlineState(initialState)
  }

  state(): Readonly<AgentlineState> {
    return cloneAgentlineState(this.currentState)
  }

  agent(
    name: AgentlineAgentRef["name"],
  ): AgentlineAgentRef | undefined {
    const agent = Object.values(this.currentState.agents).find(
      (candidate) => candidate.name === name,
    )
    return agent ? { ...agent } : undefined
  }

  agentByID(id: AgentlineAgentID): AgentlineAgentRef | undefined {
    const agent = this.currentState.agents[id]
    return agent ? { ...agent } : undefined
  }

  agentBySessionID(
    sessionID: SessionInfo["id"],
  ): AgentlineAgentRef | undefined {
    const agent = Object.values(this.currentState.agents).find(
      (candidate) => candidate.sessionID === sessionID,
    )
    return agent ? { ...agent } : undefined
  }

  createAgent(
    ref: AgentlineAgentRef,
  ): AgentlineAgentRef {
    const { id, name } = ref
    if (this.currentState.agents[id]) {
      throw new Error(`Agentline agent ID ${id} already exists.`)
    }
    if (this.agent(name)) {
      throw new Error(`Agent @${name} already exists.`)
    }

    const agent: AgentlineAgentRef = { id, name }
    this.replaceAgents({
      ...this.currentState.agents,
      [id]: agent,
    })
    return { ...agent }
  }

  removeAgent(id: AgentlineAgentID): void {
    this.requireAgent(id)

    const agents = { ...this.currentState.agents }
    delete agents[id]
    this.replaceAgents(agents)
  }

  attachSession(
    id: AgentlineAgentID,
    sessionID: SessionInfo["id"],
  ): AgentlineAgentRef {
    const agent = this.requireAgent(id)
    const attached = this.agentBySessionID(sessionID)
    if (attached && attached.id !== id) {
      throw new Error(
        `OpenCode session ${sessionID} is already attached to @${attached.name}.`,
      )
    }
    if (agent.sessionID === sessionID) return agent
    if (agent.sessionID) {
      throw new Error(
        `Agent @${agent.name} is already attached. Detach it first.`,
      )
    }

    const next = { ...agent, sessionID }
    this.replaceAgents({
      ...this.currentState.agents,
      [id]: next,
    })
    return { ...next }
  }

  detachSession(
    id: AgentlineAgentID,
  ): AgentlineAgentRef {
    const agent = this.requireAgent(id)
    if (!agent.sessionID) return agent

    const { sessionID: _sessionID, ...next } = agent
    this.replaceAgents({
      ...this.currentState.agents,
      [id]: next,
    })
    return { ...next }
  }

  setDescription(
    id: AgentlineAgentID,
    description: string | undefined,
  ): AgentlineAgentRef {
    const agent = this.requireAgent(id)
    const normalized = description?.trim() || undefined
    const { description: _description, ...withoutDescription } = agent
    const next: AgentlineAgentRef = {
      ...withoutDescription,
      ...(normalized ? { description: normalized } : {}),
    }
    this.replaceAgents({
      ...this.currentState.agents,
      [id]: next,
    })
    return { ...next }
  }

  appendActivity(activity: AgentlineActivity): void {
    if (!activity.id || !Number.isFinite(activity.createdAt)) {
      throw new Error("Activity must have a valid ID and creation timestamp.")
    }
    if (
      this.currentState.activity.some(
        (candidate) => candidate.id === activity.id,
      )
    ) {
      throw new Error(`Activity ${activity.id} already exists.`)
    }
    if (activity.kind === "dispatch") {
      const agentIDs = new Set<AgentlineAgentID>()
      for (const target of activity.targets) {
        assertDispatchTarget(target)
        if (agentIDs.has(target.agentID)) {
          throw new Error(
            `Dispatch ${activity.id} contains duplicate target @${target.name}.`,
          )
        }
        agentIDs.add(target.agentID)
      }
    }

    this.currentState = {
      ...this.currentState,
      activity: [
        ...this.currentState.activity,
        cloneAgentlineActivity(activity),
      ],
    }
  }

  updateDispatchSubmission(
    activityID: string,
    agentID: AgentlineAgentID,
    submission: AgentlineSubmissionActivity,
  ): void {
    this.updateDispatchTarget(activityID, agentID, (target) => ({
      ...target,
      submission: { ...submission },
    }))
  }

  recordDispatchReceipt(
    activityID: string,
    agentID: AgentlineAgentID,
    receipt: AgentlineDispatchReceipt,
  ): void {
    this.updateDispatchTarget(activityID, agentID, (target) => {
      if (target.destination.kind === "local") {
        if (receipt.kind !== "local") {
          throw new Error(
            `Dispatch ${activityID} cannot record an OpenCode receipt for local target @${target.name}.`,
          )
        }
        return {
          agentID: target.agentID,
          name: target.name,
          submission: { ...target.submission },
          destination: { kind: "local" },
          receipt: { kind: "local" },
        }
      }
      if (receipt.kind !== "opencode") {
        throw new Error(
          `Dispatch ${activityID} cannot record a local receipt for OpenCode target @${target.name}.`,
        )
      }
      return {
        agentID: target.agentID,
        name: target.name,
        submission: { ...target.submission },
        destination: { ...target.destination },
        receipt: { kind: "opencode" },
      }
    })
  }

  private updateDispatchTarget(
    activityID: string,
    agentID: AgentlineAgentID,
    update: (
      target: Extract<AgentlineActivity, { kind: "dispatch" }>["targets"][number],
    ) => Extract<AgentlineActivity, { kind: "dispatch" }>["targets"][number],
  ): void {
    const activityIndex = this.currentState.activity.findIndex(
      (candidate) => candidate.id === activityID,
    )
    const activity = this.currentState.activity[activityIndex]
    if (!activity) throw new Error(`Unknown activity ${activityID}.`)
    if (activity.kind !== "dispatch") {
      throw new Error(`Activity ${activityID} is not a dispatch.`)
    }

    const targetIndex = activity.targets.findIndex(
      (candidate) => candidate.agentID === agentID,
    )
    if (targetIndex === -1) {
      throw new Error(`Dispatch ${activityID} has no target ${agentID}.`)
    }

    const targets = activity.targets.map((candidate, index) =>
      index === targetIndex ? update(candidate) : candidate,
    )
    const nextActivity: AgentlineActivity = { ...activity, targets }
    this.currentState = {
      ...this.currentState,
      activity: this.currentState.activity.map((candidate, index) =>
        index === activityIndex ? nextActivity : candidate,
      ),
    }
  }

  private requireAgent(id: AgentlineAgentID): AgentlineAgentRef {
    const agent = this.currentState.agents[id]
    if (!agent) throw new Error(`Unknown Agentline agent ID ${id}.`)
    return { ...agent }
  }

  private replaceAgents(
    agents: Record<AgentlineAgentID, AgentlineAgentRef>,
  ) {
    this.currentState = {
      ...this.currentState,
      agents,
    }
  }
}

function assertDispatchTarget(
  target: Extract<AgentlineActivity, { kind: "dispatch" }>["targets"][number],
): void {
  if (target.destination.kind === "local") {
    if (target.receipt?.kind !== "local") {
      throw new Error(`Local target @${target.name} has no local receipt.`)
    }
    return
  }
  if (!target.destination.sessionID || !target.destination.messageID) {
    throw new Error(
      `OpenCode target @${target.name} requires exact session and message IDs.`,
    )
  }
  if (target.receipt && target.receipt.kind !== "opencode") {
    throw new Error(
      `OpenCode target @${target.name} has a non-OpenCode receipt.`,
    )
  }
}
