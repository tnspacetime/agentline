/** @jsxImportSource @opentui/solid */

import type {
  SessionMessageAssistant,
  SessionMessageAssistantReasoning,
  SessionMessageAssistantText,
  SessionMessageAssistantTool,
  SessionMessageInfo,
} from "@opencode-ai/client"
import { For, Match, Show, Switch, createMemo, type Accessor } from "solid-js"
import type { OpenCodeResponseContentProps } from "./main-window-types"
import {
  explorationPartRefs,
  reasoningContent,
  toolActivityLabel,
} from "./response-row-utils"
import { filterResponseRows, selectResponseRows } from "./response-rows"
import { useOpenCodeSessionRowSources } from "./session-row-sources"
import { resolvePart, type PartRef, type SessionRow } from "./session-rows"

type AssistantPart = SessionMessageAssistant["content"][number]
type MessageRow = Extract<SessionRow, { type: "message" }>
type PartRow = Extract<SessionRow, { type: "part" }>
type ReasoningRow = Extract<
  SessionRow,
  { type: "group"; kind: "reasoning" }
>
type ExplorationRow = Extract<
  SessionRow,
  { type: "group"; kind: "exploration" }
>
type FooterRow = Extract<SessionRow, { type: "assistant-footer" }>

/** Select and minimally render one exact response from its shared row source. */
export function OpenCodeResponseContent(
  props: OpenCodeResponseContentProps,
) {
  const sources = useOpenCodeSessionRowSources()
  const source = () => sources.get(props.source.sessionID)
  const selectedRows = createMemo(() => {
    const current = source()
    if (!current) return undefined
    return selectResponseRows(
      current.rows,
      props.source.inputID,
      current.promotedInputIDs(),
    )
  })
  const rows = createMemo(() => {
    const selected = selectedRows()
    if (!selected) return undefined
    return filterResponseRows(selected, props.displayMode, (messageID) =>
      sources.context.data.session.message.get(
        props.source.sessionID,
        messageID,
      ),
    )
  })

  return (
    <Switch>
      <Match when={rows() === undefined}>
        <text fg={sources.context.theme.text.subdued}>
          Synchronizing OpenCode response…
        </text>
      </Match>
      <Match when={rows()?.length === 0}>
        <text fg={sources.context.theme.text.subdued}>
          Waiting for OpenCode output…
        </text>
      </Match>
      <Match when={true}>
        <For each={rows() ?? []}>
          {(row) => (
            <OpenCodeResponseRow
              sessionID={props.source.sessionID}
              row={row}
            />
          )}
        </For>
      </Match>
    </Switch>
  )
}

function OpenCodeResponseRow(props: { sessionID: string; row: SessionRow }) {
  return (
    <box marginTop={1} flexShrink={0}>
      <Switch>
        <Match when={props.row.type === "message"}>
          <OpenCodeMessageRow
            sessionID={props.sessionID}
            row={props.row as MessageRow}
          />
        </Match>
        <Match when={props.row.type === "compaction-queued"}>
          <OpenCodeNotice text="Compaction queued" />
        </Match>
        <Match when={props.row.type === "part"}>
          <OpenCodePart
            sessionID={props.sessionID}
            partRef={(props.row as PartRow).ref}
          />
        </Match>
        <Match
          when={props.row.type === "group" && props.row.kind === "reasoning"}
        >
          <OpenCodeReasoningGroup
            sessionID={props.sessionID}
            row={props.row as ReasoningRow}
          />
        </Match>
        <Match
          when={
            props.row.type === "group" && props.row.kind === "exploration"
          }
        >
          <OpenCodeExplorationGroup
            sessionID={props.sessionID}
            row={props.row as ExplorationRow}
          />
        </Match>
        <Match when={props.row.type === "assistant-footer"}>
          <OpenCodeAssistantFooter
            sessionID={props.sessionID}
            row={props.row as FooterRow}
          />
        </Match>
      </Switch>
    </box>
  )
}

