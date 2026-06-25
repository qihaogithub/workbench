import { describe, expect, it } from "vitest";

import { MinimalMcpServer, objectSchema } from "./protocol.js";

describe("MinimalMcpServer", () => {
  it("lists and calls registered tools", async () => {
    const server = new MinimalMcpServer({ name: "test", version: "0.0.0" });
    server.tool({
      name: "echo",
      description: "Echo input",
      inputSchema: objectSchema({ value: { type: "string" } }, ["value"]),
      call: (args) => ({ ok: true, value: args.value }),
    });

    const listed = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(listed?.result).toMatchObject({
      tools: [{ name: "echo", description: "Echo input" }],
    });

    const called = await server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "echo",
        arguments: { value: "hello" },
      },
    });
    expect(called?.result).toMatchObject({
      content: [
        {
          type: "text",
        },
      ],
    });
  });
});
