import type {
  OpenCodeEvent,
  SessionInfo,
  SessionStatus,
} from "@opencode-ai/client"
import {
  parseAgentLanguage,
  type AgentLanguageAction,
  type AgentReference,
  type ParseAgentLanguageOptions,
  type SystemAction,
} from "../language/index.ts"
import type { AgentlineEnvironment } from "./environment"
import { messageFromError } from "./errors"
import {
  agentlineResponseID,
  type AgentlineResponse,
  type AgentlineResponseExecutionState,
} from "./responses"
import type { AgentlineHost, AgentlineNotificationVariant } from "./host"
import type {
  AgentlineActivity,
  AgentlineAgent,
  AgentlineAgentID,
  AgentlineAgentRef,
  AgentlineAttention,
  AgentlineBoard,
  AgentlineDispatchTargetActivity,
  AgentlineSystemActivity,
} from "./types"

/**
 * Agentline is a small language system:
 *
 *   user text -> parser -> AgentLanguageAction -> interpreter
 *                                      |-> environment (Agentline state)
 *                                      `-> host (external effects)
 *
 * The parser owns syntax and diagnostics. The interpreter owns meaning. The
 * environment owns Agentline identities and durable history. The host exposes
 * storage, OpenCode, navigation, clock, IDs, and notifications without
 * inventing Agentline lifecycle states.
 *
 * The environment contains durable Agentline state only. Focus, attaching
 * operations, persistence outcomes, OpenCode observations, and subscriber
 * publication are transient interpreter concerns. The interpreter is the sole
 * mutation coordinator and the only observable boundary used by the UI.
 *
 * Agentline identities exist independently of OpenCode. OpenCode events enter
 * through observe(), bypassing the language parser, and are treated as exact
 * host facts. Session status is never interpreted as task completion.
 */

type AgentlineOpenCodeObservationType =
  | "session.status"
  | "session.renamed"
  | "session.moved"
  | "session.deleted"
  | "session.input.admitted"
  | "session.input.queued"
  | "session.input.steered"
  | "session.input.promoted"
  | "session.input.cancelled"
  | "session.execution.succeeded"
  | "session.execution.failed"
  | "session.execution.interrupted"
  | "permission.asked"
  | "permission.replied"
  | "form.created"
  | "form.replied"
  | "form.cancelled"

export type AgentlineOpenCodeObservation = Extract<
  OpenCodeEvent,
  { type: AgentlineOpenCodeObservationType }
>

type AgentlineSubmissionObservation = Extract<
  AgentlineOpenCodeObservation,
  {
    type:
      | "session.input.admitted"
      | "session.input.queued"
      | "session.input.steered"
      | "session.input.promoted"
      | "session.input.cancelled"
  }
>

type ObservedResponse = {
  id: AgentlineResponse["id"]
  agentID: AgentlineAgentID
  sessionID: SessionInfo["id"]
  inputID: AgentlineResponse["source"]["inputID"]
  createdAt: number
  execution: AgentlineResponseExecutionState
}

export type AgentlineInterpreterSnapshot = Readonly<{
  board: AgentlineBoard
  activity: readonly AgentlineActivity[]
  responses: readonly AgentlineResponse[]
  persistenceDirty: boolean
}>

export type AgentlineInterpreterListener = () => void

export interface AgentlineInterpreter {
  languageContext(): ParseAgentLanguageOptions
  execute(input: string): Promise<void>
  interpret(action: AgentLanguageAction): Promise<void>
  observe(observation: AgentlineOpenCodeObservation): Promise<void>
  flush(): Promise<void>
  snapshot(): AgentlineInterpreterSnapshot
  subscribe(listener: AgentlineInterpreterListener): () => void
}

export class AgentlineInterpreterEngine implements AgentlineInterpreter {
  private readonly listeners = new Set<AgentlineInterpreterListener>()
  private currentFocus?: AgentlineAgentID
  private readonly attachingAgents = new Set<AgentlineAgentID>()
  private persistenceDirty = false
  private readonly sessionErrors = new Map<
    SessionInfo["id"],
    AgentlineAttention
  >()
  private readonly observedSessions = new Map<SessionInfo["id"], SessionInfo>()
  private readonly observedStatuses = new Map<
    SessionInfo["id"],
    SessionStatus
  >()
  private readonly observedResponses = new Map<
    AgentlineResponse["id"],
    ObservedResponse
  >()
  private readonly activeResponseBySession = new Map<
    SessionInfo["id"],
    AgentlineResponse["id"]
  >()

