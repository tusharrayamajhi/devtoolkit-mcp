# DevToolkit MCP Server

A production-quality [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that gives AI assistants like Claude 22 powerful developer tools across 5 domains.

Built with TypeScript, strict types, Zod validation, and clean modular architecture.

---

## Features

### 📁 File Tools (6)
| Tool | Description |
|---|---|
| `read_file` | Read file contents with optional line range |
| `write_file` | Write/append to files, auto-creates directories |
| `list_directory` | List files with metadata (size, modified date) |
| `search_in_files` | Regex search across files with glob patterns |
| `get_file_info` | File metadata: size, timestamps, permissions |
| `delete_file` | Delete files or directories (recursive optional) |

### 🔧 Git Tools (6)
| Tool | Description |
|---|---|
| `git_status` | Working tree status, branch info, ahead/behind |
| `git_log` | Commit history with author, date, message |
| `git_diff` | Diff between commits, branches, or working tree |
| `git_blame` | Line-by-line authorship for any file |
| `git_branches` | List all local and remote branches |
| `git_show_commit` | Full diff and metadata for a specific commit |

### 🔍 Code Analysis Tools (6)
| Tool | Description |
|---|---|
| `analyze_complexity` | Cyclomatic complexity, nesting depth, function count |
| `find_todos` | Find TODO/FIXME/HACK comments across a codebase |
| `count_lines` | Code vs comment vs blank line breakdown |
| `detect_language` | Identify programming language from file extension/shebang |
| `find_duplicates` | Detect duplicate code blocks across files |
| `get_imports` | Extract and categorize all import statements |

### 🌐 HTTP Tools (4)
| Tool | Description |
|---|---|
| `http_request` | Full HTTP client: GET/POST/PUT/PATCH/DELETE with headers/body |
| `fetch_json` | Fetch and parse JSON with optional dot-path extraction |
| `check_url_status` | Batch URL health check with response times |
| `download_file` | Download files from URLs to local paths |

### 💻 System Tools (6)
| Tool | Description |
|---|---|
| `get_system_info` | OS, CPU, memory, Node version, uptime |
| `get_env` | Read environment variables (sensitive values auto-masked) |
| `run_command` | Execute shell commands (allowlisted for safety) |
| `list_processes` | Running processes with CPU/memory usage |
| `get_disk_usage` | Disk usage for directories |
| `get_network_info` | Network interfaces and IP addresses |

---

## Installation

```bash
git clone https://github.com/your-username/devtoolkit-mcp
cd devtoolkit-mcp
npm install
npm run build
```

## Usage with Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "devtoolkit": {
      "command": "node",
      "args": ["/absolute/path/to/devtoolkit-mcp/dist/index.js"]
    }
  }
}
```

## Usage with Cursor / VS Code

Same pattern — point the MCP server config to `dist/index.js`.

## Development

```bash
npm run dev    # Run with tsx (no build step)
npm run build  # Compile TypeScript
npm run lint   # ESLint
```

---

## Advanced MCP Protocol Features

Beyond tools, this server implements the full 2025-06-18 MCP specification:

### 📂 Resources
Files are exposed as browsable MCP resources — clients (e.g. Claude Desktop) can list, read, and subscribe to changes.
- **Paginated listing** with cursor-based pagination (50 files/page)
- **Resource templates**: `file:///{path}` for dynamic file access
- **Subscriptions**: clients receive `notifications/resources/updated` when a file changes after a write/delete
- **List-changed notifications**: resource list updates after any file mutation
- **Annotations**: every resource includes `audience`, `priority`, and `lastModified`

### 📝 Logging
Structured log notifications sent to the client for every tool call:
- 8 RFC 5424 severity levels: `debug` → `emergency`
- Client can set minimum log level via `logging/setLevel`
- Logs include tool name, args preview, status, and errors
- Sensitive values never logged

### 🔍 Completion
Autocomplete for file paths in resource URI templates:
- Triggered when client requests `completion/complete` on a `ref/resource`
- Returns matching file paths up to 20 suggestions with `hasMore` flag

### 🗣️ Elicitation
Servers request structured user input before destructive operations:
- **`write_file`**: if the target file exists, asks user to confirm overwrite (with checkbox UI)
- **`delete_file`**: always asks user to confirm + optionally provide a reason
- Falls back gracefully if client doesn't support elicitation (proceeds without prompt)

### 🤖 Sampling
The server can ask the client's LLM to generate completions:
- `sampleFromClient()` helper exported for use in tools
- Specifies model preferences (prefers Claude Sonnet, falls back to any Claude)
- Gracefully no-ops if client doesn't support sampling

---

## Architecture

```
src/
├── index.ts              # MCP server, capabilities, tool routing, elicitation, sampling
├── resources.ts          # Resources: list, read, subscribe, completion, pagination
├── tools/
│   ├── files.ts          # File system tools
│   ├── git.ts            # Git integration (simple-git)
│   ├── code-analysis.ts  # Static analysis tools
│   ├── http.ts           # HTTP client tools (axios)
│   └── system.ts         # OS/system tools
└── utils/
    ├── errors.ts         # Typed error classes, helpers
    └── logger.ts         # Structured log notifications (RFC 5424)
```

**Key design decisions:**
- **Zod validation** on every tool input — no silent failures
- **Typed error classes** with error codes for structured debugging
- **Security**: `run_command` has an explicit allowlist; env vars auto-mask secrets
- **Cross-platform**: works on Windows, macOS, and Linux

---

## Tech Stack

- `@modelcontextprotocol/sdk` — MCP protocol
- `simple-git` — Git operations
- `axios` — HTTP client
- `fast-glob` — File pattern matching
- `zod` — Runtime schema validation
- TypeScript (strict mode)

---

## License

MIT
