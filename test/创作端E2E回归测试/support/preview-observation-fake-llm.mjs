import http from "node:http";

const port = Number(process.env.PREVIEW_OBSERVATION_FAKE_LLM_PORT ?? 4409);
const logEnabled = process.env.PREVIEW_OBSERVATION_FAKE_LLM_LOG === "1";
let requestCount = 0;

const observationSteps = [
  {
    id: "e2e-observe-1",
    arguments: {
      target: { nodeId: "obs-center" },
      assertions: [
        { id: "exists", type: "exists" },
        { id: "visible", type: "visible" },
        { id: "runtime-ready", type: "runtime-ready" },
        { id: "no-runtime-errors", type: "no-runtime-errors" },
      ],
    },
  },
  {
    id: "e2e-observe-2",
    arguments: {
      target: { nodeId: "obs-center" },
      assertions: [
        { id: "exists", type: "exists" },
        { id: "visible", type: "visible" },
        { id: "runtime-ready", type: "runtime-ready" },
        { id: "no-runtime-errors", type: "no-runtime-errors" },
      ],
    },
  },
  {
    id: "e2e-observe-3",
    arguments: {
      target: { nodeId: "obs-display-none" },
      assertions: [{ id: "visible", type: "visible" }],
    },
  },
  {
    id: "e2e-observe-4",
    arguments: {
      target: { nodeId: "obs-failing-image" },
      detail: "media",
      assertions: [{ id: "image-loaded", type: "image-loaded" }],
    },
  },
  {
    id: "e2e-observe-5",
    arguments: {
      target: {
        sourceFile: "fixtures/preview-observation.tsx",
        sourceLine: 99,
      },
    },
  },
  {
    id: "e2e-observe-6",
    arguments: {
      pageId: "missing-old-revision",
      target: { nodeId: "obs-center" },
    },
  },
  ...["obs-northwest", "obs-northeast", "obs-southwest", "obs-southeast"].map(
    (nodeId, index) => ({
      id: `e2e-observe-${index + 7}`,
      arguments: {
        target: { nodeId },
      },
    }),
  ),
  {
    id: "e2e-observe-11",
    arguments: {
      target: { nodeId: "obs-scroll-item" },
      includeAncestors: true,
    },
  },
  {
    id: "e2e-observe-12",
    arguments: {
      target: { nodeId: "obs-transform" },
    },
  },
  {
    id: "e2e-observe-13",
    arguments: {
      target: { nodeId: "obs-overflow-child" },
      includeAncestors: true,
    },
  },
  ...["obs-display-none", "obs-visibility-hidden", "obs-opacity-zero"].map(
    (nodeId, index) => ({
      id: `e2e-observe-${index + 14}`,
      arguments: {
        target: { nodeId },
        assertions: [{ id: "visible", type: "visible" }],
      },
    }),
  ),
  {
    id: "e2e-observe-17",
    arguments: {
      target: { nodeId: "obs-failing-image" },
      detail: "media",
      assertions: [{ id: "image-loaded", type: "image-loaded" }],
    },
  },
];

const runtimeErrorObservationSteps = [
  {
    id: "e2e-runtime-observe-1",
    arguments: {
      detail: "runtime",
      assertions: [{ id: "no-runtime-errors", type: "no-runtime-errors" }],
    },
  },
];

const runtimeErrorRetryObservationSteps = [2, 3, 4, 5, 6, 7, 8, 9].map(
  (index) => ({
    id: `e2e-runtime-observe-${index}`,
    arguments: {
      detail: "runtime",
      assertions: [{ id: "no-runtime-errors", type: "no-runtime-errors" }],
    },
  }),
);

const screenshotUnavailableObservationSteps = [
  {
    id: "e2e-screenshot-unavailable-observe",
    arguments: {
      target: { nodeId: "obs-center" },
      assertions: [
        { id: "exists", type: "exists" },
        { id: "visible", type: "visible" },
      ],
    },
  },
];

const MAX_STALE_RETRIES = 4;

function retryAttempt(id) {
  const match = id.match(/-retry(?:-(\d+))?$/u);
  return match ? Number(match[1] ?? 1) : 0;
}

function retryBaseId(id) {
  return id.replace(/-retry(?:-\d+)?$/u, "");
}

function prototypeRetryId(baseId, attempt) {
  return `${baseId}-retry${attempt === 1 ? "" : `-${attempt}`}`;
}

function containsStaleAvailability(value, depth = 0) {
  if (depth > 5 || value == null) return false;
  if (typeof value === "string") {
    try {
      return containsStaleAvailability(JSON.parse(value), depth + 1);
    } catch {
      return false;
    }
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsStaleAvailability(item, depth + 1));
  }
  if (typeof value !== "object") return false;
  const record = value;
  if (record.availability === "stale") return true;
  return Object.values(record).some((item) =>
    containsStaleAvailability(item, depth + 1),
  );
}

