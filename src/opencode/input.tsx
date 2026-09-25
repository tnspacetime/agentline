/** @jsxImportSource @opentui/solid */

import type { Context } from "@opencode-ai/plugin/tui/context"
import { SyntaxStyle, TextareaRenderable } from "@opentui/core"
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js"
import { ROUTE, commandName } from "./constants"
import {
  agentlineHighlightRanges,
  type AgentlineHighlightKind,
} from "./highlighting"
import {
  applySuggestion,
  suggestionContext,
  suggestionsFor,
  type SuggestionAgent,
  type SuggestionContext,
} from "./suggestions"

const hostAutocompleteCommand = {
  previous: "prompt.autocomplete.prev",
  next: "prompt.autocomplete.next",
  hide: "prompt.autocomplete.hide",
  select: "prompt.autocomplete.select",
  complete: "prompt.autocomplete.complete",
} as const

const highlightStyleName: Record<AgentlineHighlightKind, string> = {
  system: "agentline.system",
  action: "agentline.action",
  agent: "extmark.agent",
}

export function AgentlineInput(props: {
  context: Context
  agents: readonly SuggestionAgent[]
  onSubmit: (value: string) => void
}) {
  const theme = () => props.context.theme
  const [target, setTarget] = createSignal<TextareaRenderable>()
  const [context, setContext] = createSignal<SuggestionContext>()
  const [selected, setSelected] = createSignal(0)
  const [inputSyntaxStyle, setInputSyntaxStyle] =
    createSignal<SyntaxStyle>()
  let textarea: TextareaRenderable | undefined

  const suggestions = createMemo(() =>
    suggestionsFor(context(), props.agents).slice(0, 8),
  )
  const suggestionsVisible = createMemo(() => context() !== undefined)

  const refreshHighlights = () => {
    const input = textarea
    const style = inputSyntaxStyle()
    if (!input || input.isDestroyed || !style) return

    input.clearAllHighlights()
    for (const range of agentlineHighlightRanges(input.plainText)) {
      const styleId = style.getStyleId(highlightStyleName[range.kind])
      if (styleId === null) continue
      input.addHighlightByCharRange({
        start: range.start,
        end: range.end,
        styleId,
        priority: 100,
      })
    }
  }

  createEffect(() => {
    const current = theme()
    const style = SyntaxStyle.fromStyles({
      default: { fg: current.text.default },
      "agentline.system": {
        fg: current.text.feedback.info.default,
        bold: true,
      },
      "agentline.action": {
        fg: current.text.action.primary.default,
        bold: true,
      },
      "extmark.agent": {
        fg: current.text.feedback.success.default,
        bold: true,
      },
    })

    setInputSyntaxStyle(style)
    onCleanup(() => style.destroy())
  })

  createEffect(() => {
    const input = target()
    const style = inputSyntaxStyle()
    if (!input || input.isDestroyed || !style) return

    input.syntaxStyle = style
    refreshHighlights()
    onCleanup(() => {
      if (!input.isDestroyed && input.syntaxStyle === style) {
        input.syntaxStyle = null
      }
    })
  })

  createEffect(() => {
    if (!suggestionsVisible()) return
    const popMode = props.context.keymap.mode.push("autocomplete")
    onCleanup(popMode)
  })

  createEffect(() => {
    const input = target()
    if (!input || input.isDestroyed) return
    input.traits = {
      ...input.traits,
      capture: suggestionsVisible()
        ? ["escape", "navigate", "submit", "tab"]
        : undefined,
    }
  })

  const refreshSuggestions = () => {
    if (!textarea) return
    setContext(suggestionContext(textarea.plainText, textarea.cursorOffset))
    setSelected(0)
  }

  const move = (direction: -1 | 1) => {
    const count = suggestions().length
    if (count === 0) return
    setSelected((selected() + direction + count) % count)
  }

  const select = (index = selected()) => {
    if (!textarea) return
    const currentContext = context()
    const suggestion = suggestions()[index]
    if (!currentContext || !suggestion) return

    const applied = applySuggestion(
      textarea.plainText,
      currentContext,
      suggestion,
    )
    if (!applied) return

    textarea.setText(applied.value)
    textarea.cursorOffset = applied.cursorOffset
    setContext(undefined)
    refreshHighlights()
  }

  const submit = () => {
    const value = textarea?.plainText.trim() ?? ""
    if (!value) return
    props.onSubmit(value)
  }

  props.context.keymap.layer(() => ({
    target,
    enabled: () =>
      isAgentlineRoute(props.context) &&
      target() !== undefined &&
      !suggestionsVisible(),
    priority: 1,
    commands: [
      {
        id: commandName.home,
        title: "Leave Agentline",
        group: "Agentline",
        bind: "escape",
        run() {
          props.context.ui.router.navigate({ type: "home" })
        },
      },
    ],
  }))

  props.context.keymap.layer(() => ({
    mode: "autocomplete",
    target,
    enabled: () =>
      isAgentlineRoute(props.context) &&
      target() !== undefined &&
      context() !== undefined,
    priority: 2,
    commands: [
      {
        id: hostAutocompleteCommand.previous,
        title: "Previous Agentline suggestion",
        group: "Agentline",
        run: () => move(-1),
      },
      {
        id: hostAutocompleteCommand.next,
        title: "Next Agentline suggestion",
        group: "Agentline",
        run: () => move(1),
      },
      {
        id: hostAutocompleteCommand.hide,
        title: "Hide Agentline suggestions",
        group: "Agentline",
        run: () => setContext(undefined),
      },
      {
        id: hostAutocompleteCommand.select,
        title: "Select Agentline suggestion",
        group: "Agentline",
        run: () => select(),
      },
      {
        id: hostAutocompleteCommand.complete,
        title: "Complete Agentline suggestion",
        group: "Agentline",
        run: () => select(),
      },
    ],
  }))

  onMount(() => {
    setTimeout(() => {
      if (!textarea || textarea.isDestroyed) return
      textarea.focus()
    }, 1)
  })

  return (
    <box position="relative" flexDirection="column" flexShrink={0}>
      <Show when={context()}>
        <box
          position="absolute"
          bottom="100%"
          left={0}
          width="100%"
          zIndex={100}
          border
          borderColor={theme().border.default}
          backgroundColor={theme().background.surface.offset}
          flexDirection="column"
        >
          <For
            each={suggestions()}
            fallback={
              <box paddingLeft={1} paddingRight={1}>
                <text fg={theme().text.subdued}>No matching items</text>
              </box>
            }
          >
            {(suggestion, index) => {
              const isSelected = () => index() === selected()
              return (
                <box
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={
                    isSelected()
                      ? theme().background.action.primary.selected
                      : undefined
                  }
                  flexDirection="row"
                  onMouseOver={() => setSelected(index())}
                  onMouseDown={() => setSelected(index())}
                  onMouseUp={() => select(index())}
                >
                  <text
                    fg={
                      isSelected()
                        ? theme().text.action.primary.selected
                        : suggestion.disabled
                          ? theme().text.subdued
                          : theme().text.default
                    }
                    flexShrink={0}
                  >
                    {suggestion.label}
                  </text>
                  <text
                    fg={
                      isSelected()
                        ? theme().text.action.primary.selected
                        : theme().text.subdued
                    }
                    wrapMode="none"
                  >
                    {"  "}
                    {suggestion.description}
                    {suggestion.disabled ? " · coming soon" : ""}
                  </text>
                </box>
              )
            }}
          </For>
        </box>
      </Show>

      <box
        border
        borderColor={theme().text.action.primary.focused}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        flexDirection="column"
      >
        <textarea
          height={3}
          ref={(value: TextareaRenderable) => {
            textarea = value
            setTarget(value)
          }}
          placeholder="/create @backend .  or  @backend @frontend Update auth"
          placeholderColor={theme().text.subdued}
          textColor={theme().text.default}
          focusedTextColor={theme().text.default}
          cursorColor={theme().text.default}
          onContentChange={() => {
            refreshSuggestions()
            refreshHighlights()
          }}
          onCursorChange={refreshSuggestions}
          onSubmit={submit}
        />
        <text fg={theme().text.subdued}>
          {context()
            ? "↑↓ select · enter complete · esc close"
            : "enter submit · esc home"}
        </text>
      </box>
    </box>
  )
}

function isAgentlineRoute(context: Context) {
  const route = context.ui.router.current()
  return route.type === "plugin" && route.name === ROUTE
}
