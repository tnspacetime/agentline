import path from "node:path"
import { stat } from "node:fs/promises"

const root = path.resolve(import.meta.dir, "..")
const upstream = path.join(root, "opencode-v2")
const args = Bun.argv.slice(2)
const requestedDirectory = args[0]?.startsWith("-") ? undefined : args.shift()
const directory = path.resolve(requestedDirectory ?? root)
const info = await stat(directory).catch(() => undefined)

if (!info?.isDirectory()) {
  throw new Error(`OpenCode target is not a directory: ${directory}`)
}

const child = Bun.spawn(["bun", "run", "dev", directory, ...args], {
  cwd: upstream,
  env: {
    ...process.env,
    // Treat Agentline's tracked .opencode directory as the v2 development
    // plugin directory, independently of the project OpenCode is opened in.
    OPENCODE_CONFIG_DIR: path.join(root, ".opencode"),
  },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

process.exitCode = await child.exited
