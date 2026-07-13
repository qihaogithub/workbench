import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const errors = [];
const warnings = [];
const root = process.cwd();

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message) {
  errors.push(message);
}

function expectObject(value, label) {
  if (!isObject(value)) {
    fail(`${label} must be an object`);
    return false;
  }
  return true;
}

function expectString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
}

function expectNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
}

function expectBoolean(value, label) {
  if (typeof value !== "boolean") {
    fail(`${label} must be a boolean`);
  }
}

function expectArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
    return false;
  }
  return true;
}

function validateApiResponse(value, label) {
  if (!expectObject(value, label)) return;
  if (value.success === true) {
    if (!("data" in value)) fail(`${label}.data is required for success response`);
    return;
  }
  if (value.success === false) {
    if (!expectObject(value.error, `${label}.error`)) return;
    expectString(value.error.code, `${label}.error.code`);
    expectString(value.error.message, `${label}.error.message`);
    return;
  }
  fail(`${label}.success must be true or false`);
}

function validateAgentStreamEvent(value, label) {
  if (!expectObject(value, label)) return;
  const allowedTypes = new Set([
    "stream",
    "thought",
    "plan",
    "tool_call",
    "tool_call_update",
    "error",
    "finish",
    "pong",
    "status",
    "permission_request",
    "models",
  ]);
  expectString(value.type, `${label}.type`);
  if (typeof value.type === "string" && !allowedTypes.has(value.type)) {
    fail(`${label}.type has unsupported value: ${value.type}`);
  }
  if (value.type === "error") {
    if (!expectObject(value.error, `${label}.error`)) return;
    expectString(value.error.code, `${label}.error.code`);
    expectString(value.error.message, `${label}.error.message`);
  }
  if (value.type === "permission_request") {
    if (!expectObject(value.permissionRequest, `${label}.permissionRequest`)) return;
    expectString(value.permissionRequest.sessionId, `${label}.permissionRequest.sessionId`);
    expectArray(value.permissionRequest.options, `${label}.permissionRequest.options`);
    if (!expectObject(value.permissionRequest.toolCall, `${label}.permissionRequest.toolCall`)) return;
    expectString(value.permissionRequest.toolCall.toolCallId, `${label}.permissionRequest.toolCall.toolCallId`);
  }
  if (value.type === "models") {
    if (expectArray(value.models, `${label}.models`)) {
      value.models.forEach((model, index) => {
        if (!expectObject(model, `${label}.models[${index}]`)) return;
        expectString(model.id, `${label}.models[${index}].id`);
        expectString(model.label, `${label}.models[${index}].label`);
      });
    }
  }
}

function validateScreenshotGenerateRequest(value, label) {
  if (!expectObject(value, label)) return;
  expectString(value.projectId, `${label}.projectId`);
  expectString(value.pageId, `${label}.pageId`);
  expectString(value.code, `${label}.code`);
  expectObject(value.configData, `${label}.configData`);
  if (value.width !== undefined) expectNumber(value.width, `${label}.width`);
  if (value.height !== undefined) expectNumber(value.height, `${label}.height`);
  if (value.fullPage !== undefined) expectBoolean(value.fullPage, `${label}.fullPage`);
}

function validateScreenshotGenerateResult(value, label) {
  if (!expectObject(value, label)) return;
  expectString(value.url, `${label}.url`);
  expectString(value.hash, `${label}.hash`);
  expectNumber(value.elapsed, `${label}.elapsed`);
  expectBoolean(value.cached, `${label}.cached`);
  expectString(value.requestId, `${label}.requestId`);
  expectNumber(value.queueWaitMs, `${label}.queueWaitMs`);
  if (!expectObject(value.timings, `${label}.timings`)) return;
  expectNumber(value.timings.compileMs, `${label}.timings.compileMs`);
  expectNumber(value.timings.renderMs, `${label}.timings.renderMs`);
  expectNumber(value.timings.writeMs, `${label}.timings.writeMs`);
  expectNumber(value.timings.totalMs, `${label}.timings.totalMs`);
}

function validateScreenshotBatchStatus(value, label) {
  if (!expectObject(value, label)) return;
  expectString(value.batchId, `${label}.batchId`);
  expectNumber(value.total, `${label}.total`);
  expectNumber(value.completed, `${label}.completed`);
  expectNumber(value.failed, `${label}.failed`);
  expectNumber(value.cached, `${label}.cached`);
  expectString(value.status, `${label}.status`);
  if (!["running", "completed", "cancelled"].includes(value.status)) {
    fail(`${label}.status has unsupported value: ${value.status}`);
  }
  expectBoolean(value.cancelled, `${label}.cancelled`);
  expectArray(value.results, `${label}.results`);
}

function validateProjectAdminResult(value, label) {
  if (!expectObject(value, label)) return;
  expectBoolean(value.ok, `${label}.ok`);
  if (value.ok) {
    if (!("data" in value) && !("validation" in value)) {
      fail(`${label} success result should include data or validation`);
    }
    return;
  }
  if (!expectObject(value.error, `${label}.error`)) return;
  expectString(value.error.code, `${label}.error.code`);
  expectString(value.error.message, `${label}.error.message`);
  if (value.nextActions !== undefined) expectArray(value.nextActions, `${label}.nextActions`);
}

