"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeToolDefinitions = void 0;
exports.handleCodeTool = handleCodeTool;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const fast_glob_1 = __importDefault(require("fast-glob"));
const zod_1 = require("zod");
const errors_js_1 = require("../utils/errors.js");
exports.codeToolDefinitions = [
    {
        name: "analyze_complexity",
        description: "Analyze code complexity: count functions, classes, lines, nesting depth, and cyclomatic complexity estimate.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Path to the source file" },
            },
            required: ["file_path"],
        },
    },
    {
        name: "find_todos",
        description: "Find all TODO, FIXME, HACK, NOTE, and XXX comments in files.",
        inputSchema: {
            type: "object",
            properties: {
                dir_path: { type: "string", description: "Directory to search in" },
                glob: { type: "string", description: "File glob pattern (default: **/*.{ts,js,py,go,rs,java})" },
                tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Comment tags to search for (default: TODO, FIXME, HACK, NOTE, XXX)",
                },
            },
        },
    },
    {
        name: "count_lines",
        description: "Count total lines, blank lines, comment lines, and code lines in a file or directory.",
        inputSchema: {
            type: "object",
            properties: {
                target: { type: "string", description: "File or directory path" },
                glob: { type: "string", description: "Glob pattern when target is a directory" },
            },
            required: ["target"],
        },
    },
    {
        name: "detect_language",
        description: "Detect the programming language of a file.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Path to the file" },
            },
            required: ["file_path"],
        },
    },
    {
        name: "find_duplicates",
        description: "Find duplicate or near-duplicate code blocks across files.",
        inputSchema: {
            type: "object",
            properties: {
                dir_path: { type: "string", description: "Directory to search" },
                glob: { type: "string", description: "File glob pattern" },
                min_lines: { type: "number", description: "Minimum block size to consider (default: 5)" },
            },
        },
    },
    {
        name: "get_imports",
        description: "Extract all import/require statements from a source file.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Path to the source file" },
            },
            required: ["file_path"],
        },
    },
];
const ComplexitySchema = zod_1.z.object({ file_path: zod_1.z.string() });
const TodoSchema = zod_1.z.object({
    dir_path: zod_1.z.string().optional().default("."),
    glob: zod_1.z.string().optional().default("**/*.{ts,tsx,js,jsx,py,go,rs,java,cpp,c}"),
    tags: zod_1.z.array(zod_1.z.string()).optional().default(["TODO", "FIXME", "HACK", "NOTE", "XXX"]),
});
const CountSchema = zod_1.z.object({
    target: zod_1.z.string(),
    glob: zod_1.z.string().optional().default("**/*.{ts,tsx,js,jsx,py,go,rs,java}"),
});
const LangSchema = zod_1.z.object({ file_path: zod_1.z.string() });
const DupSchema = zod_1.z.object({
    dir_path: zod_1.z.string().optional().default("."),
    glob: zod_1.z.string().optional().default("**/*.{ts,tsx,js,jsx,py}"),
    min_lines: zod_1.z.number().optional().default(5),
});
const ImportsSchema = zod_1.z.object({ file_path: zod_1.z.string() });
const LANGUAGE_MAP = {
    ts: "TypeScript", tsx: "TypeScript (React)", js: "JavaScript", jsx: "JavaScript (React)",
    py: "Python", go: "Go", rs: "Rust", java: "Java", cpp: "C++", c: "C",
    cs: "C#", rb: "Ruby", php: "PHP", swift: "Swift", kt: "Kotlin",
    scala: "Scala", r: "R", sh: "Shell", bash: "Bash", zsh: "Zsh",
    html: "HTML", css: "CSS", scss: "SCSS", sass: "SASS", less: "LESS",
    json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
    md: "Markdown", sql: "SQL", graphql: "GraphQL", proto: "Protobuf",
};
const COMMENT_PATTERNS = {
    single: [/^\s*\/\//, /^\s*#/, /^\s*--/, /^\s*;/],
    multi_start: [/^\s*\/\*/, /^\s*"""/],
};
function detectLangFromPath(filePath) {
    const ext = path_1.default.extname(filePath).slice(1).toLowerCase();
    return LANGUAGE_MAP[ext] ?? `Unknown (.${ext})`;
}
function countComplexity(content) {
    const lines = content.split("\n");
    let functions = 0, classes = 0, ifStatements = 0, loops = 0;
    let currentNesting = 0, maxNesting = 0;
    for (const line of lines) {
        const l = line.trim();
        if (/\bfunction\b|\b=>\s*{|\bdef\b|\bfn\b/.test(l))
            functions++;
        if (/\bclass\b/.test(l))
            classes++;
        if (/\bif\b/.test(l))
            ifStatements++;
        if (/\bfor\b|\bwhile\b|\bforeach\b/.test(l))
            loops++;
        currentNesting += (l.match(/{/g) ?? []).length;
        currentNesting -= (l.match(/}/g) ?? []).length;
        currentNesting = Math.max(0, currentNesting);
        maxNesting = Math.max(maxNesting, currentNesting);
    }
    return {
        functions,
        classes,
        ifStatements,
        loops,
        maxNesting,
        cyclomaticEstimate: 1 + ifStatements + loops,
    };
}
async function handleCodeTool(name, args) {
    switch (name) {
        case "analyze_complexity": {
            const { file_path } = ComplexitySchema.parse(args);
            try {
                const content = await promises_1.default.readFile(file_path, "utf-8");
                const lines = content.split("\n");
                const complexity = countComplexity(content);
                const lang = detectLangFromPath(file_path);
                return (0, errors_js_1.safeJson)({
                    file: path_1.default.resolve(file_path),
                    language: lang,
                    total_lines: lines.length,
                    blank_lines: lines.filter((l) => l.trim() === "").length,
                    ...complexity,
                    complexity_rating: complexity.cyclomaticEstimate <= 10
                        ? "Low (good)"
                        : complexity.cyclomaticEstimate <= 20
                            ? "Medium (acceptable)"
                            : complexity.cyclomaticEstimate <= 50
                                ? "High (consider refactoring)"
                                : "Very High (refactor strongly recommended)",
                });
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Cannot analyze: ${file_path}`, "COMPLEXITY_ERROR", e);
            }
        }
        case "find_todos": {
            const { dir_path, glob: globPattern, tags } = TodoSchema.parse(args);
            const tagPattern = new RegExp(`(${tags.join("|")})[:\\s](.*)`, "i");
            const files = await (0, fast_glob_1.default)(globPattern, {
                cwd: dir_path,
                absolute: true,
                ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
            });
            const results = [];
            for (const file of files) {
                try {
                    const content = await promises_1.default.readFile(file, "utf-8");
                    content.split("\n").forEach((line, idx) => {
                        const match = tagPattern.exec(line);
                        if (match) {
                            results.push({
                                file: path_1.default.relative(dir_path, file),
                                line: idx + 1,
                                tag: match[1].toUpperCase(),
                                message: match[2].trim(),
                            });
                        }
                    });
                }
                catch {
                    // skip unreadable files
                }
            }
            if (results.length === 0)
                return "No TODO/FIXME comments found.";
            const grouped = results.reduce((acc, r) => {
                acc[r.tag] = acc[r.tag] ?? [];
                acc[r.tag].push(r);
                return acc;
            }, {});
            return (0, errors_js_1.safeJson)({ total: results.length, by_tag: grouped });
        }
        case "count_lines": {
            const { target, glob: globPattern } = CountSchema.parse(args);
            try {
                const stat = await promises_1.default.stat(target);
                const files = stat.isDirectory()
                    ? await (0, fast_glob_1.default)(globPattern, { cwd: target, absolute: true, ignore: ["**/node_modules/**", "**/.git/**"] })
                    : [target];
                let total = 0, blank = 0, comment = 0, code = 0;
                const fileStats = [];
                for (const file of files) {
                    try {
                        const content = await promises_1.default.readFile(file, "utf-8");
                        const lines = content.split("\n");
                        let fileCode = 0;
                        lines.forEach((line) => {
                            total++;
                            const trimmed = line.trim();
                            if (trimmed === "") {
                                blank++;
                                return;
                            }
                            const isComment = COMMENT_PATTERNS.single.some((p) => p.test(trimmed));
                            if (isComment) {
                                comment++;
                                return;
                            }
                            code++;
                            fileCode++;
                        });
                        fileStats.push({ file: path_1.default.relative(target, file), total: lines.length, code: fileCode });
                    }
                    catch {
                        // skip
                    }
                }
                return (0, errors_js_1.safeJson)({
                    files_analyzed: files.length,
                    total_lines: total,
                    code_lines: code,
                    comment_lines: comment,
                    blank_lines: blank,
                    code_percentage: total > 0 ? `${((code / total) * 100).toFixed(1)}%` : "0%",
                    top_files: fileStats.sort((a, b) => b.total - a.total).slice(0, 10),
                });
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Cannot count lines for: ${target}`, "COUNT_LINES_ERROR", e);
            }
        }
        case "detect_language": {
            const { file_path } = LangSchema.parse(args);
            try {
                const content = await promises_1.default.readFile(file_path, "utf-8").catch(() => "");
                const ext = path_1.default.extname(file_path).slice(1).toLowerCase();
                const language = LANGUAGE_MAP[ext] ?? "Unknown";
                const firstLine = content.split("\n")[0] ?? "";
                let shebang = null;
                if (firstLine.startsWith("#!"))
                    shebang = firstLine;
                return (0, errors_js_1.safeJson)({
                    file: file_path,
                    extension: `.${ext}`,
                    language,
                    shebang,
                    confidence: LANGUAGE_MAP[ext] ? "high" : "low",
                });
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Cannot detect language for: ${file_path}`, "LANG_DETECT_ERROR", e);
            }
        }
        case "find_duplicates": {
            const { dir_path, glob: globPattern, min_lines } = DupSchema.parse(args);
            const files = await (0, fast_glob_1.default)(globPattern, {
                cwd: dir_path,
                absolute: true,
                ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
            });
            const blockMap = new Map();
            for (const file of files) {
                try {
                    const content = await promises_1.default.readFile(file, "utf-8");
                    const lines = content.split("\n").map((l) => l.trim()).filter((l) => l);
                    for (let i = 0; i <= lines.length - min_lines; i++) {
                        const block = lines.slice(i, i + min_lines).join("\n");
                        if (block.length < 50)
                            continue; // skip trivial blocks
                        if (!blockMap.has(block))
                            blockMap.set(block, []);
                        blockMap.get(block).push({ file: path_1.default.relative(dir_path, file), startLine: i + 1 });
                    }
                }
                catch {
                    // skip
                }
            }
            const duplicates = Array.from(blockMap.entries())
                .filter(([, locs]) => locs.length > 1)
                .map(([block, locations]) => ({
                block_preview: block.split("\n").slice(0, 3).join(" | "),
                occurrences: locations.length,
                locations,
            }))
                .slice(0, 20);
            if (duplicates.length === 0)
                return "No duplicate blocks found.";
            return (0, errors_js_1.safeJson)({ duplicate_blocks_found: duplicates.length, duplicates });
        }
        case "get_imports": {
            const { file_path } = ImportsSchema.parse(args);
            try {
                const content = await promises_1.default.readFile(file_path, "utf-8");
                const lines = content.split("\n");
                const imports = [];
                const importPatterns = [
                    { regex: /^import\s+.*?\s+from\s+['"](.+?)['"]/, type: "esm" },
                    { regex: /require\(['"](.+?)['"]\)/, type: "cjs" },
                    { regex: /^from\s+['"]?(\S+)['"]?\s+import/, type: "python" },
                    { regex: /^import\s+['"](.+?)['"]/, type: "go" },
                    { regex: /^use\s+(\S+);/, type: "rust" },
                ];
                lines.forEach((line, idx) => {
                    for (const { regex } of importPatterns) {
                        const match = regex.exec(line.trim());
                        if (match) {
                            imports.push({
                                line: idx + 1,
                                statement: line.trim(),
                                module: match[1],
                            });
                            break;
                        }
                    }
                });
                const external = imports.filter((i) => !i.module.startsWith("."));
                const internal = imports.filter((i) => i.module.startsWith("."));
                return (0, errors_js_1.safeJson)({
                    total: imports.length,
                    external_count: external.length,
                    internal_count: internal.length,
                    external_modules: [...new Set(external.map((i) => i.module))],
                    internal_modules: internal.map((i) => ({ line: i.line, path: i.module })),
                });
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Cannot get imports for: ${file_path}`, "IMPORTS_ERROR", e);
            }
        }
        default:
            throw new errors_js_1.ToolError(`Unknown code tool: ${name}`, "UNKNOWN_TOOL");
    }
}
//# sourceMappingURL=code-analysis.js.map