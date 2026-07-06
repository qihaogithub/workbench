import vue from "@vitejs/plugin-vue";
import { createReadStream, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const canvasKitWasmPath = fileURLToPath(
  import.meta.resolve("canvaskit-wasm/bin/canvaskit.wasm"),
);
const openPencilPackageDir = dirname(dirname(fileURLToPath(import.meta.resolve("@open-pencil/core"))));
const openPencilAssetPaths = new Map([
  ["/canvaskit.wasm", {
    path: canvasKitWasmPath,
    contentType: "application/wasm",
  }],
  ["/Inter-Regular.ttf", {
    path: join(openPencilPackageDir, "assets/Inter-Regular.ttf"),
    contentType: "font/ttf",
  }],
  ["/Inter-Medium.ttf", {
    path: join(openPencilPackageDir, "assets/Inter-Medium.ttf"),
    contentType: "font/ttf",
  }],
  ["/Inter-SemiBold.ttf", {
    path: join(openPencilPackageDir, "assets/Inter-SemiBold.ttf"),
    contentType: "font/ttf",
  }],
  ["/Inter-Bold.ttf", {
    path: join(openPencilPackageDir, "assets/Inter-Bold.ttf"),
    contentType: "font/ttf",
  }],
  ["/Inter-ExtraBold.ttf", {
    path: join(openPencilPackageDir, "assets/Inter-ExtraBold.ttf"),
    contentType: "font/ttf",
  }],
  ["/NotoNaskhArabic-Regular.ttf", {
    path: join(openPencilPackageDir, "assets/NotoNaskhArabic-Regular.ttf"),
    contentType: "font/ttf",
  }],
]);

function openPencilAssetsPlugin(): Plugin {
  const serveAsset = (request: { url?: string }, response: {
    setHeader(name: string, value: string): void;
    end(): void;
  }, next: () => void) => {
    const asset = openPencilAssetPaths.get((request.url ?? "").split("?")[0]);
    if (!asset) {
      next();
      return;
    }
    response.setHeader("Content-Type", asset.contentType);
    createReadStream(asset.path).pipe(response);
  };

  return {
    name: "workbench-openpencil-assets",
    configureServer(server) {
      server.middlewares.use(serveAsset);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveAsset);
    },
    generateBundle() {
      for (const [fileName, asset] of openPencilAssetPaths) {
        this.emitFile({
          type: "asset",
          fileName: fileName.slice(1),
          source: readFileSync(asset.path),
        });
      }
    },
  };
}

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /export-worker\.ts$/,
        replacement: "export-worker.js",
      },
      {
        find: /kiwi\/fig\/parse\/worker\.ts$/,
        replacement: "kiwi/fig/parse/worker.js",
      },
    ],
  },
  plugins: [
    vue(),
    openPencilAssetsPlugin(),
  ],
  server: {
    host: "127.0.0.1",
    port: 3410,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 3410,
    strictPort: true,
  },
});
