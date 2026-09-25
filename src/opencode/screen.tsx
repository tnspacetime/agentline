/** @jsxImportSource @opentui/solid */

import type { Context } from "@opencode-ai/plugin/tui/context"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js"
import { messageFromError } from "../core/errors"
import type {
  AgentlineInterpreter,
  AgentlineInterpreterSnapshot,
} from "../core/interpreter"
import type { AgentlineResponse } from "../core/responses"
import type { AgentlineAgentStatus } from "../core/types"
import { AgentlineInput } from "./input"
import { agentlineLayout } from "./layout"
import { commandName } from "./constants"
import { OpenCodeResponseContent } from "./response-content"
import {
  activateResponseFeed,
  expandResponse,
  resolveResponseViews,
  responsePresentation,
  setFollowingTail,
  sidebarLog,
  skipToNextResponse,
  skipToResponse,
  synchronizeResponseFeed,
} from "./response-feed"
import type {
  AgentlineMainWindowMemory,
  AgentlineMainWindowState,
  AgentlineResponseDisplayMode,
  AgentlineResponseFeedItemView,
} from "./main-window-types"
import { OpenCodeSessionRowSourcesProvider } from "./session-row-sources"
import { AgentlineSidebar } from "./sidebar"

export function AgentlineScreen(props: {
  context: Context
  interpreter: AgentlineInterpreter
  mainWindow: AgentlineMainWindowMemory
}) {
  const dimensions = useTerminalDimensions()
  const layout = createMemo(() => agentlineLayout(dimensions().width))
  const [revision, setRevision] = createSignal(0)
  const [inputGeneration, setInputGeneration] = createSignal(0)
  const initialFeed = activateResponseFeed(
    props.mainWindow.read(),
    props.interpreter.snapshot().responses,
  )
  props.mainWindow.write(initialFeed)
  const [feed, setFeedSignal] = createSignal(initialFeed)
  let scroll: ScrollBoxRenderable | undefined

  const setFeed = (
    update: (current: AgentlineMainWindowState) => AgentlineMainWindowState,
  ) => {
    setFeedSignal((current) => {
      const next = update(current)
      props.mainWindow.write(next)
      return next
    })
  }

  onMount(() => {
    const unsubscribe = props.interpreter.subscribe(() => {
      setRevision((value) => value + 1)
    })
    onCleanup(unsubscribe)
  })

  const state = createMemo(() => {
    revision()
    return props.interpreter.snapshot()
  })
  const responses = createMemo(() => state().responses)
  const responseViews = createMemo(() =>
    resolveResponseViews(feed(), responses()),
  )
  const activity = createMemo(() => sidebarLog(state().activity, responses()))
  const suggestionAgents = createMemo(() =>
    state().board.agents.map((agent) => ({
      name: agent.ref.name,
      status: agent.status,
    })),
  )

  createEffect(() => {
    const currentResponses = responses()
    setFeed((current) => synchronizeResponseFeed(current, currentResponses))
  })

  const submit = (value: string) => {
    setInputGeneration((generation) => generation + 1)
    void props.interpreter.execute(value)
  }

  const scrollToResponse = (responseID: AgentlineResponse["id"]) => {
    setTimeout(() => {
      scroll?.scrollChildIntoView(responseRenderableID(responseID))
    }, 0)
  }

  const selectResponse = (responseID: AgentlineResponse["id"]) => {
    const presentation = responsePresentation(feed(), responseID)

    // Re-selecting the live response must not disturb its stream or scroll.
    if (presentation?.kind === "revealing") return

    setFeed((current) =>
      presentation?.kind === "truncated"
        ? expandResponse(current, responseID)
        : presentation
          ? current
          : skipToResponse(current, responses(), responseID, noPreviewText),
    )
    scrollToResponse(responseID)
  }

  const nextResponse = () => {
    const before = new Set(feed().items.map((item) => item.responseID))
    const next = responses().find((response) => !before.has(response.id))
    if (!next) return
    setFeed((current) =>
      skipToNextResponse(current, responses(), noPreviewText),
    )
    scrollToResponse(next.id)
  }

  const returnToTail = () => {
    setFeed((current) => setFollowingTail(current, true))
    setTimeout(() => scroll?.scrollTo(scroll.scrollHeight), 0)
  }

  const updateFollowingTail = () => {
    setTimeout(() => {
      if (!scroll || scroll.isDestroyed) return
      const atBottom =
        scroll.scrollTop + scroll.viewport.height >= scroll.scrollHeight - 1
      setFeed((current) => setFollowingTail(current, atBottom))
    }, 0)
  }

  props.context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: commandName.nextResponse,
        title: "Next Agentline response",
        description: "Skip to the next waiting agent response",
        group: "Agentline",
        palette: true,
        run: nextResponse,
      },
      {
        id: commandName.responseTail,
        title: "Agentline live response tail",
        description: "Return to the live end of the response feed",
        group: "Agentline",
        palette: true,
        run: returnToTail,
      },
    ],
  }))

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      backgroundColor={props.context.theme.background.default}
      flexDirection="row"
      flexGrow={1}
      minHeight={0}
    >
      <OpenCodeSessionRowSourcesProvider
        context={props.context}
        responseViews={responseViews()}
      >
        <AgentlineDashboard
          context={props.context}
          state={state()}
          responseViews={responseViews()}
          responseDisplay={feed().responseDisplay}
          followingTail={feed().followingTail}
          inputGeneration={inputGeneration()}
          suggestionAgents={suggestionAgents()}
          onSubmit={submit}
          onExpand={selectResponse}
          onReturnToTail={returnToTail}
          onScroll={(value) => {
            scroll = value
          }}
          onMouseScroll={updateFollowingTail}
        />
      </OpenCodeSessionRowSourcesProvider>
      <Show when={layout().sidebarVisible}>
        <AgentlineSidebar
          context={props.context}
          items={activity()}
          feed={feed()}
          onSelectResponse={selectResponse}
        />
      </Show>
    </box>
  )
}

