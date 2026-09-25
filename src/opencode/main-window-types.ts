import type { AgentlineResponse } from "../core/responses"
import type { AgentlineDispatchActivity } from "../core/types"

export type AgentlineResponseDisplayMode = "native" | "last-message"

export type AgentlineResponsePresentation =
  | Readonly<{ kind: "revealing" }>
  | Readonly<{ kind: "truncated"; previewText: string }>
  | Readonly<{ kind: "full" }>

export type AgentlineResponseFeedItem = Readonly<{
  responseID: AgentlineResponse["id"]
  presentation: AgentlineResponsePresentation
}>

export type AgentlineResponsePreviewReader = (
  responseID: AgentlineResponse["id"],
) => string

export type AgentlineMainWindowState = Readonly<{
  items: readonly AgentlineResponseFeedItem[]
  followingTail: boolean
  responseDisplay: AgentlineResponseDisplayMode
}>

/** Ephemeral UI memory that survives plugin-route unmounts. */
export type AgentlineMainWindowMemory = Readonly<{
  read(): AgentlineMainWindowState
  write(state: AgentlineMainWindowState): void
}>

export type AgentlineResponseFeedItemView = Readonly<{
  response: AgentlineResponse
  presentation: AgentlineResponsePresentation
}>

export type OpenCodeResponseContentProps = Readonly<{
  source: AgentlineResponse["source"]
  displayMode: AgentlineResponseDisplayMode
}>

export type AgentlineSidebarItem =
  | Readonly<{
      kind: "dispatch"
      activity: AgentlineDispatchActivity
    }>
  | Readonly<{
      kind: "response"
      response: AgentlineResponse
    }>

export type AgentlineSidebarLog = readonly AgentlineSidebarItem[]