function writeSse(res, message, delayMs = 0) {
  const send = () => {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const chunk = {
      id: `e2e-chat-${requestCount}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "fake-model",
      choices: [
        {
          index: 0,
          delta: message.delta,
          finish_reason: null,
        },
      ],
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    const done = {
      id: `e2e-chat-${requestCount}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "fake-model",
      choices: [{ index: 0, delta: {}, finish_reason: message.finishReason }],
    };
    res.write(`data: ${JSON.stringify(done)}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  };
  if (delayMs > 0) setTimeout(send, delayMs);
  else send();
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    requestCount += 1;
    if (logEnabled) console.log(`fake-llm request ${requestCount}`);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400).end("invalid json");
      return;
    }
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const hasActivation = messages.some(
      (message) =>
        message?.role === "tool" && message.tool_call_id === "e2e-activate-1",
    );
    const completedObservationIds = new Set(
      messages
        .filter((message) => message?.role === "tool")
        .map((message) => message.tool_call_id)
        .filter((id) => typeof id === "string"),
    );
    const staleObservationIds = new Set();
    for (const message of messages) {
      if (message?.role !== "tool" || typeof message.tool_call_id !== "string")
        continue;
      // Provider adapters may serialize tool output as a JSON string, or wrap
      // the observation under result/details/content. Walk the bounded value
      // instead of assuming one provider-specific shape.
      if (containsStaleAvailability(message)) {
        staleObservationIds.add(message.tool_call_id);
      }
    }
    const promptText = messages
      .filter((message) => message?.role === "user")
      .map((message) =>
        typeof message?.content === "string"
          ? message.content
          : JSON.stringify(message?.content ?? ""),
      )
      .join("\n");
    const pageId = promptText.match(
      /demos\/([^/\s]+)\/(?:prototype\.html|index\.tsx)/u,
    )?.[1];
    const isCompileFailureScenario = promptText.includes("compile-failure");
    const isRuntimeErrorScenario = promptText.includes("runtime-error");
    const isQuickSwitchScenario = promptText.includes("quick-switch");
    const isMultiTabScenario = promptText.includes("multi-tab");
    const isScreenshotUnavailableScenario = promptText.includes(
      "screenshot-unavailable",
    );
    // Prompt content can be serialized as a JSON string by provider adapters;
    // keep the synthetic page identity to the safe page-id alphabet instead
    // of allowing trailing escaped quotes/brackets into the observation input.
    const switchPageId = promptText.match(/switch-page=([A-Za-z0-9_-]+)/u)?.[1];
    const activeTabPageId = promptText.match(
      /active-page=([A-Za-z0-9_-]+)/u,
    )?.[1];
    const crossTabPageId = promptText.match(
      /cross-page=([A-Za-z0-9_-]+)/u,
    )?.[1];
    // The iframe can advance a render generation between an observation
    // request and its response. Retry stale results in a bounded way so a
    // single race does not make the browser fixture fail, while preserving a
    // terminal stale result when the identity never converges.
    const scenarioSteps = isCompileFailureScenario
      ? [{ id: "compile-failure", arguments: { detail: "runtime" } }]
      : isRuntimeErrorScenario
        ? runtimeErrorObservationSteps
        : isScreenshotUnavailableScenario
          ? screenshotUnavailableObservationSteps
          : isQuickSwitchScenario && switchPageId
            ? [
                {
                  id: "e2e-switch-before",
                  arguments: {
                    pageId,
                    target: { nodeId: "obs-center" },
                  },
                },
                {
                  id: "e2e-switch-old-page",
                  arguments: {
                    pageId,
                    target: { nodeId: "obs-center" },
                  },
                },
                {
                  id: "e2e-switch-active-page",
                  arguments: {
                    pageId: switchPageId,
                    target: { nodeId: "obs-center" },
                  },
                },
              ]
            : isMultiTabScenario && activeTabPageId && crossTabPageId
              ? [
                  {
                    id: "e2e-tab-own-before",
                    arguments: {
                      pageId: activeTabPageId,
                      target: { nodeId: "obs-center" },
                    },
                  },
                  {
                    id: "e2e-tab-cross",
                    arguments: {
                      pageId: crossTabPageId,
                      target: { nodeId: "obs-center" },
                    },
                  },
                  {
                    id: "e2e-tab-own-after",
                    arguments: {
                      pageId: activeTabPageId,
                      target: { nodeId: "obs-center" },
                    },
                  },
                ]
              : observationSteps;
    let retryObservation;
    if (isRuntimeErrorScenario) {
      // Keep one bounded follow-up observation in the runtime-error fixture.
      // The first response is intentionally allowed to race registration and
      // return stale; the second request verifies that the originating
      // connection can converge on the current runtime identity.  Some
      // provider adapters omit nested tool-result details from the next
      // request, so do not make this retry depend solely on parsing them.
      if (
        completedObservationIds.has("e2e-runtime-observe-1") &&
        !completedObservationIds.has("e2e-runtime-observe-2")
      ) {
        retryObservation = runtimeErrorRetryObservationSteps[0];
      }
      const staleRuntimeAttempts = [...staleObservationIds]
        .filter((id) => id.startsWith("e2e-runtime-observe-"))
        .map((id) => Number(id.match(/e2e-runtime-observe-(\d+)/u)?.[1] ?? 0))
        .filter((attempt) => Number.isFinite(attempt));
      const nextAttempt = Math.max(1, ...staleRuntimeAttempts) + 1;
      if (
        !retryObservation &&
        staleRuntimeAttempts.length > 0 &&
        nextAttempt <= runtimeErrorRetryObservationSteps.length + 1 &&
        !completedObservationIds.has(`e2e-runtime-observe-${nextAttempt}`)
      ) {
        retryObservation = runtimeErrorRetryObservationSteps.find(
          (step) => step.id === `e2e-runtime-observe-${nextAttempt}`,
        );
      }
    } else {
      for (const staleId of staleObservationIds) {
        const baseId = retryBaseId(staleId);
        const original = observationSteps.find((step) => step.id === baseId);
        if (!original) continue;
        const attempt = retryAttempt(staleId);
        if (attempt >= MAX_STALE_RETRIES) continue;
        const retryId = prototypeRetryId(baseId, attempt + 1);
        if (!completedObservationIds.has(retryId)) {
          retryObservation = { ...original, id: retryId };
          break;
        }
      }
    }
    const toolNames = Array.isArray(payload.tools)
      ? payload.tools.map((tool) => tool?.function?.name)
      : [];
    if (logEnabled) {
      console.log(
        `fake-llm request ${requestCount} stream=${payload.stream === true ? "true" : "false"} messages=${messages.length} tools=${toolNames.filter(Boolean).join(",")} completed=${[...completedObservationIds].join(",")}`,
      );
    }

    // The editor asks the same provider for a short conversation title before
    // the agent run.  That request is non-streaming and must receive a normal
    // JSON Chat Completions response; returning SSE here makes the title call
    // consume/abort the provider connection and can prevent the following
    // tool-enabled run from starting.
    if (payload.stream !== true) {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-cache",
      });
      res.end(
        JSON.stringify({
          id: `e2e-chat-${requestCount}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "fake-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "预览观察验收" },
              finish_reason: "stop",
            },
          ],
        }),
      );
      return;
    }

    const nextObservation =
      retryObservation ??
      scenarioSteps.find((step) => !completedObservationIds.has(step.id));
    if (!nextObservation) {
      writeSse(res, {
        delta: { role: "assistant", content: "真实 Broker 观察完成" },
        finishReason: "stop",
      });
      return;
    }
    if (!hasActivation && toolNames.includes("activateCapabilities")) {
      writeSse(res, {
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "e2e-activate-1",
              type: "function",
              function: {
                name: "activateCapabilities",
                arguments:
                  '{"capabilities":["workspace"],"reason":"Run the preview observation acceptance fixture."}',
              },
            },
          ],
        },
        finishReason: "tool_calls",
      });
      return;
    }
    if (
      !isRuntimeErrorScenario &&
      !isCompileFailureScenario &&
      !isQuickSwitchScenario &&
      !isMultiTabScenario &&
      !completedObservationIds.has("e2e-edit-1") &&
      pageId &&
      toolNames.includes("editFile")
    ) {
      writeSse(res, {
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "e2e-edit-1",
              type: "function",
              function: {
                name: "editFile",
                arguments: JSON.stringify({
                  path: `demos/${pageId}/prototype.html`,
                  edits: [
                    {
                      old_string: "</main>",
                      new_string: "<!-- agent commit -->\n</main>",
                    },
                  ],
                }),
              },
            },
          ],
        },
        finishReason: "tool_calls",
      });
      return;
    }
    if (
      isScreenshotUnavailableScenario &&
      toolNames.includes("captureScreenshot") &&
      !completedObservationIds.has("e2e-screenshot-unavailable")
    ) {
      writeSse(res, {
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "e2e-screenshot-unavailable",
              type: "function",
              function: {
                name: "captureScreenshot",
                arguments: JSON.stringify({
                  pageId,
                  renderMode: "strict",
                }),
              },
            },
          ],
        },
        finishReason: "tool_calls",
      });
      return;
    }
    if (toolNames.includes("observePreview")) {
      const quickSwitchDelay =
        isQuickSwitchScenario &&
        completedObservationIds.has("e2e-switch-before") &&
        !completedObservationIds.has("e2e-switch-old-page")
          ? 10000
          : 0;
      writeSse(
        res,
        {
          delta: {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: nextObservation.id,
                type: "function",
                function: {
                  name: "observePreview",
                  arguments: JSON.stringify(nextObservation.arguments),
                },
              },
            ],
          },
          finishReason: "tool_calls",
        },
        quickSwitchDelay ||
          (!isRuntimeErrorScenario &&
          completedObservationIds.has("e2e-edit-1") &&
          !completedObservationIds.has("e2e-observe-1")
            ? 5000
            : 0),
      );
      return;
    }
    writeSse(res, {
      delta: { role: "assistant", content: "fake model complete" },
      finishReason: "stop",
    });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`fake-llm listening on http://127.0.0.1:${port}/v1`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
