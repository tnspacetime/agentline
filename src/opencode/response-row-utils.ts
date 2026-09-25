import type {
  SessionMessageAssistantReasoning,
  SessionMessageAssistantTool,
} from "@opencode-ai/client"
import type { PartRef, SessionRow } from "./session-rows"

/** Keep OpenCode's reasoning placeholder out of the visible fallback row. */
export function reasoningContent(
  part: SessionMessageAssistantReasoning,
): string {
  return part.text.replace("[REDACTED]", "").trim()
}

/** Minimal lifecycle label used until native tool renderers are adapted. */
export function toolActivityLabel(part: SessionMessageAssistantTool): string {
  return `${canonicalToolName(part.name)} · ${part.state.status}`
}

/** Preserve OpenCode's completed-then-pending order inside exploration rows. */
export function explorationPartRefs(
  row: Extract<SessionRow, { type: "group"; kind: "exploration" }>,
): readonly PartRef[] {
  return [...row.refs, ...row.pending]
}

function canonicalToolName(name: string): string {
  if (name === "bash") return "shell"
  if (name === "task") return "subagent"
  if (name === "apply_patch") return "patch"
  return name
}