function AgentlineDashboard(props: {
  context: Context
  state: AgentlineInterpreterSnapshot
  responseViews: readonly AgentlineResponseFeedItemView[]
  responseDisplay: AgentlineResponseDisplayMode
  followingTail: boolean
  inputGeneration: number
  suggestionAgents: ReadonlyArray<{
    name: string
    status: AgentlineAgentStatus
  }>
  onSubmit(value: string): void
  onExpand(responseID: AgentlineResponse["id"]): void
  onReturnToTail(): void
  onScroll(value: ScrollBoxRenderable): void
  onMouseScroll(): void
}) {
  return (
    <box
      backgroundColor={props.context.theme.background.default}
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      gap={1}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg={props.context.theme.text.default}>
          <b>Agentline</b>
          <span style={{ fg: props.context.theme.text.subdued }}>
            {" "}
            agent responses
          </span>
        </text>
        <text fg={props.context.theme.text.subdued}>/agentline</text>
      </box>

      <Show when={props.state.persistenceDirty}>
        <text fg={props.context.theme.text.feedback.warning.default}>
          Agentline has changes that are not yet persisted.
        </text>
      </Show>

      <scrollbox
        ref={props.onScroll}
        flexGrow={1}
        minHeight={0}
        stickyScroll={props.followingTail}
        stickyStart="bottom"
        onMouseScroll={props.onMouseScroll}
        viewportOptions={{ paddingRight: 1 }}
        verticalScrollbarOptions={{
          paddingLeft: 1,
          visible: true,
          trackOptions: {
            backgroundColor: props.context.theme.background.surface.offset,
            foregroundColor: props.context.theme.border.default,
          },
        }}
      >
        <Show
          when={props.responseViews.length > 0}
          fallback={
            <box paddingTop={1}>
              <text fg={props.context.theme.text.subdued}>
                Agent responses will appear here. Send work with @name message.
              </text>
            </box>
          }
        >
          <For each={props.responseViews}>
            {(view) => (
              <AgentlineResponseBlock
                context={props.context}
                view={view}
                responseDisplay={props.responseDisplay}
                onExpand={() => props.onExpand(view.response.id)}
              />
            )}
          </For>
        </Show>
      </scrollbox>

      <Show when={!props.followingTail}>
        <box onMouseUp={props.onReturnToTail} justifyContent="center">
          <text fg={props.context.theme.text.action.primary.default}>
            New response content below · return to live tail
          </text>
        </box>
      </Show>

      <For each={[props.inputGeneration]}>
        {() => (
          <AgentlineInput
            context={props.context}
            agents={props.suggestionAgents}
            onSubmit={props.onSubmit}
          />
        )}
      </For>
    </box>
  )
}

