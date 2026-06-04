"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolError = void 0;
exports.formatError = formatError;
exports.safeJson = safeJson;
class ToolError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = "ToolError";
    }
}
exports.ToolError = ToolError;
function formatError(error) {
    if (error instanceof ToolError) {
        return `[${error.code}] ${error.message}${error.details ? `\nDetails: ${JSON.stringify(error.details, null, 2)}` : ""}`;
    }
    if (error instanceof Error)
        return error.message;
    return String(error);
}
function safeJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
//# sourceMappingURL=errors.js.map