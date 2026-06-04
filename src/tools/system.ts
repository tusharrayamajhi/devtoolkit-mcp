import { exec, spawn } from "child_process";
import { promisify } from "util";
import os from "os";
import net from "net";
import { z } from "zod";
import { ToolError, safeJson } from "../utils/errors.js";

const execAsync = promisify(exec);

// Registry of background processes: pid → { output buffer, process }
const bgProcesses = new Map<number, { output: string; cmd: string; cwd: string }>();

export const systemToolDefinitions = [
  {
    name: "get_system_info",
    description: "Get detailed system information: OS, CPU, memory, architecture, hostname.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_env",
    description: "Read environment variables. Returns all env vars or specific ones by name.",
    inputSchema: {
      type: "object",
      properties: {
        keys: { type: "array", items: { type: "string" }, description: "Specific keys to retrieve" },
      },
    },
  },
  {
    name: "run_command",
    description:
      "Execute a shell command and WAIT until it finishes. Returns full stdout/stderr. " +
      "Use this for: npm install, npm create vite, npx, pip install, tsc, git, etc. " +
      "Do NOT use for long-running servers — use run_background instead.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run" },
        cwd: { type: "string", description: "Working directory (default: current)" },
        timeout_ms: { type: "number", description: "Timeout ms (default: 60000). Use 180000 for npm install, 120000 for npm create vite." },
      },
      required: ["command"],
    },
  },
  {
    name: "run_background",
    description:
      "Start a long-running process (dev servers, watch processes) in the background. " +
      "Captures output for a few seconds then detaches — process keeps running. " +
      "Returns PID + initial output so you can check for startup errors. " +
      "Use for: npm run dev, python manage.py runserver, uvicorn, nodemon, etc.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to run in background" },
        cwd: { type: "string", description: "Working directory" },
        capture_seconds: { type: "number", description: "Seconds to capture output before detaching (default: 6)" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_process_output",
    description: "Read the latest buffered output from a background process started with run_background.",
    inputSchema: {
      type: "object",
      properties: {
        pid: { type: "number", description: "Process ID returned by run_background" },
      },
      required: ["pid"],
    },
  },
  {
    name: "check_port",
    description:
      "Check if a TCP port is open/listening on localhost. " +
      "Use after run_background to confirm a dev server started successfully. " +
      "Returns true if something is listening on that port.",
    inputSchema: {
      type: "object",
      properties: {
        port: { type: "number", description: "Port number to check (e.g. 5173, 3000, 8000)" },
        timeout_ms: { type: "number", description: "How long to wait in ms (default: 2000)" },
      },
      required: ["port"],
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
    inputSchema: { type: "object", properties: {} },
  },
];

// ── Allowlist ────────────────────────────────────────────────────────────────
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

// ── Schemas ──────────────────────────────────────────────────────────────────
const RunSchema = z.object({
  command: z.string(),
  cwd: z.string().nullish().transform(v => v ?? "."),
  timeout_ms: z.number().nullish().transform(v => v ?? 60000),
});

const BgSchema = z.object({
  command: z.string(),
  cwd: z.string().nullish().transform(v => v ?? "."),
  capture_seconds: z.number().nullish().transform(v => v ?? 6),
});

const ReadPidSchema = z.object({ pid: z.number() });

const CheckPortSchema = z.object({
  port: z.number(),
  timeout_ms: z.number().nullish().transform(v => v ?? 2000),
});

const EnvSchema = z.object({ keys: z.array(z.string()).nullish() });

const ProcessSchema = z.object({
  filter: z.string().nullish(),
  limit: z.number().nullish().transform(v => v ?? 20),
});

