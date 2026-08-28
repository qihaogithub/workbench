import fs from "fs";
import os from "os";
import path from "path";
import { processVideosForPublish } from "../video-processor";

describe("processVideosForPublish", () => {
  it("copies session workspace videos into the published asset directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-videos-"));
    const workspacePath = path.join(root, "workspace");
    const publishDir = path.join(root, "published", "proj_1");
    const relativePath = "assets/videos/video_1/hero.mp4";
    fs.mkdirSync(path.join(workspacePath, path.dirname(relativePath)), { recursive: true });
    fs.mkdirSync(publishDir, { recursive: true });
    fs.writeFileSync(path.join(workspacePath, relativePath), "video-bytes");
    const url = "/api/sessions/session_1/workspace/assets/videos/video_1/hero.mp4";
    fs.writeFileSync(path.join(workspacePath, "project.config.values.json"), JSON.stringify({ heroVideo: { url } }));

    const result = processVideosForPublish({ projectId: "proj_1", workspacePath, publishDir });

    expect(result.errors).toEqual([]);
    expect(result.urlMap.get(url)).toMatch(/^\/data\/proj_1\/assets\/videos\/.+\.mp4$/);
    expect(fs.readdirSync(path.join(publishDir, "assets", "videos"))).toHaveLength(1);
  });
});
