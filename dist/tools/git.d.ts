export declare const gitToolDefinitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            repo_path: {
                type: string;
                description: string;
            };
            max_commits?: undefined;
            branch?: undefined;
            from?: undefined;
            to?: undefined;
            file_path?: undefined;
            staged?: undefined;
            include_remote?: undefined;
            commit_hash?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            repo_path: {
                type: string;
                description: string;
            };
            max_commits: {
                type: string;
                description: string;
            };
            branch: {
                type: string;
                description: string;
            };
            from?: undefined;
            to?: undefined;
            file_path?: undefined;
            staged?: undefined;
            include_remote?: undefined;
            commit_hash?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            repo_path: {
                type: string;
                description: string;
            };
            from: {
                type: string;
                description: string;
            };
            to: {
                type: string;
                description: string;
            };
            file_path: {
                type: string;
                description: string;
            };
            staged: {
                type: string;
                description: string;
            };
            max_commits?: undefined;
            branch?: undefined;
            include_remote?: undefined;
            commit_hash?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            repo_path: {
                type: string;
                description: string;
            };
            file_path: {
                type: string;
                description: string;
            };
            max_commits?: undefined;
            branch?: undefined;
            from?: undefined;
            to?: undefined;
            staged?: undefined;
            include_remote?: undefined;
            commit_hash?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            repo_path: {
                type: string;
                description: string;
            };
            include_remote: {
                type: string;
                description: string;
            };
            max_commits?: undefined;
            branch?: undefined;
            from?: undefined;
            to?: undefined;
            file_path?: undefined;
            staged?: undefined;
            commit_hash?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            repo_path: {
                type: string;
                description: string;
            };
            commit_hash: {
                type: string;
                description: string;
            };
            max_commits?: undefined;
            branch?: undefined;
            from?: undefined;
            to?: undefined;
            file_path?: undefined;
            staged?: undefined;
            include_remote?: undefined;
        };
        required: string[];
    };
})[];
export declare function handleGitTool(name: string, args: unknown): Promise<string>;
//# sourceMappingURL=git.d.ts.map