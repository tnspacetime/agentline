import { readFile, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const options = parseOptions(Bun.argv.slice(2))
const stateRoot =
  process.env.XDG_STATE_HOME?.trim() || path.join(homedir(), ".local", "state")
const file = path.join(
  stateRoot,
  "opencode",
  options.channel,
  "tui",
  "plugin.agentline.state.json",
)

const stored = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT") return undefined
  throw error
})

if (stored === undefined) {
  console.log(`No Agentline state found for OpenCode channel ${options.channel}.`)
} else {
  const version = storedVersion(stored)
  if (options.dryRun) {
    console.log(`Found Agentline state${version ? ` version ${version}` : ""}: ${file}`)
  } else {
    await unlink(file)
    console.log(`Removed Agentline state${version ? ` version ${version}` : ""}: ${file}`)
  }
}

function parseOptions(args: string[]): Readonly<{
  channel: string
  dryRun: boolean
}> {
  let channel = process.env.OPENCODE_TUI_CHANNEL?.trim() || "local"
  let dryRun = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--dry-run") {
      dryRun = true
      continue
    }
    if (argument === "--channel") {
      const value = args[index + 1]
      if (!value) throw new Error("--channel requires a value.")
      channel = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(channel) ||
    channel === "." ||
    channel === ".."
  ) {
    throw new Error(`Invalid OpenCode channel: ${channel}`)
  }

  return { channel, dryRun }
}

function storedVersion(value: string): number | undefined {
  try {
    const decoded = JSON.parse(value) as {
      state?: { version?: unknown }
    }
    return typeof decoded.state?.version === "number"
      ? decoded.state.version
      : undefined
  } catch {
    return undefined
  }
}
