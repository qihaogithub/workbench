import { readFileSync } from "node:fs";
import path from "node:path";

import { parse as parseDotEnv } from "dotenv";

export interface LoadWorkspaceEnvOptions {
  readonly rootEnvPath?: string;
  readonly serviceEnvPath?: string;
  readonly processEnv?: NodeJS.ProcessEnv;
}

function parseOptionalEnvFile(filePath: string | undefined): Record<string, string> {
  if (!filePath) return {};

  try {
    return parseDotEnv(readFileSync(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

/**
 * Loads env files without mutating process.env.
 * Precedence: current process environment > service .env > root .env.
 */
export function loadWorkspaceEnv(
  options: LoadWorkspaceEnvOptions = {},
): Record<string, string> {
  const rootEnvPath =
    options.rootEnvPath ?? path.resolve(process.cwd(), ".env");
  const merged: Record<string, string> = {
    ...parseOptionalEnvFile(rootEnvPath),
    ...parseOptionalEnvFile(options.serviceEnvPath),
  };

  for (const [key, value] of Object.entries(options.processEnv ?? process.env)) {
    if (value !== undefined) merged[key] = value;
  }

  return merged;
}

/** Applies the merged environment once while preserving values already set by the process. */
export function applyWorkspaceEnv(
  options: LoadWorkspaceEnvOptions = {},
): NodeJS.ProcessEnv {
  const target = options.processEnv ?? process.env;
  const loaded = loadWorkspaceEnv({ ...options, processEnv: target });
  for (const [key, value] of Object.entries(loaded)) {
    if (target[key] === undefined) target[key] = value;
  }
  return target;
}

export interface IntegerParserOptions {
  readonly name?: string;
  readonly defaultValue?: number;
  readonly min?: number;
  readonly max?: number;
}

export interface BooleanParserOptions {
  readonly name?: string;
  readonly defaultValue?: boolean;
}

export interface HttpUrlParserOptions {
  readonly name?: string;
  readonly defaultValue?: string;
}

export class EnvConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvConfigError";
  }
}

function configName(name: string | undefined): string {
  return name ? ` for ${name}` : "";
}

function assertIntegerRange(
  value: number,
  options: IntegerParserOptions,
  source: string,
): void {
  if (!Number.isSafeInteger(value)) {
    throw new EnvConfigError(
      `Expected a safe integer${configName(options.name)}${source}`,
    );
  }
  if (options.min !== undefined && value < options.min) {
    throw new EnvConfigError(
      `Expected an integer >= ${options.min}${configName(options.name)}`,
    );
  }
  if (options.max !== undefined && value > options.max) {
    throw new EnvConfigError(
      `Expected an integer <= ${options.max}${configName(options.name)}`,
    );
  }
}

export function parseStrictInteger(
  value: string | undefined,
  options: IntegerParserOptions = {},
): number | undefined {
  if (value === undefined) {
    if (options.defaultValue === undefined) return undefined;
    assertIntegerRange(options.defaultValue, options, " in the default value");
    return options.defaultValue;
  }

  if (!/^[+-]?\d+$/.test(value)) {
    throw new EnvConfigError(
      `Expected an integer${configName(options.name)}`,
    );
  }

  const parsed = Number(value);
  assertIntegerRange(parsed, options, "");
  return parsed;
}

export const parseInteger = parseStrictInteger;

export function parseStrictBoolean(
  value: string | undefined,
  options: BooleanParserOptions = {},
): boolean | undefined {
  if (value === undefined) return options.defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;

  throw new EnvConfigError(
    `Expected "true" or "false"${configName(options.name)}`,
  );
}

export const parseBoolean = parseStrictBoolean;

export function parseHttpUrl(
  value: string | undefined,
  options: HttpUrlParserOptions = {},
): string | undefined {
  const candidate = value ?? options.defaultValue;
  if (candidate === undefined) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new EnvConfigError(`Expected an HTTP URL${configName(options.name)}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new EnvConfigError(`Expected an HTTP URL${configName(options.name)}`);
  }
  if (parsed.username || parsed.password) {
    throw new EnvConfigError(
      `HTTP URLs with credentials are not allowed${configName(options.name)}`,
    );
  }

  return parsed.toString();
}

export const parseStrictHttpUrl = parseHttpUrl;