function OpenCodePart(props: { sessionID: string; partRef: PartRef }) {
  const sources = useOpenCodeSessionRowSources()
  const part = createMemo(() =>
    readAssistantPart(sources, props.sessionID, props.partRef),
  )

  return (
    <Show when={part()}>
      {(item: Accessor<AssistantPart>) => (
        <Switch>
          <Match when={item().type === "text"}>
            <OpenCodeTextPart
              part={item() as SessionMessageAssistantText}
            />
          </Match>
          <Match when={item().type === "reasoning"}>
            <OpenCodeReasoningPart
              part={item() as SessionMessageAssistantReasoning}
              heading
            />
          </Match>
          <Match when={item().type === "tool"}>
            <OpenCodeToolPart
              part={item() as SessionMessageAssistantTool}
            />
          </Match>
        </Switch>
      )}
    </Show>
  )
}

function OpenCodeTextPart(props: { part: SessionMessageAssistantText }) {
  const sources = useOpenCodeSessionRowSources()
  return (
    <Show when={props.part.text.trim()}>
      <box paddingLeft={3} flexShrink={0}>
        <markdown
          syntaxStyle={sources.syntax()}
          streaming={true}
          internalBlockMode="top-level"
          content={props.part.text.trim()}
          tableOptions={{ style: "grid" }}
          conceal={true}
          fg={sources.context.theme.markdown.text}
          bg={sources.context.theme.background.default}
        />
      </box>
    </Show>
  )
}

function OpenCodeReasoningGroup(props: {
  sessionID: string
  row: ReasoningRow
}) {
  const sources = useOpenCodeSessionRowSources()
  return (
    <box paddingLeft={3} flexDirection="column" flexShrink={0}>
      <text fg={sources.context.theme.text.subdued}>
        {props.row.completed ? "Thought" : "Thinking…"}
      </text>
      <For each={props.row.refs}>
        {(partRef) => (
          <OpenCodeReasoningRef
            sessionID={props.sessionID}
            partRef={partRef}
          />
        )}
      </For>
    </box>
  )
}

function OpenCodeReasoningRef(props: {
  sessionID: string
  partRef: PartRef
}) {
  const sources = useOpenCodeSessionRowSources()
  const part = createMemo(() =>
    readAssistantPart(sources, props.sessionID, props.partRef),
  )
  const reasoning = createMemo(() => {
    const current = part()
    return current?.type === "reasoning" ? current : undefined
  })

  return (
    <Show when={reasoning()}>
      {(item: Accessor<SessionMessageAssistantReasoning>) => (
        <OpenCodeReasoningPart part={item()} />
      )}
    </Show>
  )
}

function OpenCodeReasoningPart(props: {
  part: SessionMessageAssistantReasoning
  heading?: boolean
}) {
  const sources = useOpenCodeSessionRowSources()
  const content = createMemo(() => reasoningContent(props.part))
  return (
    <Show when={content()}>
      <box paddingLeft={props.heading ? 3 : 0} flexDirection="column">
        <Show when={props.heading}>
          <text fg={sources.context.theme.text.subdued}>Thinking…</text>
        </Show>
        <markdown
          syntaxStyle={sources.syntax()}
          streaming={true}
          internalBlockMode="top-level"
          content={content()}
          tableOptions={{ style: "grid" }}
          conceal={true}
          fg={sources.context.theme.text.subdued}
          bg={sources.context.theme.background.default}
        />
      </box>
    </Show>
  )
}

function OpenCodeExplorationGroup(props: {
  sessionID: string
  row: ExplorationRow
}) {
  const sources = useOpenCodeSessionRowSources()
  const refs = createMemo(() => explorationPartRefs(props.row))
  return (
    <box flexDirection="column" flexShrink={0}>
      <text fg={sources.context.theme.text.subdued}>
        {props.row.completed ? "Explored" : "Exploring…"}
      </text>
      <For each={refs()}>
        {(partRef) => (
          <OpenCodeToolRef
            sessionID={props.sessionID}
            partRef={partRef}
          />
        )}
      </For>
    </box>
  )
}

