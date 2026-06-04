import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type LogLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, notice: 2, warning: 3,
  error: 4, critical: 5, alert: 6, emergency: 7,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

export async function sendLog(
  server: McpServer,
  level: LogLevel,
  data: unknown,
  logger?: string
): Promise<void> {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;
  try {
    await server.sendLoggingMessage({ level, logger: logger ?? "devtoolkit", data });
  } catch {
    // client may not support logging
  }
}
