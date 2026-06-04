export class ToolError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export function formatError(error: unknown): string {
  if (error instanceof ToolError) {
    return `[${error.code}] ${error.message}${
      error.details ? `\nDetails: ${JSON.stringify(error.details, null, 2)}` : ""
    }`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
