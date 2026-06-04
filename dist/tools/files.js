"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileToolDefinitions = void 0;
exports.handleFileTool = handleFileTool;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const fast_glob_1 = __importDefault(require("fast-glob"));
const zod_1 = require("zod");
const errors_js_1 = require("../utils/errors.js");
exports.fileToolDefinitions = [
    {
        name: "read_file",
        description: "Read the contents of a file at the given path. Supports optional line range.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Absolute or relative path to the file" },
                start_line: { type: "number", description: "Start line (1-indexed, optional)" },
                end_line: { type: "number", description: "End line (1-indexed, optional)" },
            },
            required: ["file_path"],
        },
    },
    {
        name: "write_file",
        description: "Write content to a file, creating it if it doesn't exist.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Path to write the file" },
                content: { type: "string", description: "Content to write" },
                append: { type: "boolean", description: "Append instead of overwrite (default: false)" },
            },
            required: ["file_path", "content"],
        },
    },
    {
        name: "list_directory",
        description: "List files and directories at a given path with metadata.",
        inputSchema: {
            type: "object",
            properties: {
                dir_path: { type: "string", description: "Path to the directory" },
                show_hidden: { type: "boolean", description: "Show hidden files (default: false)" },
            },
            required: ["dir_path"],
        },
    },
    {
        name: "search_in_files",
        description: "Search for a text pattern across files using glob patterns.",
        inputSchema: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "Text or regex pattern to search for" },
                glob: { type: "string", description: "Glob pattern for files (e.g. '**/*.ts')" },
                base_dir: { type: "string", description: "Base directory to search in" },
                case_sensitive: { type: "boolean", description: "Case sensitive search (default: true)" },
                max_results: { type: "number", description: "Maximum results to return (default: 50)" },
            },
            required: ["pattern"],
        },
    },
    {
        name: "get_file_info",
        description: "Get metadata for a file: size, timestamps, permissions.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Path to the file" },
            },
            required: ["file_path"],
        },
    },
    {
        name: "delete_file",
        description: "Delete a file or empty directory.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Path to the file or directory to delete" },
                recursive: { type: "boolean", description: "Recursively delete directories (default: false)" },
            },
            required: ["file_path"],
        },
    },
];
const ReadSchema = zod_1.z.object({
    file_path: zod_1.z.string(),
    start_line: zod_1.z.number().optional(),
    end_line: zod_1.z.number().optional(),
});
const WriteSchema = zod_1.z.object({
    file_path: zod_1.z.string(),
    content: zod_1.z.string(),
    append: zod_1.z.boolean().optional().default(false),
});
const ListSchema = zod_1.z.object({
    dir_path: zod_1.z.string(),
    show_hidden: zod_1.z.boolean().optional().default(false),
});
const SearchSchema = zod_1.z.object({
    pattern: zod_1.z.string(),
    glob: zod_1.z.string().optional().default("**/*"),
    base_dir: zod_1.z.string().optional().default("."),
    case_sensitive: zod_1.z.boolean().optional().default(true),
    max_results: zod_1.z.number().optional().default(50),
});
const FileInfoSchema = zod_1.z.object({ file_path: zod_1.z.string() });
const DeleteSchema = zod_1.z.object({
    file_path: zod_1.z.string(),
    recursive: zod_1.z.boolean().optional().default(false),
});
async function handleFileTool(name, args) {
    switch (name) {
        case "read_file": {
            const { file_path, start_line, end_line } = ReadSchema.parse(args);
            try {
                const content = await promises_1.default.readFile(file_path, "utf-8");
                if (start_line !== undefined || end_line !== undefined) {
                    const lines = content.split("\n");
                    const from = (start_line ?? 1) - 1;
                    const to = end_line ?? lines.length;
                    const slice = lines.slice(from, to);
                    return slice
                        .map((l, i) => `${from + i + 1}: ${l}`)
                        .join("\n");
                }
                return content;
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Cannot read file: ${file_path}`, "FILE_READ_ERROR", e);
            }
        }
        case "write_file": {
            const { file_path, content, append } = WriteSchema.parse(args);
            try {
                await promises_1.default.mkdir(path_1.default.dirname(file_path), { recursive: true });
                if (append) {
                    await promises_1.default.appendFile(file_path, content, "utf-8");
                    return `Appended ${content.length} chars to ${file_path}`;
                }
                await promises_1.default.writeFile(file_path, content, "utf-8");
                return `Written ${content.length} chars to ${file_path}`;
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Cannot write file: ${file_path}`, "FILE_WRITE_ERROR", e);
            }
        }
        case "list_directory": {
            const { dir_path, show_hidden } = ListSchema.parse(args);
            try {
                const entries = await promises_1.default.readdir(dir_path, { withFileTypes: true });
                const filtered = show_hidden ? entries : entries.filter((e) => !e.name.startsWith("."));
                const result = await Promise.all(filtered.map(async (e) => {
                    const fullPath = path_1.default.join(dir_path, e.name);
                    const stat = await promises_1.default.stat(fullPath).catch(() => null);
                    return {
                        name: e.name,
                        type: e.isDirectory() ? "dir" : "file",
                        size: stat?.size ?? null,
                        modified: stat?.mtime.toISOString() ?? null,
                    };
                }));
                return (0, errors_js_1.safeJson)(result);
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Cannot list directory: ${dir_path}`, "DIR_LIST_ERROR", e);
            }
        }
        case "search_in_files": {
            const { pattern, glob: globPattern, base_dir, case_sensitive, max_results } = SearchSchema.parse(args);
            const regex = new RegExp(pattern, case_sensitive ? "g" : "gi");
            const files = await (0, fast_glob_1.default)(globPattern, {
                cwd: base_dir,
                absolute: true,
                ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
            });
            const results = [];
            for (const file of files) {
                if (results.length >= max_results)
                    break;
                try {
                    const content = await promises_1.default.readFile(file, "utf-8");
                    const lines = content.split("\n");
                    lines.forEach((line, idx) => {
                        if (regex.test(line) && results.length < max_results) {
                            results.push({ file, line: idx + 1, content: line.trim() });
                        }
                        regex.lastIndex = 0;
                    });
                }
                catch {
                    // skip binary / unreadable files
                }
            }
            if (results.length === 0)
                return `No matches found for: ${pattern}`;
            return (0, errors_js_1.safeJson)(results);
        }
        case "get_file_info": {
            const { file_path } = FileInfoSchema.parse(args);
            try {
                const stat = await promises_1.default.stat(file_path);
                return (0, errors_js_1.safeJson)({
                    path: path_1.default.resolve(file_path),
                    size_bytes: stat.size,
                    size_human: formatBytes(stat.size),
                    type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
                    created: stat.birthtime.toISOString(),
                    modified: stat.mtime.toISOString(),
                    accessed: stat.atime.toISOString(),
                    readonly: !(stat.mode & 0o200),
                });
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Cannot get info for: ${file_path}`, "FILE_INFO_ERROR", e);
            }
        }
        case "delete_file": {
            const { file_path, recursive } = DeleteSchema.parse(args);
            try {
                await promises_1.default.rm(file_path, { recursive, force: false });
                return `Deleted: ${file_path}`;
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Cannot delete: ${file_path}`, "FILE_DELETE_ERROR", e);
            }
        }
        default:
            throw new errors_js_1.ToolError(`Unknown file tool: ${name}`, "UNKNOWN_TOOL");
    }
}
function formatBytes(bytes) {
    if (bytes === 0)
        return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
//# sourceMappingURL=files.js.map