export interface SpineAssetRefV1 {
  kind: "spine";
  version: 1;
  assetId: `spine_${string}`;
}

export interface SpineAssetManifestV1 {
  schemaVersion: 1;
  kind: "spine";
  assetId: string;
  sourceHash: string;
  originalName: string;
  spineVersion: "4.2" | "4.3";
  skeleton: string;
  atlas: string;
  textures: string[];
  /** Audio files shipped by the Spine export. `keys` resolve runtime EventData.audioPath. */
  audio: Array<{ path: string; keys: string[]; size: number; sha256: string }>;
  animations?: string[];
  files: Array<{ path: string; size: number; sha256: string }>;
}

export interface ConfigFieldCapability {
  atomic: boolean;
  accept?: string;
  widget?: string;
}

export type ConfigFieldClassification = "atomic" | "group" | "scalar";

export const CONFIG_FIELD_CAPABILITIES: Readonly<Record<string, ConfigFieldCapability>> = {
  image: { atomic: true, widget: "image" },
  video: { atomic: true, widget: "file" },
  spine: { atomic: true, accept: ".zip,.zip.flutter,application/zip,application/x-zip-compressed", widget: "spine" },
};

export function getConfigFieldCapability(format: unknown): ConfigFieldCapability | undefined {
  return typeof format === "string" ? CONFIG_FIELD_CAPABILITIES[format] : undefined;
}

export function isAtomicConfigField(field: Record<string, unknown>): boolean {
  const capability = getConfigFieldCapability(field.format);
  return capability?.atomic === true;
}

/** Shared schema classification used by both the editor and demo-ui. */
export function classifyConfigField(field: Record<string, unknown>): ConfigFieldClassification {
  if (isAtomicConfigField(field)) return "atomic";
  if (field.type === "object" && isPlainRecord(field.properties)) return "group";
  return "scalar";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSpineAssetRef(value: unknown): value is SpineAssetRefV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "spine"
    && candidate.version === 1
    && typeof candidate.assetId === "string"
    && /^spine_[a-f0-9]{64}$/.test(candidate.assetId);
}
