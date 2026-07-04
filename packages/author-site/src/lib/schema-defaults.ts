export function extractSchemaDefaults(
  schemaContent: string,
): Record<string, unknown> {
  try {
    const schema = JSON.parse(schemaContent) as {
      properties?: Record<string, unknown>;
    };
    const defaults: Record<string, unknown> = {};
    if (schema.properties && typeof schema.properties === "object") {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (!prop || typeof prop !== "object") continue;
        const value = prop as { default?: unknown };
        if (value.default !== undefined) {
          defaults[key] = value.default;
        }
      }
    }
    return defaults;
  } catch {
    return {};
  }
}