function AgentlineResponseBlock(props: {
  context: Context
  view: AgentlineResponseFeedItemView
  responseDisplay: AgentlineResponseDisplayMode
  onExpand(): void
}) {
  const truncated = () => props.view.presentation.kind === "truncated"

  return (
    <box
      id={responseRenderableID(props.view.response.id)}
      border
      borderColor={responseBorderColor(props.context, props.view)}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={1}
      marginBottom={1}
      gap={1}
      onMouseUp={() => {
        if (truncated()) props.onExpand()
      }}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg={props.context.theme.text.default}>
          <b>@{props.view.response.agent.name}</b>
        </text>
        <text fg={responseStatusColor(props.context, props.view)}>
          {responseStatus(props.view)}
        </text>
      </box>
      <Show
        when={props.view.presentation.kind !== "truncated"}
        fallback={
          <text fg={props.context.theme.text.default}>
            {truncatedResponseText(props.view)}
          </text>
        }
      >
        <OpenCodeResponseContent
          source={props.view.response.source}
          displayMode={props.responseDisplay}
        />
      </Show>
      <Show when={truncated()}>
        <text fg={props.context.theme.text.subdued}>Select to expand</text>
      </Show>
      <Show
        when={
          props.view.response.execution.kind === "failed" ||
          props.view.response.execution.kind === "interrupted"
        }
      >
        <text fg={props.context.theme.text.feedback.error.default}>
          {responseOutcome(props.view.response)}
        </text>
      </Show>
    </box>
  )
}

function truncatedResponseText(view: AgentlineResponseFeedItemView): string {
  if (view.presentation.kind !== "truncated") return ""
  return view.presentation.previewText
    ? `${view.presentation.previewText}\n...`
    : "..."
}

function responseOutcome(response: AgentlineResponse): string {
  switch (response.execution.kind) {
    case "failed":
      return `Failed: ${messageFromError(response.execution.error)}`
    case "interrupted":
      return `Interrupted: ${response.execution.reason}`
    default:
      return ""
  }
}

function responseStatus(view: AgentlineResponseFeedItemView): string {
  if (view.presentation.kind === "truncated") {
    return view.response.execution.kind === "running"
      ? "responding · truncated"
      : `${view.response.execution.kind} · truncated`
  }
  if (view.presentation.kind === "revealing") return "responding"
  return view.response.execution.kind
}

function responseStatusColor(
  context: Context,
  view: AgentlineResponseFeedItemView,
) {
  switch (view.response.execution.kind) {
    case "failed":
    case "interrupted":
      return context.theme.text.feedback.error.default
    case "succeeded":
      return context.theme.text.feedback.success.default
    case "running":
      return context.theme.text.action.primary.default
  }
}

function responseBorderColor(
  context: Context,
  view: AgentlineResponseFeedItemView,
) {
  return view.presentation.kind === "revealing"
    ? context.theme.text.action.primary.default
    : context.theme.border.default
}

function responseRenderableID(responseID: AgentlineResponse["id"]): string {
  return `agentline-response-${responseID}`
}

function noPreviewText(): string {
  return ""
}
