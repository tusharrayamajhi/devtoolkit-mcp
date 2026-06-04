"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemToolDefinitions = void 0;
exports.handleSystemTool = handleSystemTool;
const child_process_1 = require("child_process");
const util_1 = require("util");
const os_1 = __importDefault(require("os"));
const zod_1 = require("zod");
const errors_js_1 = require("../utils/errors.js");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
exports.systemToolDefinitions = [
    {
        name: "get_system_info",
        description: "Get detailed system information: OS, CPU, memory, architecture, hostname.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "get_env",
        description: "Read environment variables. Returns all env vars or specific ones by name.",
        inputSchema: {
            type: "object",
            properties: {
                keys: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific keys to retrieve (omit for all, sensitive values are masked)",
                },
            },
        },
    },
    {
        name: "run_command",
        description: "Execute a shell command safely. Commands are validated against an allowlist. Use for build tools, linters, formatters.",
        inputSchema: {
            type: "object",
            properties: {
                command: { type: "string", description: "The shell command to run" },
                cwd: { type: "string", description: "Working directory (default: current)" },
                timeout_ms: { type: "number", description: "Timeout in ms (default: 30000)" },
            },
            required: ["command"],
        },
    },
    {
        name: "list_processes",
        description: "List running processes with their PID, name, and CPU/memory usage.",
        inputSchema: {
            type: "object",
            properties: {
                filter: { type: "string", description: "Filter processes by name (optional)" },
                limit: { type: "number", description: "Max processes to return (default: 20)" },
            },
        },
    },
    {
        name: "get_disk_usage",
        description: "Get disk usage for a directory or the whole system.",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path to check (default: current directory)" },
            },
        },
    },
    {
        name: "get_network_info",
        description: "Get network interfaces and their IP addresses.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
];
// Allowlist of safe command prefixes for run_command
const ALLOWED_COMMANDS = [
    "npm", "npx", "yarn", "pnpm", "node",
    "python", "python3", "pip", "pip3",
    "go", "cargo", "rustc",
    "git",
    "tsc", "tsx", "eslint", "prettier",
    "ls", "dir", "pwd", "echo", "cat",
    "curl", "wget",
    "docker", "docker-compose",
    "make", "cmake",
    "java", "mvn", "gradle",
    "dotnet",
    "ruby", "gem", "bundle",
    "php", "composer",
];
const SENSITIVE_ENV_KEYS = /secret|password|token|key|auth|credential|private|api_key/i;
const RunSchema = zod_1.z.object({
    command: zod_1.z.string(),
    cwd: zod_1.z.string().optional().default("."),
    timeout_ms: zod_1.z.number().optional().default(30000),
});
const EnvSchema = zod_1.z.object({
    keys: zod_1.z.array(zod_1.z.string()).optional(),
});
const ProcessSchema = zod_1.z.object({
    filter: zod_1.z.string().optional(),
    limit: zod_1.z.number().optional().default(20),
});
const DiskSchema = zod_1.z.object({
    path: zod_1.z.string().optional().default("."),
});
function isCommandAllowed(command) {
    const cmd = command.trim().split(/\s+/)[0];
    return ALLOWED_COMMANDS.some((allowed) => cmd === allowed || cmd.endsWith(`/${allowed}`) || cmd.endsWith(`\\${allowed}`));
}
function maskSensitiveValue(key, value) {
    if (SENSITIVE_ENV_KEYS.test(key)) {
        return value.length > 4 ? `${value.slice(0, 4)}${"*".repeat(Math.min(8, value.length - 4))}` : "****";
    }
    return value;
}
async function handleSystemTool(name, args) {
    switch (name) {
        case "get_system_info": {
            const cpus = os_1.default.cpus();
            return (0, errors_js_1.safeJson)({
                hostname: os_1.default.hostname(),
                platform: os_1.default.platform(),
                arch: os_1.default.arch(),
                os_type: os_1.default.type(),
                os_release: os_1.default.release(),
                node_version: process.version,
                uptime_hours: (os_1.default.uptime() / 3600).toFixed(2),
                memory: {
                    total_gb: (os_1.default.totalmem() / 1e9).toFixed(2),
                    free_gb: (os_1.default.freemem() / 1e9).toFixed(2),
                    used_percent: `${(((os_1.default.totalmem() - os_1.default.freemem()) / os_1.default.totalmem()) * 100).toFixed(1)}%`,
                },
                cpu: {
                    model: cpus[0]?.model ?? "Unknown",
                    cores: cpus.length,
                    speed_mhz: cpus[0]?.speed ?? 0,
                },
                home_dir: os_1.default.homedir(),
                temp_dir: os_1.default.tmpdir(),
            });
        }
        case "get_env": {
            const { keys } = EnvSchema.parse(args);
            const env = process.env;
            if (keys && keys.length > 0) {
                const result = Object.fromEntries(keys.map((k) => [k, env[k] !== undefined ? maskSensitiveValue(k, env[k]) : null]));
                return (0, errors_js_1.safeJson)(result);
            }
            // Return all, but mask sensitive values
            const result = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v !== undefined ? maskSensitiveValue(k, v) : null]));
            return (0, errors_js_1.safeJson)(result);
        }
        case "run_command": {
            const { command, cwd, timeout_ms } = RunSchema.parse(args);
            if (!isCommandAllowed(command)) {
                throw new errors_js_1.ToolError(`Command not in allowlist: "${command.split(" ")[0]}". Allowed: ${ALLOWED_COMMANDS.join(", ")}`, "COMMAND_BLOCKED");
            }
            try {
                const { stdout, stderr } = await execAsync(command, { cwd, timeout: timeout_ms, maxBuffer: 100 * 1024 * 1024 });
                return (0, errors_js_1.safeJson)({
                    command,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    success: true,
                });
            }
            catch (e) {
                const err = e;
                return (0, errors_js_1.safeJson)({
                    command,
                    stdout: err.stdout?.trim() ?? "",
                    stderr: err.stderr?.trim() ?? err.message ?? String(e),
                    success: false,
                });
            }
        }
        case "list_processes": {
            const { filter, limit } = ProcessSchema.parse(args);
            try {
                const isWindows = os_1.default.platform() === "win32";
                const cmd = isWindows
                    ? `tasklist /FO CSV /NH`
                    : `ps aux --sort=-%cpu | head -${(limit ?? 20) + 1}`;
                const { stdout } = await execAsync(cmd, { timeout: 10000 });
                if (isWindows) {
                    const lines = stdout.trim().split("\n").slice(0, limit ?? 20);
                    const processes = lines.map((line) => {
                        const parts = line.split('","').map((p) => p.replace(/"/g, "").trim());
                        return { name: parts[0], pid: parts[1], session: parts[2], mem_kb: parts[4] };
                    });
                    const filtered = filter
                        ? processes.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
                        : processes;
                    return (0, errors_js_1.safeJson)(filtered.slice(0, limit ?? 20));
                }
                else {
                    const lines = stdout.trim().split("\n").slice(1);
                    const processes = lines.map((line) => {
                        const parts = line.trim().split(/\s+/);
                        return {
                            user: parts[0], pid: parts[1], cpu: `${parts[2]}%`,
                            mem: `${parts[3]}%`, command: parts.slice(10).join(" "),
                        };
                    });
                    const filtered = filter
                        ? processes.filter((p) => p.command.toLowerCase().includes(filter.toLowerCase()))
                        : processes;
                    return (0, errors_js_1.safeJson)(filtered.slice(0, limit ?? 20));
                }
            }
            catch (e) {
                throw new errors_js_1.ToolError("Failed to list processes", "PROCESS_LIST_ERROR", e);
            }
        }
        case "get_disk_usage": {
            const { path: targetPath } = DiskSchema.parse(args);
            try {
                const isWindows = os_1.default.platform() === "win32";
                const cmd = isWindows
                    ? `dir "${targetPath}" /-c /s | findstr "File(s)"`
                    : `df -h "${targetPath}"`;
                const { stdout } = await execAsync(cmd, { timeout: 10000 });
                return (0, errors_js_1.safeJson)({ path: targetPath, output: stdout.trim() });
            }
            catch (e) {
                throw new errors_js_1.ToolError(`Failed to get disk usage for: ${targetPath}`, "DISK_USAGE_ERROR", e);
            }
        }
        case "get_network_info": {
            const interfaces = os_1.default.networkInterfaces();
            const result = Object.entries(interfaces).map(([name, addrs]) => ({
                interface: name,
                addresses: (addrs ?? []).map((a) => ({
                    address: a.address,
                    family: a.family,
                    internal: a.internal,
                    mac: a.mac,
                    netmask: a.netmask,
                })),
            }));
            return (0, errors_js_1.safeJson)(result);
        }
        default:
            throw new errors_js_1.ToolError(`Unknown system tool: ${name}`, "UNKNOWN_TOOL");
    }
}
//# sourceMappingURL=system.js.map