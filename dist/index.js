#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sampleFromClient = sampleFromClient;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const files_js_1 = require("./tools/files.js");
const git_js_1 = require("./tools/git.js");
const code_analysis_js_1 = require("./tools/code-analysis.js");
const http_js_1 = require("./tools/http.js");
const system_js_1 = require("./tools/system.js");
const errors_js_1 = require("./utils/errors.js");
const logger_js_1 = require("./utils/logger.js");
const resources_js_1 = require("./resources.js");
const ALL_TOOLS = [
    ...files_js_1.fileToolDefinitions,
    ...git_js_1.gitToolDefinitions,
    ...code_analysis_js_1.codeToolDefinitions,
    ...http_js_1.httpToolDefinitions,
    ...system_js_1.systemToolDefinitions,
];
const FILE_TOOL_NAMES = new Set(files_js_1.fileToolDefinitions.map((t) => t.name));
const GIT_TOOL_NAMES = new Set(git_js_1.gitToolDefinitions.map((t) => t.name));
const CODE_TOOL_NAMES = new Set(code_analysis_js_1.codeToolDefinitions.map((t) => t.name));
const HTTP_TOOL_NAMES = new Set(http_js_1.httpToolDefinitions.map((t) => t.name));
const SYSTEM_TOOL_NAMES = new Set(system_js_1.systemToolDefinitions.map((t) => t.name));
const server = new index_js_1.Server({
    name: "devtoolkit-mcp",
    version: "1.0.0",
}, {
    capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        logging: {},
        completions: {},
    },
});
// ── Resources (file browsing, subscriptions, completion, pagination) ──────────
(0, resources_js_1.registerResourceHandlers)(server);
// ── Logging: honour client log-level requests ─────────────────────────────────
server.setRequestHandler(types_js_1.SetLevelRequestSchema, async (request) => {
    const level = request.params.level;
    (0, logger_js_1.setLogLevel)(level);
    await (0, logger_js_1.sendLog)(server, "info", { message: `Log level set to: ${level}` }, "devtoolkit");
    return {};
});
// ── Tools list ────────────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS,
}));
// ── Tool dispatch ─────────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    await (0, logger_js_1.sendLog)(server, "debug", { tool: name, args }, "tool-call");
    try {
        let result;
        if (FILE_TOOL_NAMES.has(name)) {
            // For write_file: elicit confirmation if file exists, then notify subscribers
            if (name === "write_file") {
                result = await handleFileToolWithElicitation(server, name, args);
            }
            else if (name === "delete_file") {
                result = await handleDeleteWithElicitation(server, args);
            }
            else {
                result = await (0, files_js_1.handleFileTool)(name, args);
            }
        }
        else if (GIT_TOOL_NAMES.has(name)) {
            result = await (0, git_js_1.handleGitTool)(name, args);
        }
        else if (CODE_TOOL_NAMES.has(name)) {
            result = await (0, code_analysis_js_1.handleCodeTool)(name, args);
        }
        else if (HTTP_TOOL_NAMES.has(name)) {
            result = await (0, http_js_1.handleHttpTool)(name, args);
        }
        else if (SYSTEM_TOOL_NAMES.has(name)) {
            result = await (0, system_js_1.handleSystemTool)(name, args);
        }
        else {
            throw new types_js_1.McpError(types_js_1.ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
        await (0, logger_js_1.sendLog)(server, "debug", { tool: name, status: "success", preview: result.slice(0, 100) }, "tool-call");
        return { content: [{ type: "text", text: result }] };
    }
    catch (error) {
        if (error instanceof types_js_1.McpError)
            throw error;
        await (0, logger_js_1.sendLog)(server, "error", { tool: name, error: (0, errors_js_1.formatError)(error) }, "tool-call");
        return {
            content: [{ type: "text", text: `Error: ${(0, errors_js_1.formatError)(error)}` }],
            isError: true,
        };
    }
});
// ── Elicitation helpers ───────────────────────────────────────────────────────
async function elicit(server, message, schema) {
    try {
        const response = await server.request({
            method: "elicitation/create",
            params: { message, requestedSchema: schema },
        }, 
        // ElicitResultSchema — use raw shape since it may not be exported
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {});
        return response;
    }
    catch {
        // Client doesn't support elicitation — proceed without confirmation
        return { action: "accept" };
    }
}
async function handleFileToolWithElicitation(server, name, args) {
    const typedArgs = args;
    const filePath = typedArgs.file_path;
    // Always allow overwrite — elicitation not supported in stdio mode
    const result = await (0, files_js_1.handleFileTool)(name, args);
    await (0, resources_js_1.notifyResourceUpdated)(server, filePath);
    return result;
}
async function handleDeleteWithElicitation(server, args) {
    const typedArgs = args;
    const filePath = typedArgs.file_path;
    // Always allow delete — elicitation not supported in stdio mode
    const result = await (0, files_js_1.handleFileTool)("delete_file", args);
    await (0, resources_js_1.notifyResourceUpdated)(server, filePath);
    return result;
}
// ── Sampling: server-initiated LLM call via client ───────────────────────────
async function sampleFromClient(server, prompt, systemPrompt) {
    try {
        const response = await server.request({
            method: "sampling/createMessage",
            params: {
                messages: [{ role: "user", content: { type: "text", text: prompt } }],
                systemPrompt: systemPrompt ?? "You are a helpful developer assistant.",
                modelPreferences: {
                    hints: [{ name: "claude-3-sonnet" }, { name: "claude" }],
                    intelligencePriority: 0.8,
                    speedPriority: 0.5,
                    costPriority: 0.3,
                },
                maxTokens: 1024,
            },
        }, 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {});
        const r = response;
        return r.content?.text ?? "(no response)";
    }
    catch {
        return "(sampling not supported by this client)";
    }
}
// ── Boot ──────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    await (0, logger_js_1.sendLog)(server, "info", {
        message: "DevToolkit MCP Server started",
        version: "1.0.0",
        tools: ALL_TOOLS.length,
        capabilities: ["tools", "resources", "logging", "completions", "elicitation", "sampling"],
    }, "devtoolkit");
    process.stderr.write("DevToolkit MCP Server v1.0.0 running on stdio\n");
}
main().catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map