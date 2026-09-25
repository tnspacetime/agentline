/** @jsxImportSource @opentui/solid */

import type { Context } from "@opencode-ai/plugin/tui/context"
import { For, Show } from "solid-js"
import type { AgentlineResponse } from "../core/responses"
import type {
  AgentlineDispatchTargetActivity,
  AgentlineSubmissionStatus,
} from "../core/types"
import { AGENTLINE_SIDEBAR_WIDTH } from "./layout"
import type {
  AgentlineMainWindowState,
  AgentlineSidebarLog,
} from "./main-window-types"
import { responsePresentation } from "./response-feed"

export function AgentlineSidebar(props: {
  context: Context
  items: AgentlineSidebarLog
  feed: AgentlineMainWindowState
  onSelectResponse(responseID: AgentlineResponse["id"]): void
}) {
  return (
    <box
      backgroundColor={props.context.theme.background.surface.offset}
      width={AGENTLINE_SIDEBAR_WIDTH}
      height="100%"
      minHeight={0}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="column"
      flexShrink={0}
      gap={1}
    >
      <text fg={props.context.theme.text.default}>
        <b>Activity</b>
      </text>
      <scrollbox flexGrow={1} minHeight={0} stickyScroll stickyStart="bottom">
        <Show
          when={props.items.length > 0}
          fallback={
            <text fg={props.context.theme.text.subdued}>
              Dispatches and responses will appear here.
            </text>
          }
        >
          <For each={props.items}>
            {(item) =>
              item.kind === "dispatch" ? (
                <box flexDirection="column" marginBottom={1}>
                  <box flexDirection="row" justifyContent="space-between">
                    <text fg={props.context.theme.text.default}>
                      <b>Sent</b> {item.activity.message}
                    </text>
                    <text fg={props.context.theme.text.subdued}>
                      {age(item.activity.createdAt)}
                    </text>
                  </box>
                  <box flexDirection="row" gap={1}>
                    <For each={item.activity.targets}>
                      {(target) => {
                        const status = targetDisplayStatus(target)
                        return (
                          <text fg={targetColor(props.context, status)}>
                            @{target.name}:{status}
                          </text>
                        )
                      }}
                    </For>
                  </box>
                </box>
              ) : (
                <box
                  flexDirection="column"
                  marginBottom={1}
                  onMouseUp={() => props.onSelectResponse(item.response.id)}
                >
                  <box flexDirection="row" justifyContent="space-between">
                    <text fg={props.context.theme.text.default}>
                      <b>@{item.response.agent.name}</b> response
                    </text>
                    <text fg={props.context.theme.text.subdued}>
                      {age(item.response.createdAt)}
                    </text>
                  </box>
                  <text fg={responseColor(props.context, item.response)}>
                    {sidebarResponseStatus(
                      item.response,
                      responsePresentation(props.feed, item.response.id),
                    )}
                  </text>
                </box>
              )
            }
          </For>
        </Show>
      </scrollbox>
    </box>
  )
}

function sidebarResponseStatus(
  response: AgentlineResponse,
  presentation: ReturnType<typeof responsePresentation>,
): string {
  if (!presentation) return "waiting"
  if (presentation.kind === "revealing") return "showing · responding"
  if (presentation.kind === "truncated") {
    return response.execution.kind === "running"
      ? "truncated · responding"
      : `truncated · ${response.execution.kind}`
  }
  return response.execution.kind
}

function responseColor(context: Context, response: AgentlineResponse) {
  switch (response.execution.kind) {
    case "failed":
    case "interrupted":
      return context.theme.text.feedback.error.default
    case "succeeded":
      return context.theme.text.feedback.success.default
    case "running":
      return context.theme.text.action.primary.default
  }
}

function targetColor(context: Context, status: AgentlineSubmissionStatus) {
  const theme = context.theme.text.feedback
  if (status === "failed") return theme.error.default
  if (status === "submitted") return theme.success.default
  return theme.warning.default
}

/** Confirmed delivery is stronger evidence than the submission-call result. */
function targetDisplayStatus(
  target: AgentlineDispatchTargetActivity,
): AgentlineSubmissionStatus {
  return target.receipt ? "submitted" : target.submission.status
}

function age(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}
