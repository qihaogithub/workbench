import crypto from "node:crypto";

import type {
  PagePackage,
  PagePackageBuildInput,
  PageTransferResource,
} from "./types.js";

const required: Record<string, readonly string[]> = {
  "prototype-html-css": [
    "prototype.html",
    "prototype.css",
    "prototype.meta.json",
    "config.schema.json",
  ],
  "sandboxed-html": [
    "sandbox.html",
    "html-import.meta.json",
    "config.schema.json",
  ],
  "high-fidelity-react": ["index.tsx", "config.schema.json"],
  "sketch-scene": [
    "sketch.scene.json",
    "sketch.meta.json",
    "config.schema.json",
  ],
};

export class PagePackageBuilderError extends Error {
  constructor(
    public readonly code:
      | "INVALID_PAGE_PATH"
      | "MISSING_REQUIRED_RESOURCE"
      | "INVALID_RESOURCE",
    message: string,
  ) {
    super(message);
    this.name = "PagePackageBuilderError";
  }
}

export class PagePackageBuilder {
  build(input: PagePackageBuildInput): PagePackage {
    if (
      !input.pageId ||
      input.pageId.includes("/") ||
      input.pageId.includes("\\") ||
      input.pageId === "." ||
      input.pageId === ".."
    )
      throw new PagePackageBuilderError("INVALID_PAGE_PATH", input.pageId);
    const prefix = `demos/${input.pageId}/`;
    const resources: PageTransferResource[] = Object.entries(input.resources)
      .flatMap(([rawPath, content]) => {
        const path = rawPath.replace(/\\/g, "/");
        const descriptor = input.registry.describe(path);
        if (!descriptor) return [];
        const bytes = Buffer.isBuffer(content)
          ? content
          : Buffer.from(content, "utf8");
        try {
          if (descriptor.text)
            input.registry.assertTextWrite(path, bytes.toString("utf8"));
          else input.registry.assertBinaryWrite(path, bytes);
        } catch {
          throw new PagePackageBuilderError("INVALID_RESOURCE", path);
        }
        return [
          {
            path,
            content,
            contentHash: crypto
              .createHash("sha256")
              .update(bytes)
              .digest("hex"),
            kind: descriptor.kind,
            size: bytes.length,
          },
        ];
      })
      .sort((a, b) => a.path.localeCompare(b.path));
    const names = new Set(
      resources
        .filter((resource) => resource.path.startsWith(prefix))
        .map((r) => r.path.slice(prefix.length)),
    );
    for (const name of required[input.meta.runtimeType])
      if (!names.has(name))
        throw new PagePackageBuilderError(
          "MISSING_REQUIRED_RESOURCE",
          `${input.meta.runtimeType} requires ${prefix}${name}`,
        );
    const packageHash = crypto
      .createHash("sha256")
      .update(resources.map((r) => `${r.path}\0${r.contentHash}`).join("\n"))
      .digest("hex");
    return {
      pageId: input.pageId,
      meta: { ...input.meta },
      resources,
      packageHash,
      referenceMeta: input.referenceMeta
        ? { ...input.referenceMeta }
        : undefined,
    };
  }
}
