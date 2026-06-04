#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SetLevelRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Minimal interface for the low-level transport layer — avoids referencing
// the deprecated `Server` class while still allowing elicitation/sampling.
interface RawServer {
  request(req: { method: string; params: unknown }, schema: unknown): Promise<unknown>;
  setRequestHandler(schema: unknown, handler: (req: { params: unknown }) => Promise<unknown>): void;
  notification(notif: { method: string; params?: unknown }): Promise<void>;
}

import { handleFileTool } from "./tools/files.js";
import { handleGitTool } from "./tools/git.js";
import { handleCodeTool } from "./tools/code-analysis.js";
import { handleHttpTool } from "./tools/http.js";
import { handleSystemTool } from "./tools/system.js";
import { formatError } from "./utils/errors.js";
import { sendLog, setLogLevel, LogLevel } from "./utils/logger.js";
import { registerResourceHandlers, notifyResourceUpdated } from "./resources.js";

// ── Server ────────────────────────────────────────────────────────────────────

const server = new McpServer(
  { name: "devtoolkit-mcp", version: "1.0.0" },
  {
    capabilities: {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      logging: {},
      completions: {},
    },
  }
);

// ── Resources ─────────────────────────────────────────────────────────────────
registerResourceHandlers(server);

// Cast once — keeps all low-level calls in one place, no repeated suppressions
const rawServer = server.server as unknown as RawServer;

// ── Logging level control ─────────────────────────────────────────────────────
rawServer.setRequestHandler(SetLevelRequestSchema, async (req) => {
  const { level } = req.params as { level: LogLevel };
  setLogLevel(level);
  await sendLog(server, "info", { message: `Log level → ${level}` }, "devtoolkit");
  return {};
});

// ── Elicitation helper ────────────────────────────────────────────────────────
async function elicit(
  message: string,
  schema: Record<string, unknown>
): Promise<{ action: "accept" | "decline" | "cancel"; content?: Record<string, unknown> }> {
  try {
    const res = await rawServer.request(
      { method: "elicitation/create", params: { message, requestedSchema: schema } },
      {}
    );
    return res as { action: "accept" | "decline" | "cancel"; content?: Record<string, unknown> };
  } catch {
    return { action: "accept" }; // graceful fallback if client doesn't support elicitation
  }
}

