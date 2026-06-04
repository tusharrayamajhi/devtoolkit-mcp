export declare class ToolError extends Error {
    readonly code: string;
    readonly details?: unknown | undefined;
    constructor(message: string, code: string, details?: unknown | undefined);
}
export declare function formatError(error: unknown): string;
export declare function safeJson(value: unknown): string;
//# sourceMappingURL=errors.d.ts.map