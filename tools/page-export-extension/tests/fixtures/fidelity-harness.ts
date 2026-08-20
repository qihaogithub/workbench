import type { VirtualFile } from "@workbench/editable-snapshot-core";
import { compareRgba, renderFidelity } from "../../src/offscreen/fidelity.js";

const encode = (value: string) => new TextEncoder().encode(value);

async function main(): Promise<void> {
  const html = "<!doctype html><html><head><style>body{margin:0;background:#eef2ff;font:24px sans-serif}.card{margin:32px;padding:24px;background:white;border-radius:12px}</style></head><body><div class=\"card\">Editable fidelity</div></body></html>";
  const workspace = html.replace("Editable fidelity", "Editable fidelity");
  const files: VirtualFile[] = [
    { path: "faithful/snapshot.html", content: encode(html), mediaType: "text/html" },
    { path: "workspace/index.html", content: encode(workspace), mediaType: "text/html" },
  ];
  try {
    const rendered = await renderFidelity(files, { width: 480, height: 240, deviceScaleFactor: 1 });
    const output = document.querySelector<HTMLElement>("#result")!;
    output.dataset.status = "passed";
    output.textContent = JSON.stringify({
      faithfulPngBytes: rendered.faithful.length,
      workspacePngBytes: rendered.workspace.length,
      warnings: rendered.warnings,
      comparisonApiSmoke: compareRgba(new Uint8Array(4), new Uint8Array(4), 1, 1),
    });
  } catch (error) {
    const output = document.querySelector<HTMLElement>("#result")!;
    output.dataset.status = "failed";
    output.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
  }
}

void main();
