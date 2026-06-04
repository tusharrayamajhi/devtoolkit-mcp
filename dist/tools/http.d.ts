export declare const httpToolDefinitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            url: {
                type: string;
                description: string;
            };
            method: {
                type: string;
                enum: string[];
                description: string;
            };
            headers: {
                type: string;
                description: string;
                additionalProperties: {
                    type: string;
                };
            };
            body: {
                type: string;
                description: string;
            };
            timeout_ms: {
                type: string;
                description: string;
            };
            follow_redirects: {
                type: string;
                description: string;
            };
            json_path?: undefined;
            urls?: undefined;
            save_path?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            url: {
                type: string;
                description: string;
            };
            headers: {
                type: string;
                additionalProperties: {
                    type: string;
                };
                description: string;
            };
            json_path: {
                type: string;
                description: string;
            };
            method?: undefined;
            body?: undefined;
            timeout_ms?: undefined;
            follow_redirects?: undefined;
            urls?: undefined;
            save_path?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            urls: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            timeout_ms: {
                type: string;
                description: string;
            };
            url?: undefined;
            method?: undefined;
            headers?: undefined;
            body?: undefined;
            follow_redirects?: undefined;
            json_path?: undefined;
            save_path?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            url: {
                type: string;
                description: string;
            };
            save_path: {
                type: string;
                description: string;
            };
            headers: {
                type: string;
                additionalProperties: {
                    type: string;
                };
                description: string;
            };
            method?: undefined;
            body?: undefined;
            timeout_ms?: undefined;
            follow_redirects?: undefined;
            json_path?: undefined;
            urls?: undefined;
        };
        required: string[];
    };
})[];
export declare function handleHttpTool(name: string, args: unknown): Promise<string>;
//# sourceMappingURL=http.d.ts.map