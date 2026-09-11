import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  EnvConfigError,
  applyWorkspaceEnv,
  loadWorkspaceEnv,
  parseHttpUrl,
  parseStrictBoolean,
  parseStrictInteger,
} from "../src/env.js";

describe("environment configuration", () => {
  it("merges root, service, and process env without mutating process.env", () => {
    const directory = mkdtempSync(join(tmpdir(), "runtime-config-env-"));
    const rootEnvPath = join(directory, ".env");
    const serviceEnvPath = join(directory, ".env.service");
    writeFileSync(rootEnvPath, "ROOT_ONLY=root\nSHARED=root\n");
    writeFileSync(serviceEnvPath, "SERVICE_ONLY=service\nSHARED=service\n");

    try {
      expect(
        loadWorkspaceEnv({
          rootEnvPath,
          serviceEnvPath,
          processEnv: { SHARED: "process", PROCESS_ONLY: "process" },
        }),
      ).toEqual({
        ROOT_ONLY: "root",
        SERVICE_ONLY: "service",
        SHARED: "process",
        PROCESS_ONLY: "process",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("applies file values without overriding the existing process environment", () => {
    const directory = mkdtempSync(join(tmpdir(), "runtime-config-apply-env-"));
    const rootEnvPath = join(directory, ".env");
    const target = { SHARED: "process" };
    writeFileSync(rootEnvPath, "SHARED=root\nROOT_ONLY=root\n");
    try {
      expect(applyWorkspaceEnv({ rootEnvPath, processEnv: target })).toMatchObject({
        SHARED: "process",
        ROOT_ONLY: "root",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("parses strict integers and booleans", () => {
    expect(parseStrictInteger("-12")).toBe(-12);
    expect(parseStrictInteger(undefined, { defaultValue: 7, min: 1 })).toBe(7);
    expect(parseStrictBoolean("true")).toBe(true);
    expect(parseStrictBoolean("false")).toBe(false);
    expect(parseStrictBoolean(undefined, { defaultValue: true })).toBe(true);
    expect(() => parseStrictInteger("12px")).toThrow(EnvConfigError);
    expect(() => parseStrictInteger("0", { min: 1, name: "PORT" })).toThrow(
      /PORT/,
    );
    expect(() => parseStrictBoolean("yes")).toThrow(EnvConfigError);
  });

  it("accepts only HTTP(S) URLs and rejects embedded credentials", () => {
    expect(parseHttpUrl("https://example.test/api")).toBe(
      "https://example.test/api",
    );
    expect(parseHttpUrl(undefined, { defaultValue: "http://localhost:4200" })).toBe(
      "http://localhost:4200/",
    );
    expect(() => parseHttpUrl("ftp://example.test")).toThrow(EnvConfigError);
    expect(() => parseHttpUrl("https://user:password@example.test")).toThrow(
      /credentials/,
    );
  });
});
