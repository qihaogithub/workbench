import assert from "node:assert/strict";
import test from "node:test";

import {
  workspaceAuthorityBootstrap,
  workspaceAuthorityPreflight,
  workspaceAuthorityReconcileAdopt,
  workspaceAuthorityReconcileRestore,
  workspaceAuthorityStatus,
} from "./workspace-authority.js";

function captureConsole(run: () => Promise<void>): Promise<string[]> {
  const originalLog = console.log;
  const output: string[] = [];
  console.log = (value?: unknown) => {
    output.push(String(value));
  };
  return run()
    .then(() => output)
    .finally(() => {
      console.log = originalLog;
    });
}

function healthResponse(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "live-1",
    projectId: "project-1",
    ready: true,
    stateExists: true,
    workspaceExists: true,
    revision: 3,
    rootHash: "root-3",
    actualRootHash: "root-3",
    externalDrift: false,
    queueDepth: 0,
    activeLease: false,
    preparedCount: 0,
    recoveryState: "ready",
    recoveryPendingCount: 0,
    conflictCount: 0,
    eventSubscriberCount: 0,
    stagingCount: 0,
    backupCount: 3,
    missingBackupCount: 0,
    receiptCount: 2,
    journalEntries: 4,
    projectionAckEntries: 1,
    checkedAt: 1783665600000,
    ...overrides,
  };
}

