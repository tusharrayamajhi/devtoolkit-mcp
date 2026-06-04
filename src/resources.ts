import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sendLog } from "./utils/logger.js";

interface RawServer {
  notification(notif: { method: string; params?: unknown }): Promise<void>;
}

const PAGE_SIZE = 50;

// Subscription registry: uri → true
const subscriptions = new Set<string>();

export function pathToUri(filePath: string): string {
  const abs = path.resolve(filePath).replace(/\\/g, "/");
  return `file:///${abs.replace(/^\//, "")}`;
}

export function uriToPath(uri: string): string | null {
  if (!uri.startsWith("file:///")) return null;
  return decodeURIComponent(uri.replace(/^file:\/\/\//, ""));
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "text/typescript", ".tsx": "text/typescript",
    ".js": "application/javascript", ".jsx": "application/javascript",
    ".json": "application/json", ".md": "text/markdown",
    ".txt": "text/plain", ".html": "text/html", ".css": "text/css",
    ".py": "text/x-python", ".go": "text/x-go", ".rs": "text/x-rust",
    ".java": "text/x-java", ".cpp": "text/x-c++", ".c": "text/x-c",
    ".yaml": "application/yaml", ".yml": "application/yaml",
    ".toml": "application/toml", ".xml": "application/xml",
    ".sh": "application/x-sh", ".sql": "application/sql",
    ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  };
  return map[ext] ?? "text/plain";
}

async function readResourceContents(uri: string) {
  const filePath = uriToPath(uri);
  if (!filePath) throw new Error(`Unsupported URI: ${uri}`);

  const mimeType = getMimeType(filePath);
  const isBinary = mimeType.startsWith("image/");

  if (isBinary) {
    const data = await fs.readFile(filePath);
    return { uri, mimeType, blob: data.toString("base64") };
  }

  const text = await fs.readFile(filePath, "utf-8");
  const stat = await fs.stat(filePath);
  return {
    uri,
    mimeType,
    text,
    annotations: {
      audience: ["user", "assistant"] as Array<"user" | "assistant">,
      priority: 0.8,
      lastModified: stat.mtime.toISOString(),
    },
  };
}

export function registerResourceHandlers(server: McpServer): void {
  // Dynamic file access via URI template: file:///path/to/file
  server.resource(
    "project-file",
    new ResourceTemplate("file:///{path}", {
      list: async () => {
        // Return first page of project files
        const files = await fg("**/*", {
          cwd: process.cwd(),
          absolute: true,
          onlyFiles: true,
          ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/*.lock"],
        });

        const page = files.sort().slice(0, PAGE_SIZE);
        const resources = await Promise.all(
          page.map(async (f) => {
            const stat = await fs.stat(f).catch(() => null);
            return {
              uri: pathToUri(f),
              name: path.basename(f),
              description: path.relative(process.cwd(), f),
              mimeType: getMimeType(f),
              size: stat?.size,
            };
          })
        );
        return { resources };
      },
    }),
    {
      title: "Project Files",
      description: "Access any file on the filesystem by path",
    },
    async (uri) => {
      try {
        const contents = await readResourceContents(uri.href);
        return { contents: [contents] };
      } catch (e) {
        throw new Error(`Cannot read ${uri.href}: ${e instanceof Error ? e.message : e}`);
      }
    }
  );

  // Completion handler for file paths
  server.setCompletionRequestHandler(async (ref, argument) => {
    if (ref.type !== "ref/resource") {
      return { completion: { values: [], hasMore: false } };
    }
    const partial = argument.value ?? "";
    try {
      const matches = await fg(`${partial}*`, {
        cwd: process.cwd(),
        onlyFiles: false,
        dot: true,
        ignore: ["**/node_modules/**", "**/.git/**"],
      });
      const suggestions = matches.slice(0, 20);
      return {
        completion: {
          values: suggestions,
          total: matches.length,
          hasMore: matches.length > 20,
        },
      };
    } catch {
      return { completion: { values: [], hasMore: false } };
    }
  });
}

// Call after write_file or delete_file to push notifications to subscribers
export async function notifyResourceUpdated(server: McpServer, filePath: string): Promise<void> {
  const uri = pathToUri(path.resolve(filePath));
  if (subscriptions.has(uri)) {
    try {
      const raw = server.server as unknown as RawServer;
      await raw.notification({ method: "notifications/resources/updated", params: { uri } });
    } catch {
      // client may not be subscribed via protocol
    }
  }
  await server.sendResourceListChanged();
}

export function addSubscription(uri: string): void {
  subscriptions.add(uri);
}

export function removeSubscription(uri: string): void {
  subscriptions.delete(uri);
}
