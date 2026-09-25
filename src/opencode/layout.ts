export const AGENTLINE_WIDE_BREAKPOINT = 120
export const AGENTLINE_SIDEBAR_WIDTH = 42
export const AGENTLINE_MAIN_HORIZONTAL_PADDING = 4

export function agentlineLayout(terminalWidth: number) {
  const width = Math.max(0, Math.floor(terminalWidth))
  const sidebarVisible = width > AGENTLINE_WIDE_BREAKPOINT
  const sidebarWidth = sidebarVisible ? AGENTLINE_SIDEBAR_WIDTH : 0

  return {
    width,
    sidebarVisible,
    sidebarWidth,
    contentWidth: Math.max(
      0,
      width - sidebarWidth - AGENTLINE_MAIN_HORIZONTAL_PADDING,
    ),
  }
}
