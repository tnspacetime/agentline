/** @jsxImportSource @opentui/solid */

import { Plugin } from "@opencode-ai/plugin/tui"
import type { Context } from "@opencode-ai/plugin/tui/context"
import { Show, createResource } from "solid-js"
import {
  bootstrapAgentline,
  type AgentlineBootstrapResult,
} from "../core/bootstrap"
import type { AgentlineOpenCodeObservation } from "../core/interpreter"
import { createOpenCodeHost } from "./adapter"
import { PLUGIN_ID, ROUTE, STORAGE_KEY, commandName } from "./constants"
import type { AgentlineMainWindowMemory } from "./main-window-types"
import { createResponseFeedMemory } from "./response-feed"
import { AgentlineScreen } from "./screen"

export { parseAgentLanguage } from "../language/index.ts"

function AgentlineRoute(props: {
  context: Context
  bootstrap: Promise<AgentlineBootstrapResult>
  mainWindow: AgentlineMainWindowMemory
}) {
  const [result] = createResource(() => props.bootstrap)

  return (
    <Show
      when={result()}
      fallback={
        <AgentlineStartupScreen
          context={props.context}
          message="Loading Agentline…"
        />
      }
    >
      <AgentlineReadyRoute
        context={props.context}
        result={result()!}
        mainWindow={props.mainWindow}
      />
    </Show>
  )
}

function AgentlineReadyRoute(props: {
  context: Context
  result: AgentlineBootstrapResult
  mainWindow: AgentlineMainWindowMemory
}) {
  return props.result.ok ? (
    <AgentlineScreen
      context={props.context}
      interpreter={props.result.interpreter}
      mainWindow={props.mainWindow}
    />
  ) : (
    <AgentlineStartupScreen
      context={props.context}
      message={props.result.message}
      error
    />
  )
}

function AgentlineStartupScreen(props: {
  context: Context
  message: string
  error?: boolean
}) {
  return (
    <box
      flexGrow={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor={props.context.theme.background.default}
      paddingLeft={2}
      paddingRight={2}
    >
      <text
        fg={
          props.error
            ? props.context.theme.text.feedback.error.default
            : props.context.theme.text.subdued
        }
      >
        {props.message}
      </text>
    </box>
  )
}

function AgentlineCommands(props: { context: Context }) {
  props.context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: commandName.open,
        title: "Agentline",
        description: "Create and route work to multiple OpenCode contexts",
        group: "Plugin",
        palette: true,
        slash: { name: "agentline" },
        run() {
          props.context.ui.router.navigate({
            type: "plugin",
            name: ROUTE,
          })
        },
      },
    ],
  }))
  return null
}

export default Plugin.define({
  id: PLUGIN_ID,
  setup(context) {
    const host = createOpenCodeHost(context, STORAGE_KEY)
    const bootstrap = bootstrapAgentline(host)
    const mainWindow = createResponseFeedMemory()
    let active = true
    // Events arriving during startup wait instead of touching temporary state.
    const forward = (event: AgentlineOpenCodeObservation) => {
      void bootstrap.then((result) => {
        if (active && result.ok) return result.interpreter.observe(event)
      })
    }
    const dispose = [
      context.ui.router.register({
        name: ROUTE,
        render: () => (
          <AgentlineRoute
            context={context}
            bootstrap={bootstrap}
            mainWindow={mainWindow}
          />
        ),
      }),
      context.ui.slot("app", () => <AgentlineCommands context={context} />),
      context.data.on("session.status", (event) => {
        forward(event)
      }),
      context.data.on("session.renamed", (event) => {
        forward(event)
      }),
      context.data.on("session.moved", (event) => {
        forward(event)
      }),
      context.data.on("session.deleted", (event) => {
        forward(event)
      }),
      context.data.on("session.input.admitted", (event) => {
        forward(event)
      }),
      context.data.on("session.input.queued", (event) => {
        forward(event)
      }),
      context.data.on("session.input.steered", (event) => {
        forward(event)
      }),
      context.data.on("session.input.promoted", (event) => {
        forward(event)
      }),
      context.data.on("session.input.cancelled", (event) => {
        forward(event)
      }),
      context.data.on("session.execution.succeeded", (event) => {
        forward(event)
      }),
      context.data.on("session.execution.failed", (event) => {
        forward(event)
      }),
      context.data.on("session.execution.interrupted", (event) => {
        forward(event)
      }),
      context.data.on("permission.asked", (event) => {
        forward(event)
      }),
      context.data.on("permission.replied", (event) => {
        forward(event)
      }),
      context.data.on("form.created", (event) => {
        forward(event)
      }),
      context.data.on("form.replied", (event) => {
        forward(event)
      }),
      context.data.on("form.cancelled", (event) => {
        forward(event)
      }),
    ]

    return () => {
      active = false
      for (const cleanup of dispose.toReversed()) cleanup()
    }
  },
})
