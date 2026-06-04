import { Server } from "@modelcontextprotocol/sdk/server/index.js";
export type LogLevel = "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
export declare function setLogLevel(level: LogLevel): void;
export declare function getLogLevel(): LogLevel;
export declare function sendLog(server: Server, level: LogLevel, data: unknown, logger?: string): Promise<void>;
//# sourceMappingURL=logger.d.ts.map