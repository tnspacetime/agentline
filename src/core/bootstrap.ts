import { AgentlineMemoryEnvironment } from "./environment"
import { messageFromError } from "./errors"
import type { AgentlineHost } from "./host"
import {
  AgentlineInterpreterEngine,
  type AgentlineInterpreter,
} from "./interpreter"
import { decodeAgentlineState } from "./state-codec"

export type AgentlineBootstrapResult =
  | Readonly<{ ok: true; interpreter: AgentlineInterpreter }>
  | Readonly<{ ok: false; message: string }>

/** Read and decode durable state before constructing a usable Agentline. */
export async function bootstrapAgentline(
  host: AgentlineHost,
): Promise<AgentlineBootstrapResult> {
  let stored: unknown
  try {
    stored = await host.readState()
  } catch (error) {
    return fail(
      host,
      `Agentline state could not be read: ${messageFromError(error)}. Agentline was not started.`,
    )
  }

  const decoded = decodeAgentlineState(stored)
  if (decoded.kind === "invalid") {
    return fail(
      host,
      `Persisted Agentline state is invalid: ${decoded.reason} Agentline was not started, and the stored value was not replaced.`,
    )
  }
  if (decoded.kind === "unsupported") {
    return fail(
      host,
      `Persisted Agentline state version ${decoded.version} is unsupported. Agentline was not started, and the stored value was not replaced.`,
    )
  }

  const environment = new AgentlineMemoryEnvironment(decoded.state)
  const interpreter = new AgentlineInterpreterEngine(host, environment)
  try {
    await interpreter.start()
  } catch (error) {
    return fail(
      host,
      `Agentline could not start: ${messageFromError(error)}`,
    )
  }
  return { ok: true, interpreter }
}

function fail(
  host: AgentlineHost,
  message: string,
): Readonly<{ ok: false; message: string }> {
  host.notify({ variant: "error", message })
  return { ok: false, message }
}
