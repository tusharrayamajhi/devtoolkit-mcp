"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addWatchedDir = addWatchedDir;
exports.registerResourceHandlers = registerResourceHandlers;
exports.notifyResourceUpdated = notifyResourceUpdated;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const fast_glob_1 = __importDefault(require("fast-glob"));
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const logger_js_1 = require("./utils/logger.js");
// In-memory subscription registry
const subscriptions = new Set();
// Watched base directories (populated at runtime)
const watchedDirs = new Set([process.cwd()]);
const PAGE_SIZE = 50;
function uriToPath(uri) {
    if (!uri.startsWith("file://"))
        return null;
    return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}
function pathToUri(filePath) {
    return `file://${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
}
function getMimeType(filePath) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    const map = {
        ".ts": "text/typescript", ".tsx": "text/typescript",
        ".js": "application/javascript", ".jsx": "application/javascript",
        ".json": "application/json", ".md": "text/markdown",
        ".txt": "text/plain", ".html": "text/html", ".css": "text/css",
        ".py": "text/x-python", ".go": "text/x-go", ".rs": "text/x-rust",
        ".java": "text/x-java", ".cpp": "text/x-c++", ".c": "text/x-c",
        ".yaml": "application/yaml", ".yml": "application/yaml",
        ".toml": "application/toml", ".xml": "application/xml",
        ".sh": "application/x-sh", ".sql": "application/sql",
        ".graphql": "application/graphql",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".svg": "image/svg+xml", ".pdf": "application/pdf",
    };
    return map[ext] ?? "application/octet-stream";
}
async function getAllFiles(cursor) {
    const allFiles = [];
    for (const dir of watchedDirs) {
        try {
            const files = await (0, fast_glob_1.default)("**/*", {
                cwd: dir,
                absolute: true,
                onlyFiles: true,
                ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/*.lock"],
                followSymbolicLinks: false,
            });
            allFiles.push(...files);
        }
        catch {
            // dir may not exist yet
        }
    }
    allFiles.sort();
    // Decode cursor to get starting index
    let startIndex = 0;
    if (cursor) {
        try {
            startIndex = parseInt(Buffer.from(cursor, "base64").toString("utf-8"), 10);
        }
        catch {
            startIndex = 0;
        }
    }
    const page = allFiles.slice(startIndex, startIndex + PAGE_SIZE);
    const hasMore = startIndex + PAGE_SIZE < allFiles.length;
    const resources = await Promise.all(page.map(async (filePath) => {
        const stat = await promises_1.default.stat(filePath).catch(() => null);
        return {
            uri: pathToUri(filePath),
            name: path_1.default.basename(filePath),
            description: path_1.default.relative(process.cwd(), filePath),
            mimeType: getMimeType(filePath),
            size: stat?.size,
        };
    }));
    return {
        resources,
        nextCursor: hasMore
            ? Buffer.from(String(startIndex + PAGE_SIZE)).toString("base64")
            : undefined,
    };
}
function addWatchedDir(dirPath) {
    watchedDirs.add(path_1.default.resolve(dirPath));
}
function registerResourceHandlers(server) {
    // List resources with pagination
    server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async (request) => {
        const cursor = request.params?.cursor;
        await (0, logger_js_1.sendLog)(server, "debug", { message: "resources/list called", cursor }, "resources");
        const result = await getAllFiles(cursor);
        return result;
    });
    // Resource templates for dynamic file access
    server.setRequestHandler(types_js_1.ListResourceTemplatesRequestSchema, async () => {
        return {
            resourceTemplates: [
                {
                    uriTemplate: "file:///{path}",
                    name: "Project Files",
                    title: "📁 Project Files",
                    description: "Access any file by path on the filesystem",
                    mimeType: "application/octet-stream",
                },
                {
                    uriTemplate: "file:///{path}?lines={start}-{end}",
                    name: "File Line Range",
                    title: "📄 File Lines",
                    description: "Read a specific line range from a file",
                    mimeType: "text/plain",
                },
            ],
        };
    });
    // Read resource contents
    server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
        await (0, logger_js_1.sendLog)(server, "info", { message: "Reading resource", uri }, "resources");
        const filePath = uriToPath(uri);
        if (!filePath) {
            throw new Error(`Unsupported URI scheme: ${uri}`);
        }
        const mimeType = getMimeType(filePath);
        const isBinary = ["image/", "application/pdf", "application/octet-stream"].some((t) => mimeType.startsWith(t));
        try {
            if (isBinary) {
                const data = await promises_1.default.readFile(filePath);
                return {
                    contents: [
                        {
                            uri,
                            mimeType,
                            blob: data.toString("base64"),
                        },
                    ],
                };
            }
            else {
                const text = await promises_1.default.readFile(filePath, "utf-8");
                const stat = await promises_1.default.stat(filePath);
                return {
                    contents: [
                        {
                            uri,
                            mimeType,
                            text,
                            annotations: {
                                audience: ["user", "assistant"],
                                priority: 0.8,
                                lastModified: stat.mtime.toISOString(),
                            },
                        },
                    ],
                };
            }
        }
        catch (e) {
            await (0, logger_js_1.sendLog)(server, "error", { message: "Failed to read resource", uri, error: String(e) }, "resources");
            throw new Error(`Cannot read resource: ${uri} — ${e instanceof Error ? e.message : e}`);
        }
    });
    // Subscribe to resource changes
    server.setRequestHandler(types_js_1.SubscribeRequestSchema, async (request) => {
        const { uri } = request.params;
        subscriptions.add(uri);
        await (0, logger_js_1.sendLog)(server, "info", { message: "Subscribed to resource", uri }, "resources");
        return {};
    });
    // Unsubscribe from resource changes
    server.setRequestHandler(types_js_1.UnsubscribeRequestSchema, async (request) => {
        const { uri } = request.params;
        subscriptions.delete(uri);
        await (0, logger_js_1.sendLog)(server, "debug", { message: "Unsubscribed from resource", uri }, "resources");
        return {};
    });
    // Completion for file path URI template
    server.setRequestHandler(types_js_1.CompleteRequestSchema, async (request) => {
        const { ref, argument } = request.params;
        if (ref.type !== "ref/resource") {
            return { completion: { values: [], hasMore: false } };
        }
        const partial = argument.value ?? "";
        try {
            const files = await (0, fast_glob_1.default)(`${partial}*`, {
                cwd: process.cwd(),
                onlyFiles: false,
                dot: true,
                ignore: ["**/node_modules/**", "**/.git/**"],
            });
            const suggestions = files
                .slice(0, 20)
                .map((f) => f);
            return {
                completion: {
                    values: suggestions,
                    total: files.length,
                    hasMore: files.length > 20,
                },
            };
        }
        catch {
            return { completion: { values: [], hasMore: false } };
        }
    });
}
// Notify subscribers of resource changes (call this after file writes)
async function notifyResourceUpdated(server, filePath) {
    const uri = pathToUri(path_1.default.resolve(filePath));
    if (subscriptions.has(uri)) {
        await server.notification({
            method: "notifications/resources/updated",
            params: { uri },
        });
    }
    // Always notify list changed since file writes may add new resources
    await server.notification({
        method: "notifications/resources/list_changed",
    });
}
//# sourceMappingURL=resources.js.map