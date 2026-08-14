import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const composePath = new URL("../docker-compose.yml", import.meta.url);

test("viewer Docker build does not inherit the development data endpoint", async () => {
  const compose = await readFile(composePath, "utf8");
  const viewerSection = compose.match(/  viewer-site:\n([\s\S]*)$/)?.[1] ?? "";

  assert.match(
    viewerSection,
    /NEXT_PUBLIC_DATA_BASE=\$\{DOCKER_NEXT_PUBLIC_DATA_BASE:-\}/,
    "viewer Docker builds must use the Docker-scoped override, not NEXT_PUBLIC_DATA_BASE from .env",
  );
  assert.match(
    viewerSection,
    /NEXT_PUBLIC_VIEWER_DOCKER_MODE=true/,
    "viewer Docker builds must opt into same-origin published-data loading",
  );
});

test("author-site Docker CPU budget protects interactive editor latency", async () => {
  const compose = await readFile(composePath, "utf8");
  const authorSection =
    compose.match(/  author-site:\n([\s\S]*?)(?=\n  [a-z][a-z-]+:\n)/)?.[1] ?? "";

  assert.match(
    authorSection,
    /cpus: "2\.0"/,
    "author-site needs two CPUs because editor traffic is latency-sensitive",
  );
});
