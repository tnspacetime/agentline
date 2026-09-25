import type {
  SessionInfo,
  SessionMessageUser,
  SessionPendingUser,
} from "@opencode-ai/client"
import type { Context } from "@opencode-ai/plugin/tui/context"
import { randomUUID } from "node:crypto"
import { stat } from "node:fs/promises"
import path from "node:path"
import type { AgentlineHost } from "../core/host"
import type { AgentlineAgentID } from "../core/types"

const ID_RANDOM_CHARS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const MESSAGE_ID_RANDOM_LENGTH = 14
let lastMessageIDTimestamp = 0
let messageIDCounter = 0

type AgentlineStorage = {
  state?: unknown
}

/** Bind the Agentline interpreter host contract to OpenCode's v2 TUI API. */
export function createOpenCodeHost(
  api: Context,
  stateKey: string,
): AgentlineHost {
  const sessionCache = new Map<SessionInfo["id"], SessionInfo>()
  const [storage, updateStorage] = api.storage.store<AgentlineStorage>(
    stateKey,
    { initial: {} },
  )

  return {
    async readState() {
      return storage.state
    },

    async writeState(state) {
      await updateStorage((draft) => {
        draft.state = structuredClone(state)
      })
    },

    createAgentID() {
      return `agt_${randomUUID().replaceAll("-", "")}` as AgentlineAgentID
    },

    promptAgentDescription(agent) {
      return api.ui.dialog.prompt({
        title: `Describe @${agent.name}`,
        description:
          "Set its Agentline role or responsibility. Submit an empty value to clear it.",
        placeholder: "Owns authentication and backend APIs",
        value: agent.description ?? "",
      })
    },

    async resolveDirectory(inputDirectory) {
      const base =
        api.location?.directory ?? api.data.location.default().directory
      const directory = path.resolve(base, inputDirectory)
      const info = await stat(directory)
      if (!info.isDirectory()) {
        throw new Error(`Not a directory: ${inputDirectory}`)
      }
      return directory
    },

    async createSession({ name, directory }) {
      const session = await api.client.session.create({
        title: `Agentline: @${name}`,
        location: { directory },
      })
      sessionCache.set(session.id, session)
      return session
    },

    async loadSession(sessionID) {
      try {
        const session = await api.client.session.get({ sessionID })
        sessionCache.set(sessionID, session)
        return session
      } catch (error) {
        sessionCache.delete(sessionID)
        throw error
      }
    },

    session(sessionID) {
      const synchronized = api.data.session.get(sessionID)
      if (synchronized) sessionCache.set(sessionID, synchronized)
      return synchronized ?? sessionCache.get(sessionID)
    },

    sessionStatus(sessionID) {
      return api.data.session.status(sessionID) === "running"
        ? { type: "busy" }
        : { type: "idle" }
    },

    permissions(sessionID) {
      return api.data.session.permission.list(sessionID) ?? []
    },

    forms(sessionID) {
      return api.data.session.form.list(sessionID) ?? []
    },

    async loadSubmission(sessionID, messageID) {
      const pending = api.data.session.pending
        .list(sessionID)
        .find(
          (input): input is SessionPendingUser =>
            input.id === messageID && input.type === "user",
        )
      if (pending) return pending

      const synchronized = api.data.session.message.get(sessionID, messageID)
      if (synchronized?.type === "user") return synchronized

      const storedPending = await api.client.session.pending
        .list({ sessionID })
        .then((inputs) =>
          inputs.find(
            (input): input is SessionPendingUser =>
              input.id === messageID && input.type === "user",
          ),
        )
        .catch(() => undefined)
      if (storedPending) return storedPending

      return api.client.session
        .message({ sessionID, messageID })
        .then((message): SessionMessageUser | undefined =>
          message.type === "user" ? message : undefined,
        )
        .catch(() => undefined)
    },

    createMessageID() {
      return createOpenCodeMessageID()
    },

    async submitMessage({ sessionID, messageID, message }) {
      const admitted = await api.client.session.prompt({
        sessionID,
        id: messageID,
        text: message,
        delivery: "queue",
      })
      if (admitted.id !== messageID) {
        throw new Error("OpenCode admitted a different message")
      }
      if (admitted.sessionID !== sessionID) {
        throw new Error("OpenCode admitted the message to another session")
      }
      if (admitted.type !== "user" || admitted.delivery !== "queue") {
        throw new Error("OpenCode did not use queued user-message delivery")
      }
      return admitted
    },

    openSession(sessionID) {
      if (api.ui.tabs.open(sessionID)) return
      api.ui.router.navigate({ type: "session", sessionID })
    },

    createActivityID(kind) {
      return `${kind}_${crypto.randomUUID().replaceAll("-", "")}`
    },

    now() {
      return Date.now()
    },

    notify(notification) {
      api.ui.toast.show({
        ...notification,
        title: "Agentline",
        duration: 3000,
      })
    },
  }
}

/**
 * Reproduce OpenCode's public `msg_` identifier shape for idempotent admission.
 * The v2 queue orders inputs by its durable admission sequence rather than by
 * this ID; preassignment lets Agentline retry and reconcile one exact input.
 */
function createOpenCodeMessageID(): SessionPendingUser["id"] {
  const timestamp = Date.now()
  if (timestamp !== lastMessageIDTimestamp) {
    lastMessageIDTimestamp = timestamp
    messageIDCounter = 0
  }
  messageIDCounter += 1

  const encoded = BigInt(timestamp) * 0x1000n + BigInt(messageIDCounter)
  let time = ""
  for (let shift = 40n; shift >= 0n; shift -= 8n) {
    time += Number((encoded >> shift) & 0xffn)
      .toString(16)
      .padStart(2, "0")
  }

  const bytes = crypto.getRandomValues(new Uint8Array(MESSAGE_ID_RANDOM_LENGTH))
  let random = ""
  for (const byte of bytes) {
    random += ID_RANDOM_CHARS[byte % ID_RANDOM_CHARS.length]
  }

  return `msg_${time}${random}`
}
