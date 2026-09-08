import { logger } from "../utils/logger";
import type { ImageGenRuntimeConfig } from "./image-gen-config";

export type ImageGenApiProfile =
  | "auto"
  | "gpt-image"
  | "dall-e-3"
  | "generation-only";
export interface ImageGenCapabilities {
  apiProfile: ImageGenApiProfile;
  model: string;
  supportsReferences: boolean;
  qualityIds: string[];
  sizeIds: string[];
  maxCount: number;
  maxPromptLength: number;
}
export interface ImageGenerationRequest {
  sessionId?: string;
  prompt: string;
  size?: string;
  quality?: string;
  count?: number;
  references?: Array<{ mimeType: string; dataBase64: string }>;
  signal?: AbortSignal;
}
export interface GeneratedImageData {
  mimeType: string;
  dataBase64: string;
  width?: number;
  height?: number;
}
export interface ImageGenerationResult {
  images: GeneratedImageData[];
  size: string;
  quality: string;
  apiProfile: ImageGenApiProfile;
}

const DALLE_SIZES = ["1024x1024", "1024x1792", "1792x1024"];
const GPT_IMAGE_SIZES = ["auto", "1024x1024", "1024x1536", "1536x1024"];
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const counts = new Map<string, number>();

export function getImageGenCapabilities(
  config: ImageGenRuntimeConfig,
): ImageGenCapabilities {
  const profile = resolveApiProfile(config.apiProfile, config.model);
  const gpt = profile === "gpt-image";
  return {
    apiProfile: profile,
    model: config.model,
    supportsReferences: gpt,
    qualityIds: gpt
      ? ["auto", "low", "medium", "high"]
      : profile === "dall-e-3"
        ? ["standard", "hd"]
        : ["auto"],
    sizeIds: gpt
      ? GPT_IMAGE_SIZES
      : profile === "dall-e-3"
        ? DALLE_SIZES
        : ["1024x1024"],
    maxCount: gpt ? 4 : 1,
    maxPromptLength: config.maxPromptLen,
  };
}

export function resolveApiProfile(
  value: ImageGenApiProfile | undefined,
  model: string,
): ImageGenApiProfile {
  if (value && value !== "auto") return value;
  const normalized = model.toLowerCase();
  if (normalized.includes("gpt-image") || normalized.includes("image-1"))
    return "gpt-image";
  if (normalized.includes("dall-e-3") || normalized.includes("dall·e-3"))
    return "dall-e-3";
  return "generation-only";
}

export function getImageGenSessionCount(sessionId: string): number {
  return counts.get(sessionId) ?? 0;
}
export function resetImageGenSessionCount(sessionId: string): void {
  counts.delete(sessionId);
}

export async function generateImage(
  request: ImageGenerationRequest,
  config: ImageGenRuntimeConfig,
): Promise<ImageGenerationResult> {
  const prompt = request.prompt.trim();
  if (!prompt) throw new Error("empty_prompt");
  if (prompt.length > config.maxPromptLen) throw new Error("prompt_too_long");
  const caps = getImageGenCapabilities(config);
  const size = request.size ?? caps.sizeIds[0];
  const quality = request.quality ?? caps.qualityIds[0];
  const count = request.count ?? 1;
  if (!caps.sizeIds.includes(size)) throw new Error("invalid_size");
  if (!caps.qualityIds.includes(quality)) throw new Error("invalid_quality");
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > Math.min(4, caps.maxCount)
  )
    throw new Error("invalid_count");
  const refs = request.references ?? [];
  if (refs.length > 4) throw new Error("too_many_references");
  if (refs.length && !caps.supportsReferences)
    throw new Error("references_not_supported");
  for (const ref of refs) {
    if (!/^image\/(png|jpe?g|webp)$/.test(ref.mimeType))
      throw new Error("invalid_reference_type");
    const bytes = Buffer.byteLength(ref.dataBase64, "base64");
    if (!bytes || bytes > MAX_REFERENCE_BYTES)
      throw new Error("reference_too_large");
  }
  const sessionId = request.sessionId;
  if (
    sessionId &&
    config.maxPerSession > 0 &&
    getImageGenSessionCount(sessionId) + count > config.maxPerSession
  )
    throw new Error("quota_exceeded");
  let lastError = "unknown_error";
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const images = await callProvider(
        { ...request, prompt, size, quality, count, references: refs },
        config,
        caps,
      );
      if (images.length !== count)
        throw new Error(`wrong_result_count:${images.length}`);
      if (sessionId)
        counts.set(
          sessionId,
          getImageGenSessionCount(sessionId) + images.length,
        );
      return { images, size, quality, apiProfile: caps.apiProfile };
    } catch (error) {
      if (request.signal?.aborted) throw new Error("cancelled");
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < config.maxRetries)
        logger.warn(
          { lastError, remaining: config.maxRetries - attempt },
          "image generation retrying",
        );
    }
  }
  throw new Error(lastError);
}

async function callProvider(
  request: ImageGenerationRequest & {
    size: string;
    quality: string;
    count: number;
  },
  config: ImageGenRuntimeConfig,
  caps: ImageGenCapabilities,
): Promise<GeneratedImageData[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const abort = () => controller.abort();
  request.signal?.addEventListener("abort", abort, { once: true });
  try {
    const form = request.references?.length && caps.supportsReferences;
    const body: FormData | string = form
      ? new FormData()
      : JSON.stringify({
          model: config.model,
          prompt: request.prompt,
          size: request.size,
          n: request.count,
          quality: request.quality,
          ...(caps.apiProfile === "gpt-image"
            ? {}
            : { response_format: "b64_json" }),
        });
    if (form) {
      const formData = body as FormData;
      formData.append("model", config.model);
      formData.append("prompt", request.prompt);
      formData.append("size", request.size);
      formData.append("n", String(request.count));
      formData.append("quality", request.quality);
      for (const ref of request.references ?? [])
        formData.append(
          "image",
          new Blob([Buffer.from(ref.dataBase64, "base64")], {
            type: ref.mimeType,
          }),
          `reference.${ref.mimeType.split("/")[1]}`,
        );
    }
    const res = await fetch(
      `${config.baseUrl}/images/${form ? "edits" : "generations"}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...(form ? {} : { "Content-Type": "application/json" }),
        },
        body,
        signal: controller.signal,
      },
    );
    if (!res.ok) throw new Error(`provider_http_${res.status}`);
    const payload = (await res.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const out: GeneratedImageData[] = [];
    for (const item of payload.data ?? []) {
      if (item.b64_json) {
        const bytes = Buffer.byteLength(item.b64_json, "base64");
        if (!bytes || bytes > MAX_REFERENCE_BYTES) {
          throw new Error("invalid_generated_image");
        }
        out.push({ mimeType: "image/png", dataBase64: item.b64_json });
      }
    }
    return out;
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", abort);
  }
}
