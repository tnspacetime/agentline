import type {
  SessionMessageInfo,
  SessionPendingUser,
} from "@opencode-ai/client"
import type { AgentlineResponseDisplayMode } from "./main-window-types"
import type { SessionRow } from "./session-rows"

/** Select the native OpenCode rows produced for one exact promoted input. */
export function selectResponseRows(
  rows: readonly SessionRow[],
  inputID: SessionPendingUser["id"],
  promotedInputIDs: ReadonlySet<SessionPendingUser["id"]>,
): readonly SessionRow[] | undefined {
  const start = rows.findIndex(
    (row) => row.type === "message" && row.messageID === inputID,
  )
  if (start === -1) return undefined

  const end = rows.findIndex(
    (row, index) =>
      index > start &&
      row.type === "message" &&
      promotedInputIDs.has(row.messageID),
  )
  return rows.slice(start + 1, end === -1 ? rows.length : end)
}

/** Apply Agentline's display choice without changing OpenCode's source rows. */
export function filterResponseRows(
  rows: readonly SessionRow[],
  displayMode: AgentlineResponseDisplayMode,
  message: (messageID: string) => SessionMessageInfo | undefined,
): readonly SessionRow[] {
  if (displayMode === "native") return rows

  const target = rows
    .flatMap(rowMessageIDs)
    .findLast((messageID) => message(messageID)?.type === "assistant")
  if (!target) return []

  return rows.flatMap((row): readonly SessionRow[] => {
    switch (row.type) {
      case "part":
        return row.ref.messageID === target ? [row] : []
      case "group": {
        const refs = row.refs.filter((ref) => ref.messageID === target)
        if (row.kind === "reasoning") {
          if (refs.length === 0) return []
          return refs.length === row.refs.length ? [row] : [{ ...row, refs }]
        }
        const pending = row.pending.filter((ref) => ref.messageID === target)
        if (refs.length === 0 && pending.length === 0) return []
        return refs.length === row.refs.length &&
          pending.length === row.pending.length
          ? [row]
          : [{ ...row, refs, pending }]
      }
      case "assistant-footer":
        return row.messageID === target ? [row] : []
      case "turn-usage":
        return row.messageIDs.includes(target)
          ? [{ ...row, messageIDs: [target] }]
          : []
      case "message":
        return row.messageID === target ? [row] : []
      case "compaction-queued":
        return []
    }
  })
}

function rowMessageIDs(row: SessionRow): readonly string[] {
  switch (row.type) {
    case "message":
      return [row.messageID]
    case "part":
      return [row.ref.messageID]
    case "group":
      return row.kind === "exploration"
        ? [...row.refs, ...row.pending].map((ref) => ref.messageID)
        : row.refs.map((ref) => ref.messageID)
    case "assistant-footer":
      return [row.messageID]
    case "turn-usage":
      return row.messageIDs
    case "compaction-queued":
      return []
  }
}
