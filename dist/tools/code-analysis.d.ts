export declare const codeToolDefinitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            file_path: {
                type: string;
                description: string;
            };
            dir_path?: undefined;
            glob?: undefined;
            tags?: undefined;
            target?: undefined;
            min_lines?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            dir_path: {
                type: string;
                description: string;
            };
            glob: {
                type: string;
                description: string;
            };
            tags: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            file_path?: undefined;
            target?: undefined;
            min_lines?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            target: {
                type: string;
                description: string;
            };
            glob: {
                type: string;
                description: string;
            };
            file_path?: undefined;
            dir_path?: undefined;
            tags?: undefined;
            min_lines?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            dir_path: {
                type: string;
                description: string;
            };
            glob: {
                type: string;
                description: string;
            };
            min_lines: {
                type: string;
                description: string;
            };
            file_path?: undefined;
            tags?: undefined;
            target?: undefined;
        };
        required?: undefined;
    };
})[];
export declare function handleCodeTool(name: string, args: unknown): Promise<string>;
//# sourceMappingURL=code-analysis.d.ts.map