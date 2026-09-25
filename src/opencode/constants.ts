export const PLUGIN_ID = "agentline"
export const ROUTE = "agentline"
// The v2 plugin host namespaces this as `plugin.agentline.state`.
export const STORAGE_KEY = "state"

export const commandName = {
  open: "agentline.open",
  home: "agentline.input.home",
  nextResponse: "agentline.response.next",
  responseTail: "agentline.response.tail",
} as const