function readSource(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`source contract file is missing: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function expectSourceIncludes(source, token, label) {
  if (!source.includes(token)) {
    fail(`${label} must include ${token}`);
  }
}

function runViewerContracts() {
  const result = spawnSync(process.execPath, ["scripts/check-viewer-contracts.mjs"], {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    fail("viewer contract check failed");
  }
}

runViewerContracts();

const sharedSource = readSource("packages/shared/src/index.ts");
expectSourceIncludes(sharedSource, "interface ApiSuccessResponse", "shared ApiSuccessResponse contract");
expectSourceIncludes(sharedSource, "interface ApiErrorResponse", "shared ApiErrorResponse contract");
expectSourceIncludes(sharedSource, "success: true", "shared success envelope contract");
expectSourceIncludes(sharedSource, "success: false", "shared error envelope contract");

const agentClientSource = readSource("packages/agent-client/src/client.ts");
for (const eventType of [
  "stream",
  "thought",
  "plan",
  "tool_call",
  "tool_call_update",
  "error",
  "finish",
  "pong",
  "status",
  "permission_request",
  "models",
]) {
  expectSourceIncludes(agentClientSource, `"${eventType}"`, `agent StreamEvent ${eventType}`);
}
expectSourceIncludes(agentClientSource, "permissionRequest", "agent permission request contract");
expectSourceIncludes(agentClientSource, "currentModelId", "agent models currentModelId contract");

const screenshotRouteSource = readSource("packages/screenshot-service/src/routes/screenshots.ts");
for (const token of [
  "type GenerateRequest = RequestSnapshotInput",
  "interface GenerateBatchRequest",
  "interface BatchState",
  "interface GenerateScreenshotResult",
  "requestId",
  "queueWaitMs",
  "timings",
  "renderBox",
  "errorsByCode",
  "cancelled",
]) {
  expectSourceIncludes(screenshotRouteSource, token, `screenshot route contract ${token}`);
}

const projectCoreTypesSource = readSource("packages/project-core/src/types.ts");
for (const token of [
  "interface ProjectAdminResult",
  "ok: boolean",
  "error?: ProjectAdminError",
  "nextActions?: string[]",
  "validation?: ValidationResult",
]) {
  expectSourceIncludes(projectCoreTypesSource, token, `project admin contract ${token}`);
}

validateApiResponse(
  { success: true, data: { id: "ok" } },
  "api success envelope",
);
validateApiResponse(
  { success: false, error: { code: "INVALID_REQUEST", message: "请求参数无效" } },
  "api error envelope",
);

validateAgentStreamEvent(
  { type: "stream", id: "msg_1", content: "hello", done: false, timestamp: 1 },
  "agent stream event",
);
validateAgentStreamEvent(
  { type: "error", id: "msg_1", error: { code: "INVALID_PARAMS", message: "消息格式无效" } },
  "agent error event",
);
validateAgentStreamEvent(
  {
    type: "permission_request",
    permissionRequest: {
      sessionId: "session_1",
      options: [{ optionId: "allow", name: "允许" }],
      toolCall: { toolCallId: "tool_1", title: "写入文件", kind: "edit" },
    },
  },
  "agent permission event",
);
validateAgentStreamEvent(
  {
    type: "models",
    models: [{ id: "provider/model", label: "Provider Model" }],
    currentModelId: "provider/model",
    canSwitch: true,
  },
  "agent models event",
);

validateScreenshotGenerateRequest(
  {
    projectId: "proj_1",
    pageId: "page_1",
    code: "export default function Demo(){ return null; }",
    configData: {},
    width: 320,
    height: 640,
    fullPage: false,
  },
  "screenshot generate request",
);
validateApiResponse(
  {
    success: true,
    data: {
      url: "/api/screenshots/file/proj_1/page_1",
      hash: "abcdef1234567890",
      elapsed: 10,
      cached: false,
      requestId: "req_1",
      queueWaitMs: 0,
      timings: { compileMs: 1, renderMs: 2, writeMs: 1, totalMs: 10 },
    },
  },
  "screenshot generate response envelope",
);
validateScreenshotGenerateResult(
  {
    url: "/api/screenshots/file/proj_1/page_1",
    hash: "abcdef1234567890",
    elapsed: 10,
    cached: false,
    requestId: "req_1",
    queueWaitMs: 0,
    timings: { compileMs: 1, renderMs: 2, writeMs: 1, totalMs: 10 },
  },
  "screenshot generate result",
);
validateScreenshotBatchStatus(
  {
    batchId: "batch_1",
    total: 1,
    completed: 1,
    failed: 0,
    cached: 0,
    status: "completed",
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:01.000Z",
    expiresAt: "2026-06-28T00:05:00.000Z",
    errorsByCode: {},
    cancelled: false,
    results: [{ pageId: "page_1", hash: "abcdef1234567890", status: "done" }],
  },
  "screenshot batch status",
);

validateProjectAdminResult(
  { ok: true, data: { id: "proj_1" } },
  "project admin success",
);
validateProjectAdminResult(
  {
    ok: false,
    error: { code: "PROJECT_NOT_FOUND", message: "项目不存在" },
    nextActions: ["确认 projectId 是否正确"],
  },
  "project admin error",
);

for (const warning of warnings) {
  console.warn(`[warn] ${warning}`);
}
for (const error of errors) {
  console.error(`[error] ${error}`);
}

if (errors.length > 0) {
  console.error(`contract check failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log("contract check passed.");
