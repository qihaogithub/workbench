export const SECRET_KEYS = [
  "JWT_SECRET",
  "MODEL_CONFIG_ENCRYPTION_KEY",
  "EXTERNAL_AUTH_ENCRYPTION_KEY",
  "INTERNAL_API_TOKEN",
  "ADMIN_SECRET",
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];
export type ResolvedSecrets = Partial<Record<SecretKey, string>>;

export interface ResolveSecretsOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly nodeEnv?: string;
  readonly fallback?: Partial<Record<SecretKey, string | undefined>>;
  readonly required?: readonly SecretKey[];
}

export class MissingProductionSecretsError extends Error {
  readonly missing: readonly SecretKey[];

  constructor(missing: readonly SecretKey[]) {
    super(`Missing required production secrets: ${missing.join(", ")}`);
    this.name = "MissingProductionSecretsError";
    this.missing = missing;
  }
}

/**
 * Resolves secrets at the server boundary without embedding development
 * credentials. Explicit fallbacks are accepted only outside production.
 */
export function resolveSecrets(
  options: ResolveSecretsOptions = {},
): ResolvedSecrets {
  const env = options.env ?? process.env;
  const isProduction = (options.nodeEnv ?? env.NODE_ENV) === "production";
  const resolved: ResolvedSecrets = {};
  const missing: SecretKey[] = [];
  const required = new Set(options.required ?? SECRET_KEYS);

  for (const key of SECRET_KEYS) {
    const environmentValue = env[key];
    const fallbackValue = options.fallback?.[key];
    if (
      fallbackValue !== undefined &&
      (typeof fallbackValue !== "string" || fallbackValue.length === 0)
    ) {
      throw new TypeError(`Fallback for ${key} must be a non-empty string`);
    }
    const value =
      environmentValue !== undefined && environmentValue.length > 0
        ? environmentValue
        : isProduction
          ? undefined
          : fallbackValue;

    if (value !== undefined && value.length > 0) {
      resolved[key] = value;
    } else if (isProduction && required.has(key)) {
      missing.push(key);
    }
  }

  if (isProduction && missing.length > 0) {
    throw new MissingProductionSecretsError(missing);
  }
  return resolved;
}

export function requireSecret(
  key: SecretKey,
  options: Omit<ResolveSecretsOptions, "required"> = {},
): string {
  const value = resolveSecrets({ ...options, required: [key] })[key];
  if (!value) throw new MissingProductionSecretsError([key]);
  return value;
}