function OpenCodeToolRef(props: { sessionID: string; partRef: PartRef }) {
  const sources = useOpenCodeSessionRowSources()
  const part = createMemo(() =>
    readAssistantPart(sources, props.sessionID, props.partRef),
  )
  const tool = createMemo(() => {
    const current = part()
    return current?.type === "tool" ? current : undefined
  })

  return (
    <Show when={tool()}>
      {(item: Accessor<SessionMessageAssistantTool>) => (
        <OpenCodeToolPart part={item()} />
      )}
    </Show>
  )
}

function OpenCodeToolPart(props: { part: SessionMessageAssistantTool }) {
  const sources = useOpenCodeSessionRowSources()
  const state = () => props.part.state.status
  const error = () =>
    props.part.state.status === "error" ? props.part.state.error.message : ""
  return (
    <box paddingLeft={3} flexDirection="column" flexShrink={0}>
      <text fg={toolStatusColor(sources.context, state())}>
        {toolActivityLabel(props.part)}
      </text>
      <Show when={error()}>
        <text fg={sources.context.theme.text.feedback.error.default}>
          {error()}
        </text>
      </Show>
    </box>
  )
}

function OpenCodeMessageRow(props: { sessionID: string; row: MessageRow }) {
  const sources = useOpenCodeSessionRowSources()
  const message = createMemo(() =>
    sources.context.data.session.message.get(
      props.sessionID,
      props.row.messageID,
    ),
  )
  const label = createMemo(() => messageLabel(message()))
  return (
    <Show when={label()}>
      {(value: Accessor<string>) => <OpenCodeNotice text={value()} />}
    </Show>
  )
}

function OpenCodeAssistantFooter(props: {
  sessionID: string
  row: FooterRow
}) {
  const sources = useOpenCodeSessionRowSources()
  const message = createMemo(() =>
    sources.context.data.session.message.get(
      props.sessionID,
      props.row.messageID,
    ),
  )
  const detail = createMemo(() => {
    const current = message()
    if (current?.type !== "assistant") return ""
    if (current.retry) {
      return `Retry attempt ${current.retry.attempt}: ${current.retry.error.message}`
    }
    if (current.error?.message === "Step interrupted") return ""
    return current.error?.message ?? ""
  })
  return (
    <Show when={detail()}>
      {(value: Accessor<string>) => <OpenCodeNotice text={value()} />}
    </Show>
  )
}

function OpenCodeNotice(props: { text: string }) {
  const sources = useOpenCodeSessionRowSources()
  return (
    <text fg={sources.context.theme.text.subdued} paddingLeft={3}>
      {props.text}
    </text>
  )
}

function readAssistantPart(
  sources: ReturnType<typeof useOpenCodeSessionRowSources>,
  sessionID: string,
  partRef: PartRef,
): AssistantPart | undefined {
  const message = sources.context.data.session.message.get(
    sessionID,
    partRef.messageID,
  )
  if (message?.type !== "assistant") return undefined
  return resolvePart(message, partRef.partID)
}

function messageLabel(message: SessionMessageInfo | undefined): string {
  if (!message) return ""
  switch (message.type) {
    case "user":
    case "system":
      return message.text
    case "synthetic":
      return message.description?.trim() || message.text
    case "skill":
      return `Skill ${message.name}`
    case "shell":
      return `shell ${message.command} · ${message.status}`
    case "agent-switched":
      return `Agent switched to ${message.agent}`
    case "model-switched":
      return `Model switched to ${message.model.providerID}/${message.model.id}`
    case "compaction":
      return `Compaction · ${message.status}`
    case "assistant":
      return ""
  }
}

function toolStatusColor(
  context: ReturnType<typeof useOpenCodeSessionRowSources>["context"],
  status: SessionMessageAssistantTool["state"]["status"],
) {
  if (status === "error") return context.theme.text.feedback.error.default
  if (status === "completed")
    return context.theme.text.feedback.success.default
  return context.theme.text.action.primary.default
}