test("workspaceAuthorityStatus JSON 输出 ready 状态和 warnings", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL) => {
    assert.equal(
      String(input),
      "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/health?sessionId=session-1",
    );
    return new Response(JSON.stringify({
      success: true,
      data: healthResponse({
        ready: false,
        actualRootHash: "root-drift",
        externalDrift: true,
      }),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityStatus(
      "http://agent.test",
      { projectId: "project-1", workspaceId: "live-1", sessionId: "session-1" },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as {
      success: boolean;
      status: { externalDrift: boolean };
      warnings: string[];
    };

    assert.equal(parsed.success, true);
    assert.equal(parsed.status.externalDrift, true);
    assert.deepEqual(parsed.warnings, ["external drift detected"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspaceAuthorityBootstrap 默认 dry-run 不创建 state", async () => {
  const originalFetch = global.fetch;
  const calls: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({
      success: true,
      data: healthResponse({
        ready: false,
        stateExists: false,
        revision: undefined,
        rootHash: undefined,
        actualRootHash: "root-current",
      }),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityBootstrap(
      "http://agent.test",
      { projectId: "project-1", workspaceId: "live-1", sessionId: "session-1", apply: false },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as {
      action: string;
      applied: boolean;
      dryRun: boolean;
    };

    assert.equal(parsed.action, "would_bootstrap");
    assert.equal(parsed.applied, false);
    assert.equal(parsed.dryRun, true);
    assert.deepEqual(calls, [
      "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/health?sessionId=session-1",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspaceAuthorityPreflight JSON 输出 passed 和空 issues", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL) => {
    assert.equal(
      String(input),
      "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/health?sessionId=session-1",
    );
    return new Response(JSON.stringify({
      success: true,
      data: healthResponse(),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityPreflight(
      "http://agent.test",
      {
        projectId: "project-1",
        workspaceId: "live-1",
        sessionId: "session-1",
        failOnQueue: false,
        failOnStaging: false,
      },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as {
      success: boolean;
      passed: boolean;
      issues: string[];
    };

    assert.equal(parsed.success, true);
    assert.equal(parsed.passed, true);
    assert.deepEqual(parsed.issues, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspaceAuthorityPreflight JSON 输出阻断 issues", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => new Response(JSON.stringify({
    success: true,
    data: healthResponse({
      ready: false,
      stateExists: false,
      actualRootHash: "root-drift",
      externalDrift: true,
      activeLease: true,
      preparedCount: 1,
    }),
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityPreflight(
      "http://agent.test",
      {
        projectId: "project-1",
        workspaceId: "live-1",
        sessionId: "session-1",
        failOnQueue: false,
        failOnStaging: false,
      },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as {
      passed: boolean;
      issues: string[];
    };

    assert.equal(parsed.passed, false);
    assert.deepEqual(parsed.issues, [
      "authority state missing",
      "external drift detected",
      "active or stale write lease exists",
      "prepared transactions need recovery",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspaceAuthorityPreflight 可选把 queue 和 staging 判失败", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => new Response(JSON.stringify({
    success: true,
    data: healthResponse({
      queueDepth: 2,
      stagingCount: 1,
    }),
  }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityPreflight(
      "http://agent.test",
      {
        projectId: "project-1",
        workspaceId: "live-1",
        sessionId: "session-1",
        failOnQueue: true,
        failOnStaging: true,
      },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as {
      passed: boolean;
      issues: string[];
    };

    assert.equal(parsed.passed, false);
    assert.deepEqual(parsed.issues, [
      "workspace mutation queue is not empty",
      "staging files exist",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspaceAuthorityBootstrap 加 apply 后调用 state 入口", async () => {
  const originalFetch = global.fetch;
  const calls: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    if (String(input).endsWith("/state?sessionId=session-1")) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          workspaceId: "live-1",
          projectId: "project-1",
          revision: 1,
          rootHash: "root-1",
          resourceHashes: {},
          updatedAt: 1783665600001,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      success: true,
      data: healthResponse({ ready: false, stateExists: false }),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityBootstrap(
      "http://agent.test",
      { projectId: "project-1", workspaceId: "live-1", sessionId: "session-1", apply: true },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as {
      action: string;
      applied: boolean;
      state: { revision: number };
    };

    assert.equal(parsed.action, "bootstrap");
    assert.equal(parsed.applied, true);
    assert.equal(parsed.state.revision, 1);
    assert.deepEqual(calls, [
      "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/health?sessionId=session-1",
      "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/state?sessionId=session-1",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspaceAuthorityReconcileAdopt 默认 dry-run 不调用 adopt", async () => {
  const originalFetch = global.fetch;
  const calls: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({
      success: true,
      data: healthResponse({
        ready: false,
        actualRootHash: "root-drift",
        externalDrift: true,
      }),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityReconcileAdopt(
      "http://agent.test",
      { projectId: "project-1", workspaceId: "live-1", sessionId: "session-1", apply: false },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as {
      action: string;
      applied: boolean;
      dryRun: boolean;
    };

    assert.equal(parsed.action, "would_adopt");
    assert.equal(parsed.applied, false);
    assert.equal(parsed.dryRun, true);
    assert.deepEqual(calls, [
      "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/health?sessionId=session-1",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspaceAuthorityReconcileAdopt 加 apply 后调用 adopt POST", async () => {
  const originalFetch = global.fetch;
  const calls: Array<{ url: string; method?: string }> = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method });
    if (String(input).includes("/reconcile/adopt")) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          workspaceId: "live-1",
          projectId: "project-1",
          revision: 4,
          rootHash: "root-adopted",
          resourceHashes: {},
          updatedAt: 1783665600002,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      success: true,
      data: healthResponse({
        ready: false,
        actualRootHash: "root-drift",
        externalDrift: true,
      }),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityReconcileAdopt(
      "http://agent.test",
      { projectId: "project-1", workspaceId: "live-1", sessionId: "session-1", apply: true },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as {
      action: string;
      applied: boolean;
      state: { revision: number };
    };

    assert.equal(parsed.action, "reconcile_adopt");
    assert.equal(parsed.applied, true);
    assert.equal(parsed.state.revision, 4);
    assert.deepEqual(calls, [
      {
        url: "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/health?sessionId=session-1",
        method: "GET",
      },
      {
        url: "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/reconcile/adopt?sessionId=session-1",
        method: "POST",
      },
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspaceAuthorityReconcileRestore 默认 dry-run 不调用 restore", async () => {
  const originalFetch = global.fetch;
  const calls: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({
      success: true,
      data: healthResponse({ ready: false, actualRootHash: "root-drift", externalDrift: true }),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityReconcileRestore(
      "http://agent.test",
      { projectId: "project-1", workspaceId: "live-1", sessionId: "session-1", apply: false },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as { action: string; applied: boolean; dryRun: boolean };
    assert.equal(parsed.action, "would_restore");
    assert.equal(parsed.applied, false);
    assert.equal(parsed.dryRun, true);
    assert.equal(calls.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspaceAuthorityReconcileRestore 加 apply 后调用 restore POST", async () => {
  const originalFetch = global.fetch;
  const calls: Array<{ url: string; method?: string }> = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method });
    if (String(input).includes("/reconcile/restore")) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          workspaceId: "live-1", projectId: "project-1", revision: 3,
          rootHash: "root-3", resourceHashes: {}, updatedAt: 1783665600003,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      success: true,
      data: healthResponse({ ready: false, actualRootHash: "root-drift", externalDrift: true }),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityReconcileRestore(
      "http://agent.test",
      { projectId: "project-1", workspaceId: "live-1", sessionId: "session-1", apply: true },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as { action: string; applied: boolean; state: { revision: number } };
    assert.equal(parsed.action, "reconcile_restore");
    assert.equal(parsed.applied, true);
    assert.equal(parsed.state.revision, 3);
    assert.deepEqual(calls, [
      {
        url: "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/health?sessionId=session-1",
        method: "GET",
      },
      {
        url: "http://agent.test/api/workspace-authority/projects/project-1/workspaces/live-1/reconcile/restore?sessionId=session-1",
        method: "POST",
      },
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("workspaceAuthorityStatus JSON 输出服务错误", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => new Response(JSON.stringify({
    success: false,
    error: {
      code: "SESSION_NOT_FOUND",
      message: "SESSION_NOT_FOUND",
    },
  }), { status: 403, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  try {
    const output = await captureConsole(() => workspaceAuthorityStatus(
      "http://agent.test",
      { projectId: "project-1", workspaceId: "live-1", sessionId: "missing" },
      true,
    ));
    const parsed = JSON.parse(output.join("\n")) as {
      success: boolean;
      error: { code: string };
    };

    assert.equal(parsed.success, false);
    assert.equal(parsed.error.code, "SESSION_NOT_FOUND");
  } finally {
    global.fetch = originalFetch;
  }
});
