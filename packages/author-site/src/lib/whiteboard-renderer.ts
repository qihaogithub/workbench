import crypto from "node:crypto";
import sharp from "sharp";
import {
  renderSketchSceneToSvgMarkup,
  validateSketchSceneDocument,
  type SketchSceneDocument,
} from "@workbench/sketch-core";
import type { WhiteboardDocument } from "@workbench/shared";
import { getImage } from "./image-store";

type FullWhiteboardDocument = Extract<WhiteboardDocument, { version: 2 | 3 }>;

export interface WhiteboardRenderManifestEntry {
  nodeId: string;
  assetRef: string;
  sourceBytes: number;
}

export interface WhiteboardRenderResult {
  png: Buffer;
  sha256: string;
  width: number;
  height: number;
  manifest: WhiteboardRenderManifestEntry[];
  rendererVersion: "sketch-scene-svg-v1";
}

export class WhiteboardRenderError extends Error {
  readonly code: string;
  readonly nodeId?: string;

  constructor(code: string, message: string, nodeId?: string) {
    super(message);
    this.name = "WhiteboardRenderError";
    this.code = code;
    this.nodeId = nodeId;
  }
}

function isVisible(node: { visible?: boolean }): boolean {
  return node.visible !== false;
}

function managedAssetIdFromSource(src: string | undefined): string | null {
  return src?.match(/^\/api\/images\/([A-Za-z0-9_-]{1,128})$/)?.[1] ?? null;
}

function imageDataUrl(mimeType: string | undefined, buffer: Buffer): string {
  return `data:${mimeType || "image/png"};base64,${buffer.toString("base64")}`;
}

function resolveWhiteboardSceneAssets(document: FullWhiteboardDocument): {
  scene: SketchSceneDocument;
  manifest: WhiteboardRenderManifestEntry[];
} {
  const validation = validateSketchSceneDocument(document.scene);
  if (!validation.valid) throw new WhiteboardRenderError("INVALID_SCENE", "白板场景无法渲染，请检查后重试");

  const manifest: WhiteboardRenderManifestEntry[] = [];
  const scene: SketchSceneDocument = {
    ...document.scene,
    nodes: document.scene.nodes.map((node) => {
      if (node.type !== "image" || !isVisible(node)) return node;
      const semantics = document.nodeSemantics[node.id];
      const assetRef = semantics?.assetRef;
      if (!assetRef) throw new WhiteboardRenderError("IMAGE_ASSET_REF_MISSING", `图片节点“${node.name || node.id}”缺少受管图片资源`, node.id);
      if (managedAssetIdFromSource(node.src) !== assetRef) {
        throw new WhiteboardRenderError("IMAGE_ASSET_REF_MISMATCH", `图片节点“${node.name || node.id}”的资源引用不一致`, node.id);
      }
      const image = getImage(assetRef);
      if (!image.buffer) throw new WhiteboardRenderError("IMAGE_ASSET_MISSING", `图片节点“${node.name || node.id}”的资源已失效，请重新上传图片`, node.id);
      if (image.mimeType !== "image/png") throw new WhiteboardRenderError("IMAGE_ASSET_NOT_CANONICAL", `图片节点“${node.name || node.id}”必须使用受管静态 PNG 资源`, node.id);
      manifest.push({ nodeId: node.id, assetRef, sourceBytes: image.buffer.length });
      return { ...node, src: imageDataUrl(image.mimeType, image.buffer) };
    }),
  };
  return { scene, manifest };
}

/**
 * Render the complete whiteboard scene on the server. The client may preview
 * the scene, but it cannot choose the bytes that become the configuration
 * value. Invalid scenes and unresolved visible images fail closed.
 */
export async function renderWhiteboardDocumentToPng(document: FullWhiteboardDocument): Promise<WhiteboardRenderResult> {
  const resolved = resolveWhiteboardSceneAssets(document);
  let png: Buffer;
  try {
    const svg = renderSketchSceneToSvgMarkup(resolved.scene, {}, { withBackground: true });
    png = await sharp(Buffer.from(svg)).png().toBuffer();
  } catch (error) {
    if (error instanceof WhiteboardRenderError) throw error;
    throw new WhiteboardRenderError("RENDER_FAILED", "白板场景生成图片失败，请重试");
  }
  if (!png.length) throw new WhiteboardRenderError("EMPTY_RENDER", "白板生成的图片为空，请重试");

  const metadata = await sharp(png).metadata().catch(() => null);
  const width = metadata?.width;
  const height = metadata?.height;
  if (width !== document.scene.pageSize.width || height !== document.scene.pageSize.height) {
    throw new WhiteboardRenderError("RENDER_SIZE_MISMATCH", "白板生成图片的尺寸与画布不一致，请重试");
  }
  return {
    png,
    sha256: crypto.createHash("sha256").update(png).digest("hex"),
    width,
    height,
    manifest: resolved.manifest,
    rendererVersion: "sketch-scene-svg-v1",
  };
}
