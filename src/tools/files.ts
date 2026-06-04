import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import { z } from "zod";
import { ToolError, safeJson } from "../utils/errors.js";

export const fileToolDefinitions = [
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

const ReadSchema = z.object({
  file_path: z.string(),
  start_line: z.number().optional(),
  end_line: z.number().optional(),
});

const WriteSchema = z.object({
  file_path: z.string(),
  content: z.string(),
  append: z.boolean().nullish().transform(v => v ?? false),
});

const ListSchema = z.object({
  dir_path: z.string(),
  show_hidden: z.boolean().nullish().transform(v => v ?? false),
});

const SearchSchema = z.object({
  pattern: z.string(),
  glob: z.string().nullish().transform(v => v ?? "**/*"),
  base_dir: z.string().nullish().transform(v => v ?? "."),
  case_sensitive: z.boolean().nullish().transform(v => v ?? true),
  max_results: z.number().nullish().transform(v => v ?? 50),
});

const FileInfoSchema = z.object({ file_path: z.string() });

const DeleteSchema = z.object({
  file_path: z.string(),
  recursive: z.boolean().nullish().transform(v => v ?? false),
});

export async function handleFileTool(name: string, args: unknown): Promise<string> {
  switch (name) {
    case "read_file": {
      const { file_path, start_line, end_line } = ReadSchema.parse(args);
      try {
        const content = await fs.readFile(file_path, "utf-8");
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
      } catch (e) {
        throw new ToolError(`Cannot read file: ${file_path}`, "FILE_READ_ERROR", e);
      }
    }

    case "write_file": {
      const { file_path, content, append } = WriteSchema.parse(args);
      try {
        await fs.mkdir(path.dirname(file_path), { recursive: true });
        if (append) {
          await fs.appendFile(file_path, content, "utf-8");
          return `Appended ${content.length} chars to ${file_path}`;
        }
        await fs.writeFile(file_path, content, "utf-8");
        return `Written ${content.length} chars to ${file_path}`;
      } catch (e) {
        throw new ToolError(`Cannot write file: ${file_path}`, "FILE_WRITE_ERROR", e);
      }
    }

    case "list_directory": {
      const { dir_path, show_hidden } = ListSchema.parse(args);
      try {
        const entries = await fs.readdir(dir_path, { withFileTypes: true });
        const filtered = show_hidden ? entries : entries.filter((e) => !e.name.startsWith("."));
        const result = await Promise.all(
          filtered.map(async (e) => {
            const fullPath = path.join(dir_path, e.name);
            const stat = await fs.stat(fullPath).catch(() => null);
            return {
              name: e.name,
              type: e.isDirectory() ? "dir" : "file",
              size: stat?.size ?? null,
              modified: stat?.mtime.toISOString() ?? null,
            };
          })
        );
        return safeJson(result);
      } catch (e) {
        throw new ToolError(`Cannot list directory: ${dir_path}`, "DIR_LIST_ERROR", e);
      }
    }

    case "search_in_files": {
      const { pattern, glob: globPattern, base_dir, case_sensitive, max_results } = SearchSchema.parse(args);
      const regex = new RegExp(pattern, case_sensitive ? "g" : "gi");
      const files = await fg(globPattern, {
        cwd: base_dir,
        absolute: true,
        ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
      });

      const results: Array<{ file: string; line: number; content: string }> = [];

      for (const file of files) {
        if (results.length >= max_results) break;
        try {
          const content = await fs.readFile(file, "utf-8");
          const lines = content.split("\n");
          lines.forEach((line, idx) => {
            if (regex.test(line) && results.length < max_results) {
              results.push({ file, line: idx + 1, content: line.trim() });
            }
            regex.lastIndex = 0;
          });
        } catch {
          // skip binary / unreadable files
        }
      }

      if (results.length === 0) return `No matches found for: ${pattern}`;
      return safeJson(results);
    }

    case "get_file_info": {
      const { file_path } = FileInfoSchema.parse(args);
      try {
        const stat = await fs.stat(file_path);
        return safeJson({
          path: path.resolve(file_path),
          size_bytes: stat.size,
          size_human: formatBytes(stat.size),
          type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
          accessed: stat.atime.toISOString(),
          readonly: !(stat.mode & 0o200),
        });
      } catch (e) {
        throw new ToolError(`Cannot get info for: ${file_path}`, "FILE_INFO_ERROR", e);
      }
    }

    case "delete_file": {
      const { file_path, recursive } = DeleteSchema.parse(args);
      try {
        await fs.rm(file_path, { recursive, force: false });
        return `Deleted: ${file_path}`;
      } catch (e) {
        throw new ToolError(`Cannot delete: ${file_path}`, "FILE_DELETE_ERROR", e);
      }
    }

    default:
      throw new ToolError(`Unknown file tool: ${name}`, "UNKNOWN_TOOL");
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
