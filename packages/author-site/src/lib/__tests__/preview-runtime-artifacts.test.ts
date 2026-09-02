import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "../..");
const authorRuntimeDir = path.join(
  repoRoot,
  "packages/author-site/public/preview-runtime",
);
const viewerRuntimeDir = path.join(
  repoRoot,
  "packages/viewer-site/public/preview-runtime",
);

describe("generated preview runtime artifacts", () => {
  it.each([
    ["author", authorRuntimeDir],
    ["viewer", viewerRuntimeDir],
  ])(
    "keeps the managed Spine asset contract in the %s runtime",
    (_site, runtimeDir) => {
      const sdk = fs.readFileSync(
        path.join(runtimeDir, "vendor/preview-sdk.js"),
        "utf8",
      );
      const manifest = JSON.parse(
        fs.readFileSync(path.join(runtimeDir, "manifest.json"), "utf8"),
      ) as {
        imports: Record<string, string>;
        packages: Record<string, string>;
      };

      expect(sdk).toContain("SpinePlayer src 必须是 SpineAssetRefV1");
      expect(sdk).toContain("window.__WORKBENCH_SPINE_ASSET_BASE__");
      expect(sdk).toContain("import('@esotericsoftware/spine-webgl-42')");
      expect(sdk).toContain("skeletonObj.updateWorldTransform(physicsMode)");
      expect(sdk).toContain("skeletonObj.getBounds(offset, size)");
      expect(sdk).toContain("fit = 'contain'");
      expect(sdk).toContain("alignment = 'center'");
      expect(sdk).toContain("camera.position.x");
      expect(sdk).toContain("normalizeSpineFit(spineFit) === 'none'");
      expect(sdk).toContain("sceneRenderer.camera.setViewport(w, h); frameSpineCamera()");
      expect(sdk).toContain("console.error('[SpinePlayer]', stage, message)");
      expect(sdk).toContain(".catch((e) => fail('atlas-or-texture-load', e))");
      expect(sdk).not.toContain("assetManager.loadAll();");
      expect(sdk).not.toContain("var skeleton = props.skeleton");
      expect(sdk).not.toContain("skeleton && atlas && texture");
      expect(manifest.imports["@esotericsoftware/spine-webgl-42"]).toBe(
        "/preview-runtime/vendor/spine-webgl-42.js",
      );
      expect(manifest.packages["@esotericsoftware/spine-webgl-42"]).toBe(
        "4.2.112",
      );
    },
  );

  it("generates identical SDK contracts for author and viewer", () => {
    const authorSdk = fs.readFileSync(
      path.join(authorRuntimeDir, "vendor/preview-sdk.js"),
      "utf8",
    );
    const viewerSdk = fs.readFileSync(
      path.join(viewerRuntimeDir, "vendor/preview-sdk.js"),
      "utf8",
    );

    expect(viewerSdk).toBe(authorSdk);
  });
});
