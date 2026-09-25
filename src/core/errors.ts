export function messageFromError(error: unknown) {
  if (error instanceof Error && error.message) return error.message

  if (isRecord(error)) {
    if (typeof error.message === "string") return error.message
    if (isRecord(error.data) && typeof error.data.message === "string") {
      return error.data.message
    }
    if (isRecord(error.error) && typeof error.error.message === "string") {
      return error.error.message
    }
  }

  return "Unknown error"
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