// ── Sampling helper ───────────────────────────────────────────────────────────
export async function sampleFromClient(prompt: string, systemPrompt?: string): Promise<string> {
  try {
    const res = await rawServer.request(
      {
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
      {}
    );
    const r = res as { content?: { text?: string } };
    return r.content?.text ?? "(no response)";
  } catch {
    return "(sampling not supported by this client)";
  }
}

// ── Convenience wrapper ───────────────────────────────────────────────────────
function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function err(e: unknown) {
  return { content: [{ type: "text" as const, text: `Error: ${formatError(e)}` }], isError: true as const };
}

// ── FILE TOOLS ────────────────────────────────────────────────────────────────

server.tool("read_file",
  "Read the contents of a file. Supports optional line range.",
  {
    file_path: z.string().describe("Absolute or relative path to the file"),
    start_line: z.number().optional().describe("Start line (1-indexed)"),
    end_line: z.number().optional().describe("End line (1-indexed)"),
  },
  async (args) => {
    await sendLog(server, "debug", { tool: "read_file", path: args.file_path }, "tools");
    try { return ok(await handleFileTool("read_file", args)); } catch (e) { return err(e); }
  }
);

server.tool("write_file",
  "Write content to a file, creating it if needed. Asks for confirmation if file already exists.",
  {
    file_path: z.string().describe("Path to write the file"),
    content: z.string().describe("Content to write"),
    append: z.boolean().optional().describe("Append instead of overwrite (default: false)"),
  },
  async (args) => {
    await sendLog(server, "info", { tool: "write_file", path: args.file_path }, "tools");
    const { existsSync } = await import("fs");
    if (existsSync(args.file_path) && !args.append) {
      const res = await elicit(`File already exists: "${args.file_path}". Overwrite it?`, {
        type: "object",
        properties: {
          confirm: { type: "boolean", title: "Overwrite file?", description: `Replaces all content in ${args.file_path}`, default: false },
        },
        required: ["confirm"],
      });
      if (res.action !== "accept" || !res.content?.["confirm"]) {
        return ok(`Cancelled: file not overwritten (${args.file_path})`);
      }
    }
    try {
      const result = await handleFileTool("write_file", args);
      await notifyResourceUpdated(server, args.file_path);
      return ok(result);
    } catch (e) { return err(e); }
  }
);

server.tool("list_directory",
  "List files and directories at a given path with metadata.",
  {
    dir_path: z.string().describe("Path to the directory"),
    show_hidden: z.boolean().optional().describe("Show hidden files (default: false)"),
  },
  async (args) => {
    try { return ok(await handleFileTool("list_directory", args)); } catch (e) { return err(e); }
  }
);

server.tool("search_in_files",
  "Search for a text pattern across files using glob patterns.",
  {
    pattern: z.string().describe("Text or regex pattern to search for"),
    glob: z.string().optional().describe("Glob pattern for files (e.g. '**/*.ts')"),
    base_dir: z.string().optional().describe("Base directory to search in"),
    case_sensitive: z.boolean().optional().describe("Case sensitive (default: true)"),
    max_results: z.number().optional().describe("Max results to return (default: 50)"),
  },
  async (args) => {
    try { return ok(await handleFileTool("search_in_files", args)); } catch (e) { return err(e); }
  }
);

server.tool("get_file_info",
  "Get metadata for a file: size, timestamps, permissions.",
  { file_path: z.string().describe("Path to the file") },
  async (args) => {
    try { return ok(await handleFileTool("get_file_info", args)); } catch (e) { return err(e); }
  }
);

server.tool("delete_file",
  "Delete a file or directory. Always asks for user confirmation first.",
  {
    file_path: z.string().describe("Path to the file or directory to delete"),
    recursive: z.boolean().optional().describe("Recursively delete directories (default: false)"),
  },
  async (args) => {
    await sendLog(server, "warning", { tool: "delete_file", path: args.file_path }, "tools");
    const res = await elicit(`Delete "${args.file_path}"? This cannot be undone.`, {
      type: "object",
      properties: {
        confirm: { type: "boolean", title: "Confirm delete", description: "Permanently delete the file", default: false },
        reason: { type: "string", title: "Reason (optional)", description: "Why are you deleting this?" },
      },
      required: ["confirm"],
    });
    if (res.action !== "accept" || !res.content?.["confirm"]) {
      await sendLog(server, "notice", { message: "Delete cancelled", path: args.file_path }, "elicitation");
      return ok(`Cancelled: "${args.file_path}" was NOT deleted.`);
    }
    if (res.content?.["reason"]) {
      await sendLog(server, "info", { message: "Delete confirmed", path: args.file_path, reason: res.content["reason"] }, "elicitation");
    }
    try {
      const result = await handleFileTool("delete_file", args);
      await notifyResourceUpdated(server, args.file_path);
      return ok(result);
    } catch (e) { return err(e); }
  }
);

// ── GIT TOOLS ─────────────────────────────────────────────────────────────────

server.tool("git_status",
  "Show the working tree status of a git repository.",
  { repo_path: z.string().optional().describe("Path to the git repository (default: current dir)") },
  async (args) => {
    try { return ok(await handleGitTool("git_status", args)); } catch (e) { return err(e); }
  }
);

server.tool("git_log",
  "Get the commit history for a repository.",
  {
    repo_path: z.string().optional().describe("Path to the git repository"),
    max_commits: z.number().optional().describe("Max commits to return (default: 20)"),
    branch: z.string().optional().describe("Branch name (default: current)"),
  },
  async (args) => {
    try { return ok(await handleGitTool("git_log", args)); } catch (e) { return err(e); }
  }
);

server.tool("git_diff",
  "Show diff between commits, branches, or working tree.",
  {
    repo_path: z.string().optional().describe("Path to the git repository"),
    from: z.string().optional().describe("From commit/branch"),
    to: z.string().optional().describe("To commit/branch"),
    file_path: z.string().optional().describe("Limit diff to a specific file"),
    staged: z.boolean().optional().describe("Show staged diff (default: false)"),
  },
  async (args) => {
    try { return ok(await handleGitTool("git_diff", args)); } catch (e) { return err(e); }
  }
);

server.tool("git_blame",
  "Show what revision and author last modified each line of a file.",
  {
    repo_path: z.string().optional().describe("Path to the git repository"),
    file_path: z.string().describe("File to blame"),
  },
  async (args) => {
    try { return ok(await handleGitTool("git_blame", args)); } catch (e) { return err(e); }
  }
);

server.tool("git_branches",
  "List all local and remote branches.",
  {
    repo_path: z.string().optional().describe("Path to the git repository"),
    include_remote: z.boolean().optional().describe("Include remote branches (default: true)"),
  },
  async (args) => {
    try { return ok(await handleGitTool("git_branches", args)); } catch (e) { return err(e); }
  }
);

server.tool("git_show_commit",
  "Show details and diff for a specific commit.",
  {
    repo_path: z.string().optional().describe("Path to the git repository"),
    commit_hash: z.string().describe("Commit hash or ref (e.g. HEAD, abc1234)"),
  },
  async (args) => {
    try { return ok(await handleGitTool("git_show_commit", args)); } catch (e) { return err(e); }
  }
);

// ── CODE ANALYSIS TOOLS ───────────────────────────────────────────────────────

server.tool("analyze_complexity",
  "Analyze code complexity: functions, classes, nesting depth, cyclomatic complexity.",
  { file_path: z.string().describe("Path to the source file") },
  async (args) => {
    try { return ok(await handleCodeTool("analyze_complexity", args)); } catch (e) { return err(e); }
  }
);

server.tool("find_todos",
  "Find all TODO, FIXME, HACK, NOTE, and XXX comments in files, then AI-prioritizes them by urgency.",
  {
    dir_path: z.string().optional().describe("Directory to search in"),
    glob: z.string().optional().describe("File glob pattern"),
    tags: z.array(z.string()).optional().describe("Comment tags to search for"),
  },
  async (args) => {
    try {
      const raw = await handleCodeTool("find_todos", args);
      const priority = await sampleFromClient(
        `Here are the TODO/FIXME comments found in a codebase:\n\n${raw}\n\nRank them by urgency: security issues first, then bugs, then missing features, then cleanup. For each group list the file:line and a one-line reason why it matters. Be concise.`,
        "You are a senior software engineer doing a code review. Prioritize ruthlessly."
      );
      return ok(`${raw}\n\n---\n## AI Priority Analysis\n${priority}`);
    } catch (e) { return err(e); }
  }
);

server.tool("count_lines",
  "Count total, blank, comment, and code lines in a file or directory.",
  {
    target: z.string().describe("File or directory path"),
    glob: z.string().optional().describe("Glob pattern when target is a directory"),
  },
  async (args) => {
    try { return ok(await handleCodeTool("count_lines", args)); } catch (e) { return err(e); }
  }
);

server.tool("detect_language",
  "Detect the programming language of a file.",
  { file_path: z.string().describe("Path to the file") },
  async (args) => {
    try { return ok(await handleCodeTool("detect_language", args)); } catch (e) { return err(e); }
  }
);

server.tool("find_duplicates",
  "Find duplicate or near-duplicate code blocks across files.",
  {
    dir_path: z.string().optional().describe("Directory to search"),
    glob: z.string().optional().describe("File glob pattern"),
    min_lines: z.number().optional().describe("Minimum block size (default: 5)"),
  },
  async (args) => {
    try { return ok(await handleCodeTool("find_duplicates", args)); } catch (e) { return err(e); }
  }
);

server.tool("get_imports",
  "Extract all import/require statements from a source file.",
  { file_path: z.string().describe("Path to the source file") },
  async (args) => {
    try { return ok(await handleCodeTool("get_imports", args)); } catch (e) { return err(e); }
  }
);

// ── HTTP TOOLS ────────────────────────────────────────────────────────────────

server.tool("http_request",
  "Make an HTTP request. Supports GET, POST, PUT, PATCH, DELETE with custom headers and body.",
  {
    url: z.string().url().describe("The URL to request"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]).optional().describe("HTTP method (default: GET)"),
    headers: z.record(z.string()).optional().describe("HTTP headers as key-value pairs"),
    body: z.string().optional().describe("Request body (JSON string or plain text)"),
    timeout_ms: z.number().optional().describe("Request timeout in ms (default: 10000)"),
    follow_redirects: z.boolean().optional().describe("Follow redirects (default: true)"),
  },
  async (args) => {
    await sendLog(server, "info", { tool: "http_request", url: args.url, method: args.method ?? "GET" }, "tools");
    try { return ok(await handleHttpTool("http_request", args)); } catch (e) { return err(e); }
  }
);

