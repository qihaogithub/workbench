export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  read: () => unknown | Promise<unknown>;
}

export interface PromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  get: (args: Record<string, unknown>) => string;
}

function encodeMessage(message: JsonRpcResponse | Record<string, unknown>): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`;
}

function parseMessages(buffer: string): { messages: JsonRpcRequest[]; rest: string } {
  const messages: JsonRpcRequest[] = [];
  let rest = buffer;

  while (rest.length > 0) {
    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const header = rest.slice(0, headerEnd);
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
      if (!lengthMatch) break;
      const length = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (rest.length < bodyEnd) break;
      const body = rest.slice(bodyStart, bodyEnd);
      messages.push(JSON.parse(body) as JsonRpcRequest);
      rest = rest.slice(bodyEnd);
      continue;
    }

    const newline = rest.indexOf("\n");
    if (newline === -1) break;
    const line = rest.slice(0, newline).trim();
    rest = rest.slice(newline + 1);
    if (line) messages.push(JSON.parse(line) as JsonRpcRequest);
  }

  return { messages, rest };
}

export class MinimalMcpServer {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly resources = new Map<string, ResourceDefinition>();
  private readonly prompts = new Map<string, PromptDefinition>();

  constructor(
    private readonly options: {
      name: string;
      version: string;
      instructions?: string;
    },
  ) {}

  tool(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
  }

  resource(definition: ResourceDefinition): void {
    this.resources.set(definition.uri, definition);
  }

  prompt(definition: PromptDefinition): void {
    this.prompts.set(definition.name, definition);
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    if (request.id === undefined) return null;
    try {
      const result = await this.route(request.method, request.params);
      return { jsonrpc: "2.0", id: request.id ?? null, result };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : "MCP server error",
        },
      };
    }
  }

  listen(): void {
    let buffer = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
      const parsed = parseMessages(buffer);
      buffer = parsed.rest;
      for (const message of parsed.messages) {
        this.handle(message)
          .then((response) => {
            if (response) process.stdout.write(encodeMessage(response));
          })
          .catch((error) => {
            const response: JsonRpcResponse = {
              jsonrpc: "2.0",
              id: message.id ?? null,
              error: {
                code: -32000,
                message: error instanceof Error ? error.message : "MCP server error",
              },
            };
            process.stdout.write(encodeMessage(response));
          });
      }
    });
  }

  private async route(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
          serverInfo: {
            name: this.options.name,
            version: this.options.version,
          },
          instructions: this.options.instructions,
        };
      case "ping":
        return {};
      case "tools/list":
        return {
          tools: [...this.tools.values()].map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        };
      case "tools/call": {
        const args = paramsAsRecord(params);
        const name = stringArg(args, "name");
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Unknown tool: ${name}`);
        const toolArgs = recordArg(args, "arguments", {});
        const result = await tool.call(toolArgs);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      case "resources/list":
        return {
          resources: [...this.resources.values()].map(({ uri, name, description, mimeType }) => ({
            uri,
            name,
            description,
            mimeType,
          })),
        };
      case "resources/read": {
        const args = paramsAsRecord(params);
        const uri = stringArg(args, "uri");
        const resource = this.resources.get(uri);
        if (!resource) throw new Error(`Unknown resource: ${uri}`);
        const result = await resource.read();
        return {
          contents: [
            {
              uri,
              mimeType: resource.mimeType ?? "application/json",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
      case "prompts/list":
        return {
          prompts: [...this.prompts.values()].map(({ name, description, arguments: promptArgs }) => ({
            name,
            description,
            arguments: promptArgs ?? [],
          })),
        };
      case "prompts/get": {
        const args = paramsAsRecord(params);
        const name = stringArg(args, "name");
        const prompt = this.prompts.get(name);
        if (!prompt) throw new Error(`Unknown prompt: ${name}`);
        const promptArgs = recordArg(args, "arguments", {});
        return {
          description: prompt.description,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: prompt.get(promptArgs),
              },
            },
          ],
        };
      }
      default:
        return {};
    }
  }
}

export function stringArg(args: Record<string, unknown>, key: string, fallback = ""): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

export function booleanArg(args: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = args[key];
  return typeof value === "boolean" ? value : fallback;
}

export function numberArg(args: Record<string, unknown>, key: string, fallback = 0): number {
  const value = args[key];
  return typeof value === "number" ? value : fallback;
}

export function arrayArg(args: Record<string, unknown>, key: string): unknown[] {
  const value = args[key];
  return Array.isArray(value) ? value : [];
}

export function recordArg(
  args: Record<string, unknown>,
  key: string,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  const value = args[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fallback;
}

export function paramsAsRecord(params: unknown): Record<string, unknown> {
  return params && typeof params === "object" && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
}

export const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
