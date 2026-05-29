"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

interface SchemaProperty {
  key: string;
  type: "string" | "number" | "boolean" | "enum";
  title: string;
  description?: string;
  default?: unknown;
  enum?: string[];
}

function parseSchema(
  schemaStr: string,
  prefix = "",
): { properties: SchemaProperty[]; defaults: Record<string, unknown> } {
  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(schemaStr);
  } catch {
    return { properties: [], defaults: {} };
  }

  const properties: SchemaProperty[] = [];
  const defaults: Record<string, unknown> = {};
  const props = schema.properties as
    | Record<string, Record<string, unknown>>
    | undefined;

  if (!props) return { properties: [], defaults: {} };

  for (const [key, prop] of Object.entries(props)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const propType = prop.type as string;
    const propEnum = prop.enum as string[] | undefined;

    let schemaType: SchemaProperty["type"];
    if (propEnum && propEnum.length > 0) {
      schemaType = "enum";
    } else if (propType === "string") {
      schemaType = "string";
    } else if (propType === "number" || propType === "integer") {
      schemaType = "number";
    } else if (propType === "boolean") {
      schemaType = "boolean";
    } else {
      schemaType = "string";
    }

    properties.push({
      key: fullKey,
      type: schemaType,
      title: (prop.title as string) || key,
      description: prop.description as string | undefined,
      default: prop.default,
      enum: propEnum,
    });

    if (prop.default !== undefined) {
      defaults[fullKey] = prop.default;
    }
  }

  return { properties, defaults };
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function setNestedValue(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const parts = key.split(".");
  const result = { ...obj };
  let current = result as Record<string, unknown>;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      !current[part] ||
      typeof current[part] !== "object" ||
      Array.isArray(current[part])
    ) {
      current[part] = {};
    } else {
      current[part] = { ...current[part] };
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result;
}

interface StaticConfigPanelProps {
  projectConfigSchema?: string;
  demoSchemas: Array<{ demoId: string; demoName: string; schema: string }>;
  configData: Record<string, unknown>;
  onConfigChange: (data: Record<string, unknown>) => void;
}

export function StaticConfigPanel({
  projectConfigSchema,
  demoSchemas,
  configData,
  onConfigChange,
}: StaticConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<string>("");

  const allSchemas = useMemo(() => {
    const result: Array<{
      id: string;
      name: string;
      schema: string;
    }> = [];

    if (projectConfigSchema) {
      result.push({
        id: "__project__",
        name: "项目配置",
        schema: projectConfigSchema,
      });
    }

    for (const ds of demoSchemas) {
      result.push({
        id: ds.demoId,
        name: ds.demoName,
        schema: ds.schema,
      });
    }

    return result;
  }, [projectConfigSchema, demoSchemas]);

  useEffect(() => {
    if (!activeTab && allSchemas.length > 0) {
      setActiveTab(allSchemas[0].id);
    }
  }, [activeTab, allSchemas]);

  const currentSchema = allSchemas.find((s) => s.id === activeTab);

  const parsedProperties = useMemo(() => {
    if (!currentSchema) return [];
    const { properties } = parseSchema(currentSchema.schema);
    return properties;
  }, [currentSchema]);

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      const newData = setNestedValue(configData, key, value);
      onConfigChange(newData);
    },
    [configData, onConfigChange],
  );

  if (allSchemas.length === 0) return null;

  return (
    <div className="flex flex-col h-full">
      {allSchemas.length > 1 && (
        <div className="flex border-b border-border overflow-x-auto shrink-0">
          {allSchemas.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveTab(s.id)}
              className={`px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                activeTab === s.id
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {parsedProperties.map((prop) => (
          <div key={prop.key}>
            <label className="block text-sm font-medium mb-1">
              {prop.title}
            </label>
            {prop.description && (
              <p className="text-xs text-muted-foreground mb-1">
                {prop.description}
              </p>
            )}
            {prop.type === "boolean" ? (
              <button
                onClick={() =>
                  handleChange(prop.key, !getNestedValue(configData, prop.key))
                }
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  getNestedValue(configData, prop.key)
                    ? "bg-primary"
                    : "bg-secondary"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    getNestedValue(configData, prop.key)
                      ? "translate-x-4"
                      : "translate-x-0.5"
                  }`}
                />
              </button>
            ) : prop.type === "enum" && prop.enum ? (
              <select
                value={(getNestedValue(configData, prop.key) as string) ?? ""}
                onChange={(e) => handleChange(prop.key, e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              >
                {prop.enum.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : prop.type === "number" ? (
              <input
                type="number"
                value={
                  (getNestedValue(configData, prop.key) as number) ?? ""
                }
                onChange={(e) =>
                  handleChange(
                    prop.key,
                    e.target.value === ""
                      ? undefined
                      : Number(e.target.value),
                  )
                }
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            ) : (
              <input
                type="text"
                value={(getNestedValue(configData, prop.key) as string) ?? ""}
                onChange={(e) => handleChange(prop.key, e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