  constructor(
    private readonly host: AgentlineHost,
    private readonly environment: AgentlineEnvironment,
  ) {}

  /** Synchronize attachments and recover exact OpenCode dispatch receipts. */
  async start(): Promise<void> {
    this.resetTransientState()
    const attachments = Object.values(this.environment.state().agents).flatMap(
      (agent) =>
        agent.sessionID
          ? [
              this.host.loadSession(agent.sessionID).then((session) => {
                this.observedSessions.set(session.id, session)
              }),
            ]
          : [],
    )
    await Promise.allSettled(attachments)
    await this.reconcileStoredSubmissions()
    this.emit()
  }

  languageContext(): ParseAgentLanguageOptions {
    const focused = this.currentFocus
      ? this.environment.agentByID(this.currentFocus)
      : undefined
    return focused ? { focusedAgent: referenceFromName(focused.name) } : {}
  }

  async execute(input: string): Promise<void> {
    const parsed = parseAgentLanguage(input, this.languageContext())
    if (!parsed.ok) {
      await this.report("error", "error", parsed.error.message)
      return
    }
    await this.interpret(parsed.action)
  }

  async interpret(action: AgentLanguageAction): Promise<void> {
    switch (action.type) {
      case "system":
        await this.interpretSystem(action)
        return
      case "focus":
        await this.focus(action.target)
        return
      case "tell":
        await this.tell(
          action.targets.map(nameFromReference),
          action.instruction,
        )
        return
      case "explain":
        await this.unsupported("Explain")
        return
      case "review":
        await this.unsupported("Review")
        return
    }
  }

  async observe(observation: AgentlineOpenCodeObservation): Promise<void> {
    const sessionID = observationSessionID(observation)
    if (!sessionID) return
    if (isSubmissionObservation(observation)) {
      await this.recordObservedSubmission(observation)
      if (observation.type !== "session.input.promoted") {
        this.emit()
        return
      }
    }
    const agent = this.environment.agentBySessionID(sessionID)
    if (!agent) {
      this.emit()
      return
    }

    this.observeResponse(observation, agent)

    switch (observation.type) {
      case "session.status":
        this.sessionErrors.delete(sessionID)
        this.observedStatuses.set(sessionID, observation.data.status)
        break
      case "permission.asked":
      case "form.created":
        this.sessionErrors.delete(sessionID)
        break
      case "permission.replied":
      case "form.replied":
      case "form.cancelled":
        // OpenCode updates synchronized attention state immediately after the
        // event; yield one microtask before the UI reads it again.
        await Promise.resolve()
        break
      case "session.execution.failed":
        this.sessionErrors.set(sessionID, {
          kind: "error",
          error: observation.data.error,
          summary: messageFromError(observation.data.error),
        })
        break
      case "session.execution.succeeded":
      case "session.execution.interrupted":
      case "session.input.promoted":
        break
      case "session.deleted":
        this.sessionErrors.delete(sessionID)
        this.observedSessions.delete(sessionID)
        this.observedStatuses.delete(sessionID)
        try {
          await this.host.loadSession(sessionID)
        } catch {}
        break
      case "session.renamed":
      case "session.moved": {
        await Promise.resolve()
        const session = this.host.session(sessionID)
        if (session) this.observedSessions.set(sessionID, session)
        break
      }
    }

    this.emit()
  }

  async flush(): Promise<void> {
    if (!this.persistenceDirty) return
    const error = await this.persist()
    if (error) {
      this.host.notify({
        variant: "error",
        message: `Failed to persist pending Agentline changes: ${error}`,
      })
      return
    }

    this.host.notify({
      variant: "success",
      message: "Persisted pending Agentline changes.",
    })
    this.emit()
  }