server.tool("fetch_json",
  "Fetch JSON from a URL and return it formatted. Supports dot-path extraction.",
  {
    url: z.string().url().describe("URL to fetch JSON from"),
    headers: z.record(z.string()).optional().describe("Optional HTTP headers"),
    json_path: z.string().optional().describe("Dot-notation path to extract (e.g. 'data.users')"),
  },
  async (args) => {
    try { return ok(await handleHttpTool("fetch_json", args)); } catch (e) { return err(e); }
  }
);

server.tool("check_url_status",
  "Check the HTTP status and response time of one or more URLs.",
  {
    urls: z.array(z.string()).describe("List of URLs to check"),
    timeout_ms: z.number().optional().describe("Timeout per URL in ms (default: 5000)"),
  },
  async (args) => {
    try { return ok(await handleHttpTool("check_url_status", args)); } catch (e) { return err(e); }
  }
);

server.tool("download_file",
  "Download a file from a URL and save it to a local path.",
  {
    url: z.string().url().describe("URL of the file to download"),
    save_path: z.string().describe("Local path to save the file"),
    headers: z.record(z.string()).optional().describe("Optional headers (e.g. Authorization)"),
  },
  async (args) => {
    try { return ok(await handleHttpTool("download_file", args)); } catch (e) { return err(e); }
  }
);

