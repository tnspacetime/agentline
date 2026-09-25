import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const upstream = path.join(root, "opencode-v2")
const revisionFile = path.join(root, "OPENCODE_V2_REVISION")

async function run(command: string[], cwd: string) {
  const process = Bun.spawn(command, {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with status ${exitCode}`)
  }
}

async function output(command: string[], cwd: string) {
  const process = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "inherit" })
  const value = await new Response(process.stdout).text()
  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with status ${exitCode}`)
  }
  return value.trim()
}

if (!(await Bun.file(path.join(upstream, "package.json")).exists())) {
  throw new Error(
    "Missing opencode-v2/. Clone the upstream anomalyco/opencode v2 branch into that directory first.",
  )
}

const expected = (await Bun.file(revisionFile).text()).trim()
const actual = await output(["git", "rev-parse", "HEAD"], upstream)
if (actual !== expected) {
  throw new Error(`opencode-v2 is at ${actual}; Agentline is pinned to ${expected}`)
}

await run(["bun", "install", "--frozen-lockfile"], upstream)
await run(["bun", "link"], path.join(upstream, "packages", "plugin"))
await run(["bun", "link"], path.join(upstream, "packages", "client"))
await run(["bun", "install"], root)

console.log(`Agentline is linked to OpenCode v2 ${expected}`)