const DiskSchema = z.object({
  path: z.string().nullish().transform(v => v ?? "."),
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function isCommandAllowed(command: string): boolean {
  const cmd = command.trim().split(/\s+/)[0];
  return ALLOWED_COMMANDS.some(
    (a) => cmd === a || cmd.endsWith(`/${a}`) || cmd.endsWith(`\\${a}`)
  );
}

function maskSensitiveValue(key: string, value: string): string {
  if (SENSITIVE_ENV_KEYS.test(key)) {
    return value.length > 4 ? `${value.slice(0, 4)}${"*".repeat(Math.min(8, value.length - 4))}` : "****";
  }
  return value;
}

function isPortOpen(port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.connect(port, "127.0.0.1");
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function handleSystemTool(name: string, args: unknown): Promise<string> {
  switch (name) {

    case "get_system_info": {
      const cpus = os.cpus();
      return safeJson({
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        os_type: os.type(),
        os_release: os.release(),
        node_version: process.version,
        uptime_hours: (os.uptime() / 3600).toFixed(2),
        memory: {
          total_gb: (os.totalmem() / 1e9).toFixed(2),
          free_gb: (os.freemem() / 1e9).toFixed(2),
          used_percent: `${(((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1)}%`,
        },
        cpu: {
          model: cpus[0]?.model ?? "Unknown",
          cores: cpus.length,
          speed_mhz: cpus[0]?.speed ?? 0,
        },
        home_dir: os.homedir(),
        temp_dir: os.tmpdir(),
      });
    }

    case "get_env": {
      const { keys } = EnvSchema.parse(args);
      const env = process.env;
      if (keys && keys.length > 0) {
        return safeJson(Object.fromEntries(
          keys.map((k) => [k, env[k] !== undefined ? maskSensitiveValue(k, env[k]!) : null])
        ));
      }
      return safeJson(Object.fromEntries(
        Object.entries(env).map(([k, v]) => [k, v !== undefined ? maskSensitiveValue(k, v) : null])
      ));
    }

    case "run_command": {
      const { command, cwd, timeout_ms } = RunSchema.parse(args);
      if (!isCommandAllowed(command)) {
        throw new ToolError(
          `Command not in allowlist: "${command.split(" ")[0]}". Allowed: ${ALLOWED_COMMANDS.join(", ")}`,
          "COMMAND_BLOCKED"
        );
      }
      try {
        const start = Date.now();
        const { stdout, stderr } = await execAsync(command, { cwd, timeout: timeout_ms, maxBuffer: 100 * 1024 * 1024 });
        const elapsed = Date.now() - start;
        return safeJson({ command, stdout: stdout.trim(), stderr: stderr.trim(), success: true, elapsed_ms: elapsed });
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; message?: string; killed?: boolean };
        if (err.killed) {
          return safeJson({ command, stdout: err.stdout?.trim() ?? "", stderr: `TIMEOUT after ${timeout_ms}ms`, success: false });
        }
        return safeJson({ command, stdout: err.stdout?.trim() ?? "", stderr: err.stderr?.trim() ?? err.message ?? String(e), success: false });
      }
    }

    case "run_background": {
      const { command, cwd, capture_seconds } = BgSchema.parse(args);
      if (!isCommandAllowed(command)) {
        throw new ToolError(`Command not allowed: "${command.split(" ")[0]}"`, "COMMAND_BLOCKED");
      }

      return new Promise((resolve) => {
        let output = "";

        const child = spawn(command, {
          cwd,
          shell: true,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        const pid = child.pid ?? 0;
        bgProcesses.set(pid, { output: "", cmd: command, cwd });

        child.stdout?.on("data", (d: Buffer) => {
          const chunk = d.toString();
          output += chunk;
          const entry = bgProcesses.get(pid);
          if (entry) entry.output += chunk;
        });

        child.stderr?.on("data", (d: Buffer) => {
          const chunk = d.toString();
          output += chunk;
          const entry = bgProcesses.get(pid);
          if (entry) entry.output += chunk;
        });

        child.on("error", (err) => {
          output += `\nProcess error: ${err.message}`;
        });

        // Capture for N seconds then detach
        setTimeout(() => {
          child.unref();
          resolve(safeJson({
            pid,
            command,
            cwd,
            status: "running",
            initial_output: output.trim().slice(-3000) || "(no output yet)",
            message: `Process started with PID ${pid}. Use check_port to verify server started, or read_process_output to see more output.`,
          }));
        }, capture_seconds * 1000);
      });
    }

    case "read_process_output": {
      const { pid } = ReadPidSchema.parse(args);
      const entry = bgProcesses.get(pid);
      if (!entry) {
        return safeJson({ pid, error: "No background process found with this PID. It may have exited or PID is wrong." });
      }
      const output = entry.output.slice(-5000); // last 5KB
      return safeJson({ pid, command: entry.cmd, output: output || "(no new output)" });
    }

    case "check_port": {
      const { port, timeout_ms } = CheckPortSchema.parse(args);
      const open = await isPortOpen(port, timeout_ms);
      return safeJson({
        port,
        listening: open,
        message: open
          ? `Port ${port} is OPEN — server is running at http://localhost:${port}`
          : `Port ${port} is not yet listening. Server may still be starting up.`,
      });
    }

    case "list_processes": {
      const { filter, limit } = ProcessSchema.parse(args);
      try {
        const isWindows = os.platform() === "win32";
        const cmd = isWindows ? `tasklist /FO CSV /NH` : `ps aux --sort=-%cpu | head -${(limit ?? 20) + 1}`;
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
          return safeJson(filtered.slice(0, limit ?? 20));
        } else {
          const lines = stdout.trim().split("\n").slice(1);
          const processes = lines.map((line) => {
            const parts = line.trim().split(/\s+/);
            return { user: parts[0], pid: parts[1], cpu: `${parts[2]}%`, mem: `${parts[3]}%`, command: parts.slice(10).join(" ") };
          });
          const filtered = filter
            ? processes.filter((p) => p.command.toLowerCase().includes(filter.toLowerCase()))
            : processes;
          return safeJson(filtered.slice(0, limit ?? 20));
        }
      } catch (e) {
        throw new ToolError("Failed to list processes", "PROCESS_LIST_ERROR", e);
      }
    }

    case "get_disk_usage": {
      const { path: targetPath } = DiskSchema.parse(args);
      try {
        const isWindows = os.platform() === "win32";
        const cmd = isWindows ? `dir "${targetPath}" /-c /s | findstr "File(s)"` : `df -h "${targetPath}"`;
        const { stdout } = await execAsync(cmd, { timeout: 10000 });
        return safeJson({ path: targetPath, output: stdout.trim() });
      } catch (e) {
        throw new ToolError(`Failed to get disk usage for: ${targetPath}`, "DISK_USAGE_ERROR", e);
      }
    }

    case "get_network_info": {
      const interfaces = os.networkInterfaces();
      return safeJson(Object.entries(interfaces).map(([name, addrs]) => ({
        interface: name,
        addresses: (addrs ?? []).map((a) => ({
          address: a.address, family: a.family, internal: a.internal, mac: a.mac, netmask: a.netmask,
        })),
      })));
    }

    default:
      throw new ToolError(`Unknown system tool: ${name}`, "UNKNOWN_TOOL");
  }
}
