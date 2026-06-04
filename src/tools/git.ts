import simpleGit, { SimpleGit } from "simple-git";
import { z } from "zod";
import { ToolError, safeJson } from "../utils/errors.js";

export const gitToolDefinitions = [
  {
    name: "git_status",
    description: "Show the working tree status of a git repository.",
    inputSchema: {
      type: "object",
      properties: {
        repo_path: { type: "string", description: "Path to the git repository (default: current dir)" },
      },
    },
  },
  {
    name: "git_log",
    description: "Get the commit history for a repository.",
    inputSchema: {
      type: "object",
      properties: {
        repo_path: { type: "string", description: "Path to the git repository" },
        max_commits: { type: "number", description: "Max commits to return (default: 20)" },
        branch: { type: "string", description: "Branch name (default: current)" },
      },
    },
  },
  {
    name: "git_diff",
    description: "Show diff between commits, branches, or working tree.",
    inputSchema: {
      type: "object",
      properties: {
        repo_path: { type: "string", description: "Path to the git repository" },
        from: { type: "string", description: "From commit/branch (optional)" },
        to: { type: "string", description: "To commit/branch (optional)" },
        file_path: { type: "string", description: "Limit diff to a specific file" },
        staged: { type: "boolean", description: "Show staged diff (default: false)" },
      },
    },
  },
  {
    name: "git_blame",
    description: "Show what revision and author last modified each line of a file.",
    inputSchema: {
      type: "object",
      properties: {
        repo_path: { type: "string", description: "Path to the git repository" },
        file_path: { type: "string", description: "File to blame" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "git_branches",
    description: "List all local and remote branches.",
    inputSchema: {
      type: "object",
      properties: {
        repo_path: { type: "string", description: "Path to the git repository" },
        include_remote: { type: "boolean", description: "Include remote branches (default: true)" },
      },
    },
  },
  {
    name: "git_show_commit",
    description: "Show details and diff for a specific commit.",
    inputSchema: {
      type: "object",
      properties: {
        repo_path: { type: "string", description: "Path to the git repository" },
        commit_hash: { type: "string", description: "Commit hash or ref (e.g. HEAD, abc1234)" },
      },
      required: ["commit_hash"],
    },
  },
];

const BaseSchema = z.object({ repo_path: z.string().nullish().transform(v => v ?? ".") });

const LogSchema = BaseSchema.extend({
  max_commits: z.number().nullish().transform(v => v ?? 20),
  branch: z.string().optional(),
});

const DiffSchema = BaseSchema.extend({
  from: z.string().optional(),
  to: z.string().optional(),
  file_path: z.string().optional(),
  staged: z.boolean().nullish().transform(v => v ?? false),
});

const BlameSchema = BaseSchema.extend({ file_path: z.string() });

const BranchSchema = BaseSchema.extend({
  include_remote: z.boolean().nullish().transform(v => v ?? true),
});

const ShowSchema = BaseSchema.extend({ commit_hash: z.string() });

function getGit(repoPath: string): SimpleGit {
  return simpleGit(repoPath);
}

export async function handleGitTool(name: string, args: unknown): Promise<string> {
  switch (name) {
    case "git_status": {
      const { repo_path } = BaseSchema.parse(args);
      try {
        const git = getGit(repo_path);
        const status = await git.status();
        return safeJson({
          branch: status.current,
          tracking: status.tracking,
          ahead: status.ahead,
          behind: status.behind,
          staged: status.staged,
          modified: status.modified,
          not_added: status.not_added,
          deleted: status.deleted,
          conflicted: status.conflicted,
          isClean: status.isClean(),
        });
      } catch (e) {
        throw new ToolError("Git status failed", "GIT_STATUS_ERROR", e);
      }
    }

    case "git_log": {
      const { repo_path, max_commits, branch } = LogSchema.parse(args);
      try {
        const git = getGit(repo_path);
        const options: Record<string, string | number> = { "--max-count": max_commits };
        if (branch) options[branch] = branch;
        const log = await git.log(options as Parameters<SimpleGit["log"]>[0]);
        return safeJson(
          log.all.map((c) => ({
            hash: (c as Record<string, string>)["hash"]?.slice(0, 8) ?? "",
            author: (c as Record<string, string>)["author_name"] ?? "",
            email: (c as Record<string, string>)["author_email"] ?? "",
            date: (c as Record<string, string>)["date"] ?? "",
            message: (c as Record<string, string>)["message"] ?? "",
          }))
        );
      } catch (e) {
        throw new ToolError("Git log failed", "GIT_LOG_ERROR", e);
      }
    }

    case "git_diff": {
      const { repo_path, from, to, file_path, staged } = DiffSchema.parse(args);
      try {
        const git = getGit(repo_path);
        const diffArgs: string[] = [];
        if (staged) diffArgs.push("--staged");
        if (from) diffArgs.push(from);
        if (to) diffArgs.push(to);
        if (file_path) diffArgs.push("--", file_path);
        const diff = await git.diff(diffArgs);
        return diff || "No differences found.";
      } catch (e) {
        throw new ToolError("Git diff failed", "GIT_DIFF_ERROR", e);
      }
    }

    case "git_blame": {
      const { repo_path, file_path } = BlameSchema.parse(args);
      try {
        const git = getGit(repo_path);
        const raw = await git.raw(["blame", "--line-porcelain", file_path]);
        // Parse blame output into structured format
        const lines = raw.split("\n");
        const results: Array<{ line: number; hash: string; author: string; date: string; code: string }> = [];
        let lineNum = 1;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/^[0-9a-f]{40}/.test(line)) {
            const hash = line.slice(0, 8);
            const author = lines[i + 1]?.replace("author ", "") ?? "";
            const timestamp = parseInt(lines[i + 4]?.replace("author-time ", "") ?? "0") * 1000;
            const date = new Date(timestamp).toISOString().split("T")[0];
            // Find the code line (starts with \t)
            const codeLine = lines.slice(i).find((l) => l.startsWith("\t"));
            results.push({ line: lineNum++, hash, author, date, code: codeLine?.slice(1) ?? "" });
          }
        }
        return safeJson(results.slice(0, 100));
      } catch (e) {
        throw new ToolError(`Git blame failed for: ${file_path}`, "GIT_BLAME_ERROR", e);
      }
    }

    case "git_branches": {
      const { repo_path, include_remote } = BranchSchema.parse(args);
      try {
        const git = getGit(repo_path);
        const branches = await git.branch(include_remote ? ["-a"] : []);
        return safeJson({
          current: branches.current,
          all: branches.all,
          branches: Object.entries(branches.branches).map(([name, info]) => ({
            name,
            commit: info.commit.slice(0, 8),
            label: info.label,
            current: info.current,
          })),
        });
      } catch (e) {
        throw new ToolError("Git branches failed", "GIT_BRANCHES_ERROR", e);
      }
    }

    case "git_show_commit": {
      const { repo_path, commit_hash } = ShowSchema.parse(args);
      try {
        const git = getGit(repo_path);
        const show = await git.show([commit_hash, "--stat"]);
        return show;
      } catch (e) {
        throw new ToolError(`Git show failed for: ${commit_hash}`, "GIT_SHOW_ERROR", e);
      }
    }

    default:
      throw new ToolError(`Unknown git tool: ${name}`, "UNKNOWN_TOOL");
  }
}
