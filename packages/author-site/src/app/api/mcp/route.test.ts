import { GET, POST } from "./route";

const originalToken = process.env.PROJECT_ADMIN_TOKEN;

describe("Project Admin MCP HTTP route", () => {
  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.PROJECT_ADMIN_TOKEN;
    } else {
      process.env.PROJECT_ADMIN_TOKEN = originalToken;
    }
  });

  it("未携带服务账号 token 时拒绝受保护请求", async () => {
    process.env.PROJECT_ADMIN_TOKEN = "secret-token";

    const response = await POST(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe(-32001);
  });

  it("返回远程 MCP 健康信息", async () => {
    process.env.PROJECT_ADMIN_TOKEN = "secret-token";

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      name: "opencode-project-admin",
      transport: "http-json-rpc",
      auth: "bearer",
    });
  });

  it("通过 HTTP JSON-RPC 暴露同一套 MCP 工具", async () => {
    process.env.PROJECT_ADMIN_TOKEN = "secret-token";

    const response = await POST(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer secret-token" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      }),
    );
    const body = await response.json();
    const toolNames = body.result.tools.map((tool: { name: string }) => tool.name);

    expect(response.status).toBe(200);
    expect(toolNames).toContain("project_list");
    expect(toolNames).toContain("asset_upload");
    expect(toolNames).toContain("admin_lock_project");
  });
});
