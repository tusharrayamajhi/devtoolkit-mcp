export declare const fileToolDefinitions: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            file_path: {
                type: string;
                description: string;
            };
            start_line: {
                type: string;
                description: string;
            };
            end_line: {
                type: string;
                description: string;
            };
            content?: undefined;
            append?: undefined;
            dir_path?: undefined;
            show_hidden?: undefined;
            pattern?: undefined;
            glob?: undefined;
            base_dir?: undefined;
            case_sensitive?: undefined;
            max_results?: undefined;
            recursive?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            file_path: {
                type: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
            };
            append: {
                type: string;
                description: string;
            };
            start_line?: undefined;
            end_line?: undefined;
            dir_path?: undefined;
            show_hidden?: undefined;
            pattern?: undefined;
            glob?: undefined;
            base_dir?: undefined;
            case_sensitive?: undefined;
            max_results?: undefined;
            recursive?: undefined;
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
            show_hidden: {
                type: string;
                description: string;
            };
            file_path?: undefined;
            start_line?: undefined;
            end_line?: undefined;
            content?: undefined;
            append?: undefined;
            pattern?: undefined;
            glob?: undefined;
            base_dir?: undefined;
            case_sensitive?: undefined;
            max_results?: undefined;
            recursive?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            pattern: {
                type: string;
                description: string;
            };
            glob: {
                type: string;
                description: string;
            };
            base_dir: {
                type: string;
                description: string;
            };
            case_sensitive: {
                type: string;
                description: string;
            };
            max_results: {
                type: string;
                description: string;
            };
            file_path?: undefined;
            start_line?: undefined;
            end_line?: undefined;
            content?: undefined;
            append?: undefined;
            dir_path?: undefined;
            show_hidden?: undefined;
            recursive?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            file_path: {
                type: string;
                description: string;
            };
            start_line?: undefined;
            end_line?: undefined;
            content?: undefined;
            append?: undefined;
            dir_path?: undefined;
            show_hidden?: undefined;
            pattern?: undefined;
            glob?: undefined;
            base_dir?: undefined;
            case_sensitive?: undefined;
            max_results?: undefined;
            recursive?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            file_path: {
                type: string;
                description: string;
            };
            recursive: {
                type: string;
                description: string;
            };
            start_line?: undefined;
            end_line?: undefined;
            content?: undefined;
            append?: undefined;
            dir_path?: undefined;
            show_hidden?: undefined;
            pattern?: undefined;
            glob?: undefined;
            base_dir?: undefined;
            case_sensitive?: undefined;
            max_results?: undefined;
        };
        required: string[];
    };
})[];
export declare function handleFileTool(name: string, args: unknown): Promise<string>;
//# sourceMappingURL=files.d.ts.map