/** @jsxImportSource @opentui/solid */

import type {
  SessionMessageInfo,
  SessionPendingInfo,
} from "@opencode-ai/client"
import type { Context as OpenCodeContext } from "@opencode-ai/plugin/tui/context"
import type { SyntaxStyle } from "@opentui/core"
import {
  createContext,
  createMemo,
  mapArray,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js"
import type { AgentlineResponseFeedItemView } from "./main-window-types"
import { createOpenCodeMarkdownSyntax } from "./markdown"
import { createSessionRows, type SessionRow } from "./session-rows"

type OpenCodeSessionRowSource = Readonly<{
  sessionID: string
  rows: SessionRow[]
  promotedInputIDs: Accessor<ReadonlySet<string>>
}>

type OpenCodeSessionRowSources = Readonly<{
  context: OpenCodeContext
  syntax: Accessor<SyntaxStyle>
  get(sessionID: string): OpenCodeSessionRowSource | undefined
}>

const SessionRowSourcesContext = createContext<OpenCodeSessionRowSources>()

/** Own one OpenCode row subscription for each session needing native content. */
export function OpenCodeSessionRowSourcesProvider(
  props: ParentProps<{
    context: OpenCodeContext
    responseViews: readonly AgentlineResponseFeedItemView[]
  }>,
) {
  const syntax = createOpenCodeMarkdownSyntax(props.context)
  const sessionIDs = createMemo(() =>
    responseSessionIDsRequiringRows(props.responseViews),
  )
  const sources = mapArray(sessionIDs, (sessionID) => {
    const rows = createSessionRows(props.context, () => sessionID)
    const promotedInputIDs = createMemo(() =>
      promotedInputBoundaryIDs(
        props.context.data.session.message.list(sessionID),
        props.context.data.session.pending.list(sessionID),
      ),
    )
    return { sessionID, rows, promotedInputIDs }
  })
  const value: OpenCodeSessionRowSources = {
    context: props.context,
    syntax,
    get(sessionID) {
      return sources().find((source) => source.sessionID === sessionID)
    },
  }

  return (
    <SessionRowSourcesContext.Provider value={value}>
      {props.children}
    </SessionRowSourcesContext.Provider>
  )
}

export function useOpenCodeSessionRowSources(): OpenCodeSessionRowSources {
  const sources = useContext(SessionRowSourcesContext)
  if (!sources) {
    throw new Error(
      "OpenCode response content must be mounted inside its row-source provider",
    )
  }
  return sources
}

/** Preserve first feed appearance while deduplicating shared session sources. */
export function responseSessionIDsRequiringRows(
  responseViews: readonly AgentlineResponseFeedItemView[],
): readonly string[] {
  return [
    ...new Set(
      responseViews.flatMap((view) =>
        view.presentation.kind === "truncated"
          ? []
          : [view.response.source.sessionID],
      ),
    ),
  ]
}

/**
 * A synchronized user message becomes a response boundary only after OpenCode
 * removes it from the admitted/pending collection during promotion.
 */
export function promotedInputBoundaryIDs(
  messages: readonly SessionMessageInfo[],
  pending: readonly SessionPendingInfo[],
): ReadonlySet<string> {
  const pendingIDs = new Set(pending.map((item) => item.id))
  return new Set(
    messages.flatMap((message) =>
      message.type === "user" && !pendingIDs.has(message.id)
        ? [message.id]
        : [],
    ),
  )
}
