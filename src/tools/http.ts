import axios, { AxiosRequestConfig } from "axios";
import { z } from "zod";
import { ToolError, safeJson } from "../utils/errors.js";

export const httpToolDefinitions = [
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

const RequestSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]).optional().default("GET"),
  headers: z.record(z.string()).optional().default({}),
  body: z.string().optional(),
  timeout_ms: z.number().nullish().transform(v => v ?? 10000),
  follow_redirects: z.boolean().nullish().transform(v => v ?? true),
});

const FetchJsonSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional().default({}),
  json_path: z.string().optional(),
});

const StatusSchema = z.object({
  urls: z.array(z.string()),
  timeout_ms: z.number().nullish().transform(v => v ?? 5000),
});

const DownloadSchema = z.object({
  url: z.string().url(),
  save_path: z.string(),
  headers: z.record(z.string()).optional().default({}),
});

function extractJsonPath(obj: unknown, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export async function handleHttpTool(name: string, args: unknown): Promise<string> {
  switch (name) {
    case "http_request": {
      const { url, method, headers, body, timeout_ms, follow_redirects } = RequestSchema.parse(args);
      try {
        let data: unknown = body;
        if (body) {
          try { data = JSON.parse(body); } catch { data = body; }
        }

        const config: AxiosRequestConfig = {
          url,
          method,
          headers: { "User-Agent": "devtoolkit-mcp/1.0.0", ...headers },
          data,
          timeout: timeout_ms,
          maxRedirects: follow_redirects ? 5 : 0,
          validateStatus: () => true,
        };

        const start = Date.now();
        const response = await axios(config);
        const elapsed = Date.now() - start;

        const contentType = String(response.headers["content-type"] ?? "");
        let responseBody: string;
        if (contentType.includes("application/json")) {
          responseBody = safeJson(response.data);
        } else {
          responseBody = String(response.data).slice(0, 5000);
        }

        return safeJson({
          status: response.status,
          status_text: response.statusText,
          elapsed_ms: elapsed,
          headers: response.headers,
          body: responseBody,
        });
      } catch (e) {
        throw new ToolError(`HTTP request failed: ${url}`, "HTTP_REQUEST_ERROR", e instanceof Error ? e.message : e);
      }
    }

    case "fetch_json": {
      const { url, headers, json_path } = FetchJsonSchema.parse(args);
      try {
        const response = await axios.get(url, {
          headers: { "User-Agent": "devtoolkit-mcp/1.0.0", Accept: "application/json", ...headers },
          timeout: 10000,
        });
        const data = json_path ? extractJsonPath(response.data, json_path) : response.data;
        return safeJson(data);
      } catch (e) {
        throw new ToolError(`Failed to fetch JSON from: ${url}`, "FETCH_JSON_ERROR", e instanceof Error ? e.message : e);
      }
    }

    case "check_url_status": {
      const { urls, timeout_ms } = StatusSchema.parse(args);
      const results = await Promise.all(
        urls.map(async (url) => {
          const start = Date.now();
          try {
            const response = await axios.head(url, {
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
          } catch (e) {
            return {
              url,
              status: null,
              ok: false,
              elapsed_ms: Date.now() - start,
              error: e instanceof Error ? e.message : String(e),
            };
          }
        })
      );
      return safeJson(results);
    }

    case "download_file": {
      const { url, save_path, headers } = DownloadSchema.parse(args);
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        await fs.mkdir(path.dirname(save_path), { recursive: true });

        const response = await axios.get(url, {
          headers: { "User-Agent": "devtoolkit-mcp/1.0.0", ...headers },
          responseType: "arraybuffer",
          timeout: 30000,
        });

        await fs.writeFile(save_path, Buffer.from(response.data as ArrayBuffer));
        const size = (response.data as ArrayBuffer).byteLength;
        return safeJson({
          saved_to: save_path,
          size_bytes: size,
          size_human: `${(size / 1024).toFixed(2)} KB`,
          content_type: response.headers["content-type"] ?? "unknown",
        });
      } catch (e) {
        throw new ToolError(`Download failed: ${url}`, "DOWNLOAD_ERROR", e instanceof Error ? e.message : e);
      }
    }

    default:
      throw new ToolError(`Unknown HTTP tool: ${name}`, "UNKNOWN_TOOL");
  }
}
