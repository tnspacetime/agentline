import type { AgentlineActivity } from "../core/types"
import type { AgentlineResponse } from "../core/responses"
import { isTerminalResponse } from "../core/responses"
import type {
  AgentlineMainWindowMemory,
  AgentlineMainWindowState,
  AgentlineResponseFeedItem,
  AgentlineResponseFeedItemView,
  AgentlineResponsePreviewReader,
  AgentlineResponsePresentation,
  AgentlineSidebarItem,
  AgentlineSidebarLog,
} from "./main-window-types"

export function emptyResponseFeed(): AgentlineMainWindowState {
  return { items: [], followingTail: true, responseDisplay: "native" }
}

/** Keep presentation choices alive while the plugin route is unmounted. */
export function createResponseFeedMemory(
  initial = emptyResponseFeed(),
): AgentlineMainWindowMemory {
  let state = initial
  return {
    read: () => state,
    write(next) {
      state = next
    },
  }
}

/** Re-enter at the live tail after reconciling everything that happened away. */
export function activateResponseFeed(
  state: AgentlineMainWindowState,
  responses: readonly AgentlineResponse[],
): AgentlineMainWindowState {
  const next = synchronizeResponseFeed(state, responses)
  return next.followingTail ? next : { ...next, followingTail: true }
}

/** Reconcile all settled work, then reveal at most one waiting response. */
export function synchronizeResponseFeed(
  state: AgentlineMainWindowState,
  responses: readonly AgentlineResponse[],
): AgentlineMainWindowState {
  const ordered = orderedResponses(responses)
  const responseByID = new Map(
    ordered.map((response) => [response.id, response]),
  )
  let items = state.items.filter((item) => responseByID.has(item.responseID))

  while (true) {
    const activeIndex = items.findIndex(
      (item) => item.presentation.kind === "revealing",
    )
    if (activeIndex !== -1) {
      const active = responseByID.get(items[activeIndex]!.responseID)
      if (active && !isTerminalResponse(active)) break
      items = items.map((item, index) =>
        index === activeIndex
          ? { ...item, presentation: { kind: "full" } as const }
          : item,
      )
    }

    const next = nextWaitingResponse(items, ordered)
    if (!next) break
    items = [...items, feedItemForActivation(next)]
    if (!isTerminalResponse(next)) break
  }

  return sameFeedItems(items, state.items) ? state : { ...state, items }
}

export function skipToResponse(
  state: AgentlineMainWindowState,
  responses: readonly AgentlineResponse[],
  responseID: AgentlineResponse["id"],
  previewText: AgentlineResponsePreviewReader,
): AgentlineMainWindowState {
  const ordered = orderedResponses(responses)
  const targetIndex = ordered.findIndex(
    (response) => response.id === responseID,
  )
  if (targetIndex === -1) return state

  const existingIndex = state.items.findIndex(
    (item) => item.responseID === responseID,
  )
  if (existingIndex !== -1) {
    const existing = state.items[existingIndex]
    return existing?.presentation.kind === "truncated"
      ? expandResponse(state, responseID)
      : state
  }

  const responseByID = new Map(
    ordered.map((response) => [response.id, response]),
  )
  const visible = new Set(state.items.map((item) => item.responseID))
  const items = state.items.map((item) => {
    if (item.presentation.kind !== "revealing") return item
    return {
      ...item,
      presentation: {
        kind: "truncated",
        previewText: responseByID.has(item.responseID)
          ? previewText(item.responseID)
          : "",
      } as const,
    }
  })

  for (let index = 0; index <= targetIndex; index += 1) {
    const response = ordered[index]
    if (!response || visible.has(response.id)) continue
    items.push(
      response.id === responseID
        ? feedItemForActivation(response)
        : {
            responseID: response.id,
            presentation: {
              kind: "truncated",
              previewText: previewText(response.id),
            },
          },
    )
    visible.add(response.id)
  }

  return { ...state, items, followingTail: true }
}

export function skipToNextResponse(
  state: AgentlineMainWindowState,
  responses: readonly AgentlineResponse[],
  previewText: AgentlineResponsePreviewReader,
): AgentlineMainWindowState {
  const next = nextWaitingResponse(state.items, orderedResponses(responses))
  return next ? skipToResponse(state, responses, next.id, previewText) : state
}

export function expandResponse(
  state: AgentlineMainWindowState,
  responseID: AgentlineResponse["id"],
): AgentlineMainWindowState {
  return {
    ...state,
    items: state.items.map((item) =>
      item.responseID === responseID && item.presentation.kind === "truncated"
        ? { ...item, presentation: { kind: "full" } }
        : item,
    ),
  }
}

export function setFollowingTail(
  state: AgentlineMainWindowState,
  followingTail: boolean,
): AgentlineMainWindowState {
  return state.followingTail === followingTail
    ? state
    : { ...state, followingTail }
}

export function resolveResponseViews(
  state: AgentlineMainWindowState,
  responses: readonly AgentlineResponse[],
): readonly AgentlineResponseFeedItemView[] {
  const responseByID = new Map(
    responses.map((response) => [response.id, response]),
  )
  return state.items.flatMap((item) => {
    const response = responseByID.get(item.responseID)
    return response ? [{ response, presentation: item.presentation }] : []
  })
}

export function responsePresentation(
  state: AgentlineMainWindowState,
  responseID: AgentlineResponse["id"],
): AgentlineResponsePresentation | undefined {
  return state.items.find((item) => item.responseID === responseID)
    ?.presentation
}

export function sidebarLog(
  activity: readonly AgentlineActivity[],
  responses: readonly AgentlineResponse[],
): AgentlineSidebarLog {
  return [
    ...activity.flatMap((item, index) =>
      item.kind === "dispatch"
        ? [{ item: { kind: "dispatch", activity: item } as const, index }]
        : [],
    ),
    ...responses.map((response, index) => ({
      item: { kind: "response", response } as const,
      index: activity.length + index,
    })),
  ]
    .sort((left, right) => {
      const difference = itemCreatedAt(left.item) - itemCreatedAt(right.item)
      return difference === 0 ? left.index - right.index : difference
    })
    .map(({ item }) => item)
}

function orderedResponses(
  responses: readonly AgentlineResponse[],
): readonly AgentlineResponse[] {
  return responses.toSorted((left, right) => left.createdAt - right.createdAt)
}

function sameFeedItems(
  left: readonly AgentlineResponseFeedItem[],
  right: readonly AgentlineResponseFeedItem[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  )
}

function feedItemForActivation(
  response: AgentlineResponse,
): AgentlineResponseFeedItem {
  return {
    responseID: response.id,
    presentation: {
      kind: isTerminalResponse(response) ? "full" : "revealing",
    },
  }
}

function nextWaitingResponse(
  items: readonly AgentlineResponseFeedItem[],
  responses: readonly AgentlineResponse[],
): AgentlineResponse | undefined {
  const visible = new Set(items.map((item) => item.responseID))
  return responses.find((response) => !visible.has(response.id))
}

function itemCreatedAt(item: AgentlineSidebarItem): number {
  return item.kind === "dispatch"
    ? item.activity.createdAt
    : item.response.createdAt
}
