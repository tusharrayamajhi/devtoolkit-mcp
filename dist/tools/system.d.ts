export declare const systemToolDefinitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            keys?: undefined;
            command?: undefined;
            cwd?: undefined;
            timeout_ms?: undefined;
            filter?: undefined;
            limit?: undefined;
            path?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            keys: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            command?: undefined;
            cwd?: undefined;
            timeout_ms?: undefined;
            filter?: undefined;
            limit?: undefined;
            path?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            command: {
                type: string;
                description: string;
            };
            cwd: {
                type: string;
                description: string;
            };
            timeout_ms: {
                type: string;
                description: string;
            };
            keys?: undefined;
            filter?: undefined;
            limit?: undefined;
            path?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            filter: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            keys?: undefined;
            command?: undefined;
            cwd?: undefined;
            timeout_ms?: undefined;
            path?: undefined;
        };
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            path: {
                type: string;
                description: string;
            };
            keys?: undefined;
            command?: undefined;
            cwd?: undefined;
            timeout_ms?: undefined;
            filter?: undefined;
            limit?: undefined;
        };
        required?: undefined;
    };
})[];
export declare function handleSystemTool(name: string, args: unknown): Promise<string>;
//# sourceMappingURL=system.d.ts.map