  snapshot(): AgentlineInterpreterSnapshot {
    const state = this.environment.state()
    const latestAssignments = latestAssignmentsByAgent(state.activity)
    const agents = Object.values(state.agents).map((ref) =>
      this.readAgent(ref, latestAssignments.get(ref.id)),
    )
    const focusedAgentID = this.currentFocus

    return {
      board: {
        agents,
        ...(focusedAgentID ? { focusedAgentID } : {}),
      },
      activity: state.activity,
      responses: this.readResponses(),
      persistenceDirty: this.persistenceDirty,
    }
  }

  subscribe(listener: AgentlineInterpreterListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private observeResponse(
    observation: AgentlineOpenCodeObservation,
    agent: AgentlineAgentRef,
  ): void {
    const sessionID = observationSessionID(observation)
    if (!sessionID) return

    switch (observation.type) {
      case "session.input.promoted": {
        const id = agentlineResponseID(sessionID, observation.data.inputID)
        if (!this.observedResponses.has(id)) {
          this.observedResponses.set(id, {
            id,
            agentID: agent.id,
            sessionID,
            inputID: observation.data.inputID,
            createdAt: observation.created,
            execution: { kind: "running" },
          })
        }
        this.activeResponseBySession.set(sessionID, id)
        return
      }
      case "session.execution.succeeded":
        this.settleResponse(sessionID, { kind: "succeeded" })
        return
      case "session.execution.failed":
        this.settleResponse(sessionID, {
          kind: "failed",
          error: observation.data.error,
        })
        return
      case "session.execution.interrupted":
        this.settleResponse(sessionID, {
          kind: "interrupted",
          reason: observation.data.reason,
        })
        return
      default:
        return
    }
  }

  private settleResponse(
    sessionID: SessionInfo["id"],
    execution: Exclude<AgentlineResponseExecutionState, { kind: "running" }>,
  ): void {
    const responseID = this.activeResponseBySession.get(sessionID)
    if (!responseID) return
    const response = this.observedResponses.get(responseID)
    if (!response) return
    response.execution = execution
    this.activeResponseBySession.delete(sessionID)
  }

  private readResponses(): readonly AgentlineResponse[] {
    return [...this.observedResponses.values()].flatMap((observed) => {
      const agent = this.environment.agentByID(observed.agentID)
      if (!agent) return []
      return [
        {
          id: observed.id,
          agent: { id: observed.agentID, name: agent.name },
          source: {
            sessionID: observed.sessionID,
            inputID: observed.inputID,
          },
          createdAt: observed.createdAt,
          execution: observed.execution,
        },
      ]
    })
  }

  private async interpretSystem(action: SystemAction): Promise<void> {
    switch (action.command) {
      case "create": {
        const name = nameFromReference(action.alias)
        if (action.directory === undefined) {
          await this.createLocalAgent(name)
        } else {
          await this.createWorkspaceAgent(name, action.directory)
        }
        return
      }
      case "attach":
        await this.attachExistingSession(
          nameFromReference(action.alias),
          action.sessionId,
        )
        return
      case "detach":
        await this.detachSession(nameFromReference(action.alias))
        return
      case "describe":
        await this.describeAgent(
          nameFromReference(action.alias),
          action.description,
        )
        return
      default:
        await this.unsupported(`/${action.command}`)
    }
  }

  private async createLocalAgent(
    name: AgentlineAgentRef["name"],
  ): Promise<void> {
    const result = await this.createIdentity(name)
    if (result === "failed") return
    if (result === "dirty") {
      this.emit()
      return
    }
    await this.report("success", "success", `Created local agent @${name}.`)
  }

  private async createWorkspaceAgent(
    name: AgentlineAgentRef["name"],
    inputDirectory: string,
  ): Promise<void> {
    const identity = await this.createIdentity(name)
    if (identity === "failed") return
    if (identity === "dirty") {
      this.emit()
      return
    }

    const agent = this.environment.agent(name)!
    this.attachingAgents.add(agent.id)
    this.emit()

    let directory: SessionInfo["location"]["directory"]
    try {
      directory = await this.host.resolveDirectory(inputDirectory)
      const session = await this.host.createSession({ name, directory })
      this.observedSessions.set(session.id, session)
      this.environment.attachSession(agent.id, session.id)
    } catch (error) {
      this.attachingAgents.delete(agent.id)
      await this.report(
        "error",
        "error",
        `Failed to attach OpenCode to @${name}: ${messageFromError(error)}`,
      )
      return
    }

    this.attachingAgents.delete(agent.id)
    const persistenceError = await this.persist()
    if (persistenceError) {
      const message = `Attached OpenCode to @${name}, but failed to persist it: ${persistenceError}`
      this.appendSystem("error", message)
      this.host.notify({ variant: "error", message })
      this.emit()
      return
    }

    await this.report("success", "success", `Created @${name} in ${directory}.`)
  }

  private async attachExistingSession(
    name: AgentlineAgentRef["name"],
    sessionID: SessionInfo["id"],
  ): Promise<void> {
    const agent = this.environment.agent(name)
    if (!agent) {
      await this.report("error", "error", `Unknown agent @${name}.`)
      return
    }
    if (agent.sessionID) {
      await this.report(
        "error",
        "error",
        `Agent @${name} is already attached. Detach it first.`,
      )
      return
    }

    this.attachingAgents.add(agent.id)
    this.emit()
    try {
      const session = await this.host.loadSession(sessionID)
      this.observedSessions.set(session.id, session)
      this.environment.attachSession(agent.id, sessionID)
    } catch (error) {
      this.attachingAgents.delete(agent.id)
      await this.report(
        "error",
        "error",
        `Failed to attach OpenCode to @${name}: ${messageFromError(error)}`,
      )
      return
    }

    this.attachingAgents.delete(agent.id)
    const persistenceError = await this.persist()
    if (persistenceError) {
      const message = `Attached OpenCode to @${name}, but failed to persist it: ${persistenceError}`
      this.appendSystem("error", message)
      this.host.notify({ variant: "error", message })
      this.emit()
      return
    }

    await this.report(
      "success",
      "success",
      `Attached @${name} to OpenCode session ${sessionID}.`,
    )
  }

  private async detachSession(name: AgentlineAgentRef["name"]): Promise<void> {
    const agent = this.environment.agent(name)
    if (!agent) {
      await this.report("error", "error", `Unknown agent @${name}.`)
      return
    }
    if (!agent.sessionID) {
      await this.report(
        "error",
        "error",
        `Agent @${name} is not attached to OpenCode.`,
      )
      return
    }

    const sessionID = agent.sessionID
    this.environment.detachSession(agent.id)
    this.sessionErrors.delete(sessionID)
    this.observedSessions.delete(sessionID)
    this.observedStatuses.delete(sessionID)

    const persistenceError = await this.persist()
    if (persistenceError) {
      const message = `Detached @${name} in memory, but failed to persist it: ${persistenceError}`
      this.appendSystem("error", message)
      this.host.notify({ variant: "error", message })
      this.emit()
      return
    }

    await this.report(
      "success",
      "success",
      `Detached @${name} from OpenCode without deleting session ${sessionID}.`,
    )
  }

  private async createIdentity(
    name: AgentlineAgentRef["name"],
  ): Promise<"persisted" | "dirty" | "failed"> {
    const parent = parentAgentName(name)
    if (parent && !this.environment.agent(parent)) {
      await this.report(
        "error",
        "error",
        `Agent @${name} requires parent @${parent}.`,
      )
      return "failed"
    }

    try {
      this.environment.createAgent({
        id: this.host.createAgentID(),
        name,
      })
    } catch (error) {
      await this.report(
        "error",
        "error",
        `Failed to create @${name}: ${messageFromError(error)}`,
      )
      return "failed"
    }

    const persistenceError = await this.persist()
    if (persistenceError) {
      const message = `Created @${name} in memory, but failed to persist it: ${persistenceError}`
      this.appendSystem("error", message)
      this.host.notify({ variant: "error", message })
      return "dirty"
    }
    return "persisted"
  }

  private async focus(reference: AgentReference): Promise<void> {
    const name = nameFromReference(reference)
    const agent = this.environment.agent(name)
    if (!agent) {
      await this.report("error", "error", `Unknown agent @${name}.`)
      return
    }

    if (agent.sessionID) {
      if (!this.host.session(agent.sessionID)) {
        try {
          const session = await this.host.loadSession(agent.sessionID)
          this.observedSessions.set(session.id, session)
        } catch {
          await this.report("error", "error", `Agent @${name} is unavailable.`)
          return
        }
      }
      this.host.openSession(agent.sessionID)
    }

    this.currentFocus = agent.id
    this.emit()
  }

  private async tell(
    targets: AgentlineAgentRef["name"][],
    message: string,
  ): Promise<void> {
    const unknown = targets.filter((name) => !this.environment.agent(name))
    if (unknown.length > 0) {
      const labels = unknown.map((name) => `@${name}`).join(", ")
      await this.report(
        "error",
        "error",
        `Unknown agent${unknown.length > 1 ? "s" : ""} ${labels}. Nothing was dispatched.`,
      )
      return
    }

    const agents = targets.map((name) => this.environment.agent(name)!)
    let activityTargets: AgentlineDispatchTargetActivity[]
    try {
      activityTargets = agents.map((agent) =>
        agent.sessionID
          ? {
              agentID: agent.id,
              name: agent.name,
              submission: { status: "submitting" },
              destination: {
                kind: "opencode",
                sessionID: agent.sessionID,
                messageID: this.host.createMessageID(),
              },
            }
          : {
              agentID: agent.id,
              name: agent.name,
              submission: { status: "submitted" },
              destination: { kind: "local" },
              receipt: { kind: "local" },
            },
      )
    } catch (error) {
      await this.report(
        "error",
        "error",
        `Failed to prepare instruction: ${messageFromError(error)}`,
      )
      return
    }

    const activityID = this.host.createActivityID("dispatch")
    this.environment.appendActivity({
      id: activityID,
      kind: "dispatch",
      message,
      targets: activityTargets,
      createdAt: this.host.now(),
    })

    const intentError = await this.persist()
    if (intentError) {
      for (const target of activityTargets) {
        if (target.submission.status !== "submitting") continue
        this.environment.updateDispatchSubmission(activityID, target.agentID, {
          status: "failed",
          error: "Agentline could not persist the dispatch before submission.",
        })
      }
      const summary = `Instruction was not sent to OpenCode because Agentline could not persist it: ${intentError}`
      this.appendSystem("error", summary)
      this.host.notify({ variant: "error", message: summary })
      this.emit()
      return
    }

    if (
      activityTargets.some(
        (target) => target.submission.status === "submitting",
      )
    ) {
      this.emit()
    }

    const attached = agents.flatMap((agent) => {
      const target = activityTargets.find(
        (candidate) => candidate.agentID === agent.id,
      )
      return target?.destination.kind === "opencode"
        ? [{ agent, destination: target.destination }]
        : []
    })
    const outcomes = await Promise.allSettled(
      attached.map(({ destination }) =>
        this.host.submitMessage({
          sessionID: destination.sessionID,
          messageID: destination.messageID,
          message,
        }),
      ),
    )

    outcomes.forEach((outcome, index) => {
      const request = attached[index]!
      if (outcome.status === "fulfilled") {
        this.environment.updateDispatchSubmission(
          activityID,
          request.agent.id,
          { status: "submitted" },
        )
        this.environment.recordDispatchReceipt(activityID, request.agent.id, {
          kind: "opencode",
        })
      } else {
        this.environment.updateDispatchSubmission(
          activityID,
          request.agent.id,
          {
            status: "failed",
            error: messageFromError(outcome.reason),
          },
        )
      }
    })

    const completed = this.environment
      .state()
      .activity.find((activity) => activity.id === activityID)
    const completedTargets =
      completed?.kind === "dispatch" ? completed.targets : []
    const submitted = completedTargets.filter(
      (target) => target.receipt !== undefined,
    ).length
    const failed = completedTargets.length - submitted

    const receiptError = await this.persist()
    if (receiptError) {
      this.host.notify({
        variant: "error",
        message: `Instruction results are in memory but were not persisted: ${receiptError}`,
      })
      this.emit()
      return
    }

    if (failed === 0) {
      this.host.notify({
        variant: "success",
        message: `Instruction submitted for ${submitted} agent${submitted === 1 ? "" : "s"}.`,
      })
      this.emit()
      return
    }

    const summary = `Instruction submitted for ${submitted} of ${targets.length} agents.`
    await this.report("error", submitted > 0 ? "warning" : "error", summary)
  }

  private readAgent(
    ref: AgentlineAgentRef,
    latestAssignment: string | undefined,
  ): AgentlineAgent {
    if (!ref.sessionID) {
      return {
        ref,
        status: this.attachingAgents.has(ref.id) ? "attaching" : "unattached",
        ...(latestAssignment ? { latestAssignment } : {}),
      }
    }

    const session =
      this.observedSessions.get(ref.sessionID) ??
      this.host.session(ref.sessionID)
    if (!session) {
      return {
        ref,
        status: "unavailable",
        ...(latestAssignment ? { latestAssignment } : {}),
      }
    }

    const attention =
      this.sessionErrors.get(ref.sessionID) ??
      attentionFromHost(this.host, ref.sessionID)
    return {
      ref,
      title: session.title,
      directory: session.location.directory,
      status:
        this.observedStatuses.get(ref.sessionID)?.type ??
        this.host.sessionStatus(ref.sessionID)?.type ??
        "idle",
      ...(latestAssignment ? { latestAssignment } : {}),
      ...(attention ? { attention } : {}),
      updatedAt: session.time.updated,
    }
  }

  private async describeAgent(
    name: AgentlineAgentRef["name"],
    inlineDescription: string | undefined,
  ): Promise<void> {
    const agent = this.environment.agent(name)
    if (!agent) {
      await this.report("error", "error", `Unknown agent @${name}.`)
      return
    }

    const input =
      inlineDescription ?? (await this.host.promptAgentDescription(agent))
    if (input === undefined) return

    const description = input.trim() || undefined
    if (description === agent.description) return

    this.environment.setDescription(agent.id, description)
    const message = description
      ? `Updated description for @${agent.name}.`
      : `Cleared description for @${agent.name}.`
    this.appendSystem("success", message)
    const persistenceError = await this.persist()
    if (persistenceError) {
      this.host.notify({
        variant: "error",
        message: `${message.slice(0, -1)} in memory, but failed to persist it: ${persistenceError}`,
      })
    } else {
      this.host.notify({ variant: "success", message })
    }
    this.emit()
  }

  private async unsupported(feature: string): Promise<void> {
    await this.report("error", "error", `${feature} is not implemented yet.`)
  }

  private async recordObservedSubmission(
    observation: AgentlineSubmissionObservation,
  ): Promise<void> {
    if (
      observation.type === "session.input.admitted" &&
      (observation.data.input.type !== "user" ||
        observation.data.input.delivery !== "queue")
    ) {
      return
    }

    const sessionID = observation.data.sessionID
    const messageID = observation.data.inputID
    const matches = (target: AgentlineDispatchTargetActivity) =>
      target.destination.kind === "opencode" &&
      target.destination.messageID === messageID &&
      target.destination.sessionID === sessionID
    const activity = this.environment
      .state()
      .activity.toReversed()
      .find(
        (candidate) =>
          candidate.kind === "dispatch" && candidate.targets.some(matches),
      )
    if (!activity || activity.kind !== "dispatch") {
      return
    }

    const target = activity.targets.find(matches)
    if (!target || target.receipt?.kind === "opencode") {
      return
    }

    this.environment.recordDispatchReceipt(activity.id, target.agentID, {
      kind: "opencode",
    })
    const persistenceError = await this.persist()
    if (persistenceError) {
      this.host.notify({
        variant: "error",
        message: `Observed OpenCode dispatch receipt but failed to persist it: ${persistenceError}`,
      })
    }
  }

  /**
   * Events are live corroboration, not the only recovery source. On startup,
   * ask OpenCode for every exact unreceipted message ID. This repairs a request
   * that reached OpenCode before Agentline crashed or observed a transport
   * failure, without guessing from session status or message order.
   */
  private async reconcileStoredSubmissions(): Promise<void> {
    const state = this.environment.state()
    const candidates = state.activity.flatMap((activity) =>
      activity.kind === "dispatch"
        ? activity.targets.flatMap((target) => {
            if (target.destination.kind !== "opencode") return []
            if (target.receipt?.kind === "opencode") {
              return []
            }
            return [
              {
                activityID: activity.id,
                agentID: target.agentID,
                destination: target.destination,
              },
            ]
          })
        : [],
    )

    const results = await Promise.allSettled(
      candidates.map(async (candidate) => ({
        candidate,
        submission: await this.host.loadSubmission(
          candidate.destination.sessionID,
          candidate.destination.messageID,
        ),
      })),
    )

    let changed = false
    for (const result of results) {
      if (result.status !== "fulfilled") continue
      const { candidate, submission } = result.value
      if (!submission || submission.type !== "user") continue
      if (submission.id !== candidate.destination.messageID) continue
      if ("delivery" in submission && submission.delivery !== "queue") continue

      this.environment.recordDispatchReceipt(
        candidate.activityID,
        candidate.agentID,
        { kind: "opencode" },
      )
      changed = true
    }

    if (!changed) return
    const persistenceError = await this.persist()
    if (persistenceError) {
      this.host.notify({
        variant: "error",
        message: `Recovered OpenCode dispatch receipts but failed to persist them: ${persistenceError}`,
      })
    }
  }

  private async report(
    level: AgentlineSystemActivity["level"],
    variant: AgentlineNotificationVariant,
    message: string,
  ): Promise<void> {
    this.appendSystem(level, message)
    const persistenceError = await this.persist()
    if (persistenceError) {
      this.host.notify({
        variant: "error",
        message: `Agentline could not persist its activity: ${persistenceError}`,
      })
    }
    this.host.notify({ variant, message })
    this.emit()
  }

  private appendSystem(
    level: AgentlineSystemActivity["level"],
    message: string,
  ): void {
    this.environment.appendActivity({
      id: this.host.createActivityID("system"),
      kind: "system",
      level,
      message,
      createdAt: this.host.now(),
    })
  }

  private async persist(): Promise<string | undefined> {
    try {
      await this.host.writeState(this.environment.state())
      this.persistenceDirty = false
      return undefined
    } catch (error) {
      this.persistenceDirty = true
      return messageFromError(error)
    }
  }

  private resetTransientState(): void {
    this.currentFocus = undefined
    this.attachingAgents.clear()
    this.persistenceDirty = false
    this.sessionErrors.clear()
    this.observedSessions.clear()
    this.observedStatuses.clear()
    this.observedResponses.clear()
    this.activeResponseBySession.clear()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

function latestAssignmentsByAgent(
  activity: readonly AgentlineActivity[],
): ReadonlyMap<AgentlineAgentID, string> {
  const latest = new Map<AgentlineAgentID, string>()
  for (const item of activity) {
    if (item.kind !== "dispatch") continue
    for (const target of item.targets) {
      latest.set(target.agentID, item.message)
    }
  }
  return latest
}

function attentionFromHost(
  host: AgentlineHost,
  sessionID: SessionInfo["id"],
): AgentlineAttention | undefined {
  const permissions = host.permissions(sessionID)
  if (permissions.length > 0) {
    const first = permissions[0]
    return {
      kind: "permission",
      requests: permissions,
      summary:
        permissions.length === 1
          ? `Permission requested: ${first?.action ?? "unknown"}`
          : `${permissions.length} permission requests`,
    }
  }

  const forms = host.forms(sessionID)
  if (forms.length > 0) {
    const first = forms[0]?.title
    return {
      kind: "form",
      requests: forms,
      summary:
        forms.length === 1 && first ? first : `${forms.length} input forms`,
    }
  }
}

function observationSessionID(
  observation: AgentlineOpenCodeObservation,
): SessionInfo["id"] | undefined {
  return observation.type === "form.created"
    ? observation.data.form.sessionID
    : observation.data.sessionID
}

function isSubmissionObservation(
  observation: AgentlineOpenCodeObservation,
): observation is AgentlineSubmissionObservation {
  return (
    observation.type === "session.input.admitted" ||
    observation.type === "session.input.queued" ||
    observation.type === "session.input.steered" ||
    observation.type === "session.input.promoted" ||
    observation.type === "session.input.cancelled"
  )
}

function nameFromReference(
  reference: AgentReference,
): AgentlineAgentRef["name"] {
  return reference.slice(1)
}

function referenceFromName(name: AgentlineAgentRef["name"]): AgentReference {
  return `@${name}` as AgentReference
}

function parentAgentName(
  name: AgentlineAgentRef["name"],
): AgentlineAgentRef["name"] | undefined {
  const separator = name.indexOf("/")
  return separator === -1 ? undefined : name.slice(0, separator)
}
