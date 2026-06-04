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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpToolDefinitions = void 0;
exports.handleHttpTool = handleHttpTool;
const axios_1 = __importDefault(require("axios"));
const zod_1 = require("zod");
const errors_js_1 = require("../utils/errors.js");
exports.httpToolDefinitions = [
    {
        name: "http_request",
        description: "Make an HTTP request to any URL. Supports GET, POST, PUT, PATCH, DELETE with custom headers and body.",
        inputSchema: {
            type: "object",
            properties: {
                url: { type: "string", description: "The URL to request" },
                method: {
                    type: "string",
                    enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
                    description: "HTTP method (default: GET)",
                },
                headers: {
                    type: "object",
                    description: "HTTP headers as key-value pairs",
                    additionalProperties: { type: "string" },
                },
                body: { type: "string", description: "Request body (JSON string or plain text)" },
                timeout_ms: { type: "number", description: "Request timeout in ms (default: 10000)" },
                follow_redirects: { type: "boolean", description: "Follow redirects (default: true)" },
            },
            required: ["url"],
        },
    },
    {
        name: "fetch_json",
        description: "Fetch JSON from a URL and return it as formatted data.",
        inputSchema: {
            type: "object",
            properties: {
                url: { type: "string", description: "URL to fetch JSON from" },
                headers: {
                    type: "object",
                    additionalProperties: { type: "string" },
                    description: "Optional HTTP headers",
                },
                json_path: { type: "string", description: "Optional dot-notation path to extract (e.g. 'data.users')" },
            },
            required: ["url"],
        },
    },
    {
        name: "check_url_status",
        description: "Check the HTTP status and response time of one or more URLs.",
        inputSchema: {
            type: "object",
            properties: {
                urls: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of URLs to check",
                },
                timeout_ms: { type: "number", description: "Timeout per URL in ms (default: 5000)" },
            },
            required: ["urls"],
        },
    },
    {
        name: "download_file",
        description: "Download a file from a URL and save it to a local path.",
        inputSchema: {
            type: "object",
            properties: {
                url: { type: "string", description: "URL of the file to download" },
                save_path: { type: "string", description: "Local path to save the file" },
                headers: {
                    type: "object",
                    additionalProperties: { type: "string" },
                    description: "Optional headers (e.g. Authorization)",
                },
            },
            required: ["url", "save_path"],
        },
    },
];
const RequestSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    method: zod_1.z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]).optional().default("GET"),
    headers: zod_1.z.record(zod_1.z.string()).optional().default({}),
    body: zod_1.z.string().optional(),
    timeout_ms: zod_1.z.number().optional().default(10000),
    follow_redirects: zod_1.z.boolean().optional().default(true),
});
const FetchJsonSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    headers: zod_1.z.record(zod_1.z.string()).optional().default({}),
    json_path: zod_1.z.string().optional(),
});
const StatusSchema = zod_1.z.object({
    urls: zod_1.z.array(zod_1.z.string()),
    timeout_ms: zod_1.z.number().optional().default(5000),
});
const DownloadSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    save_path: zod_1.z.string(),
    headers: zod_1.z.record(zod_1.z.string()).optional().default({}),
});
function extractJsonPath(obj, dotPath) {
    return dotPath.split(".").reduce((acc, key) => {
        if (acc && typeof acc === "object" && key in acc) {
            return acc[key];
        }
        return undefined;
    }, obj);
}
async function handleHttpTool(name, args) {
    switch (name) {
        case "http_request": {
            const { url, method, headers, body, timeout_ms, follow_redirects } = RequestSchema.parse(args);
            try {
                let data = body;
                if (body) {
                    try {
                        data = JSON.parse(body);
                    }
                    catch {
                        data = body;
                    }
                }
                const config = {
                    url,
                    method,
                    headers: { "User-Agent": "devtoolkit-mcp/1.0.0", ...headers },
                    data,
                    timeout: timeout_ms,
                    maxRedirects: follow_redirects ? 5 : 0,
                    validateStatus: () => true,
                };
                const start = Date.now();
                const response = await (0, axios_1.default)(config);
                const elapsed = Date.now() - start;
                const contentType = String(response.headers["content-type"] ?? "");
                let responseBody;
                if (contentType.includes("application/json")) {
                    responseBody = (0, errors_js_1.safeJson)(response.data);
                }
                else {
                    responseBody = String(response.data).slice(0, 5000);
                }
                return (0, errors_js_1.safeJson)({
                    status: response.status,
                    status_text: response.statusText,
                    elapsed_ms: elapsed,
                    headers: response.headers,
                    body: responseBody,
                });
            }
            catch (e) {
                throw new errors_js_1.ToolError(`HTTP request failed: ${url}`, "HTTP_REQUEST_ERROR", e instanceof Error ? e.message : e);
            }
        }
        case "fetch_json": {
            const { url, headers, json_path } = FetchJsonSchema.parse(args);
            try {
                const response = await axios_1.default.get(url, {
                    headers: { "User-Agent": "devtoolkit-mcp/1.0.0", Accept: "application/json", ...headers },
                    timeout: 10000,
                });
                const data = json_path ? extractJsonPath(response.data, json_path) : response.data;
                return (0, errors_js_1.safeJson)(data);
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Failed to fetch JSON from: ${url}`, "FETCH_JSON_ERROR", e instanceof Error ? e.message : e);
            }
        }
        case "check_url_status": {
            const { urls, timeout_ms } = StatusSchema.parse(args);
            const results = await Promise.all(urls.map(async (url) => {
                const start = Date.now();
                try {
                    const response = await axios_1.default.head(url, {
                        timeout: timeout_ms,
                        validateStatus: () => true,
                        maxRedirects: 5,
                    });
                    return {
                        url,
                        status: response.status,
                        ok: response.status >= 200 && response.status < 400,
                        elapsed_ms: Date.now() - start,
                        content_type: response.headers["content-type"] ?? null,
                    };
                }
                catch (e) {
                    return {
                        url,
                        status: null,
                        ok: false,
                        elapsed_ms: Date.now() - start,
                        error: e instanceof Error ? e.message : String(e),
                    };
                }
            }));
            return (0, errors_js_1.safeJson)(results);
        }
        case "download_file": {
            const { url, save_path, headers } = DownloadSchema.parse(args);
            try {
                const fs = await Promise.resolve().then(() => __importStar(require("fs/promises")));
                const path = await Promise.resolve().then(() => __importStar(require("path")));
                await fs.mkdir(path.dirname(save_path), { recursive: true });
                const response = await axios_1.default.get(url, {
                    headers: { "User-Agent": "devtoolkit-mcp/1.0.0", ...headers },
                    responseType: "arraybuffer",
                    timeout: 30000,
                });
                await fs.writeFile(save_path, Buffer.from(response.data));
                const size = response.data.byteLength;
                return (0, errors_js_1.safeJson)({
                    saved_to: save_path,
                    size_bytes: size,
                    size_human: `${(size / 1024).toFixed(2)} KB`,
                    content_type: response.headers["content-type"] ?? "unknown",
                });
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Download failed: ${url}`, "DOWNLOAD_ERROR", e instanceof Error ? e.message : e);
            }
        }
        default:
            throw new errors_js_1.ToolError(`Unknown HTTP tool: ${name}`, "UNKNOWN_TOOL");
    }
}
//# sourceMappingURL=http.js.map