// ── SYSTEM TOOLS ──────────────────────────────────────────────────────────────

server.tool("get_system_info",
  "Get detailed system information: OS, CPU, memory, architecture, hostname.",
  {},
  async () => {
    try { return ok(await handleSystemTool("get_system_info", {})); } catch (e) { return err(e); }
  }
);

server.tool("get_env",
  "Read environment variables. Sensitive values are automatically masked.",
  {
    keys: z.array(z.string()).optional().describe("Specific keys to retrieve (omit for all)"),
  },
  async (args) => {
    try { return ok(await handleSystemTool("get_env", args)); } catch (e) { return err(e); }
  }
);

server.tool("run_command",
  "Execute a shell command safely. Validated against an allowlist of safe tools.",
  {
    command: z.string().describe("The shell command to run"),
    cwd: z.string().optional().describe("Working directory (default: current)"),
    timeout_ms: z.number().optional().describe("Timeout in ms (default: 30000)"),
  },
  async (args) => {
    await sendLog(server, "notice", { tool: "run_command", command: args.command }, "tools");
    try { return ok(await handleSystemTool("run_command", args)); } catch (e) { return err(e); }
  }
);

server.tool("list_processes",
  "List running processes with their PID, name, and resource usage.",
  {
    filter: z.string().optional().describe("Filter processes by name"),
    limit: z.number().optional().describe("Max processes to return (default: 20)"),
  },
  async (args) => {
    try { return ok(await handleSystemTool("list_processes", args)); } catch (e) { return err(e); }
  }
);

server.tool("get_disk_usage",
  "Get disk usage for a directory or the whole system.",
  { path: z.string().optional().describe("Path to check (default: current directory)") },
  async (args) => {
    try { return ok(await handleSystemTool("get_disk_usage", args)); } catch (e) { return err(e); }
  }
);

server.tool("get_network_info",
  "Get network interfaces and their IP addresses.",
  {},
  async () => {
    try { return ok(await handleSystemTool("get_network_info", {})); } catch (e) { return err(e); }
  }
);

server.tool("run_background",
  "Start a long-running process (dev servers, watchers) in the background. Captures output for a few seconds then detaches — process keeps running. Returns PID + initial output. Use for: npm run dev, uvicorn, nodemon, python manage.py runserver.",
  {
    command: z.string().describe("The command to run in background"),
    cwd: z.string().optional().describe("Working directory"),
    capture_seconds: z.number().optional().describe("Seconds to capture output before detaching (default: 6)"),
  },
  async (args) => {
    try { return ok(await handleSystemTool("run_background", args)); } catch (e) { return err(e); }
  }
);

server.tool("read_process_output",
  "Read the latest buffered output from a background process started with run_background.",
  {
    pid: z.number().describe("Process ID returned by run_background"),
  },
  async (args) => {
    try { return ok(await handleSystemTool("read_process_output", args)); } catch (e) { return err(e); }
  }
);

server.tool("check_port",
  "Check if a TCP port is open/listening on localhost. Use after run_background to confirm a dev server started. Returns true if something is listening.",
  {
    port: z.number().describe("Port to check (e.g. 5173, 3000, 8000)"),
    timeout_ms: z.number().optional().describe("Timeout ms (default: 2000)"),
  },
  async (args) => {
    try { return ok(await handleSystemTool("check_port", args)); } catch (e) { return err(e); }
  }
);

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await sendLog(server, "info", {
    message: "DevToolkit MCP Server started",
    version: "1.0.0",
    capabilities: ["tools(22)", "resources", "logging", "completions", "elicitation", "sampling"],
  }, "devtoolkit");
  process.stderr.write("DevToolkit MCP Server v1.0.0 running on stdio\n");
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e}\n`);
  process.exit(1);
});
