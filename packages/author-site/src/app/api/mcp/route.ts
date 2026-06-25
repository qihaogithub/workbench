import { NextResponse } from "next/server";
import { server } from "@opencode-workbench/project-admin-mcp";
import type { JsonRpcRequest } from "@opencode-workbench/project-admin-mcp/protocol";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const configuredToken = process.env.PROJECT_ADMIN_TOKEN;
  if (!configuredToken && process.env.NODE_ENV !== "production") return true;
  if (!configuredToken) return false;

  const authorization = request.headers.get("authorization") ?? "";
  return authorization === `Bearer ${configuredToken}`;
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return {
    jsonrpc: "2.0" as const,
    id: id ?? null,
    error: { code, message },
  };
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(jsonRpcError(null, -32700, "Parse error"), {
      status: 400,
    });
  }

  const rpcRequest = payload as Partial<JsonRpcRequest>;
  const requestId = rpcRequest.id ?? null;
  if (!isAuthorized(request)) {
    return NextResponse.json(jsonRpcError(requestId, -32001, "Unauthorized"), {
      status: 401,
    });
  }
  if (rpcRequest.jsonrpc !== "2.0" || typeof rpcRequest.method !== "string") {
    return NextResponse.json(jsonRpcError(requestId, -32600, "Invalid Request"), {
      status: 400,
    });
  }

  const response = await server.handle(rpcRequest as JsonRpcRequest);
  if (!response) return new NextResponse(null, { status: 202 });
  return NextResponse.json(response);
}

export function GET() {
  return NextResponse.json({
    ok: true,
    name: "opencode-project-admin",
    transport: "http-json-rpc",
    auth:
      process.env.PROJECT_ADMIN_TOKEN || process.env.NODE_ENV !== "production"
        ? "bearer"
        : "not_configured",
  });
}
