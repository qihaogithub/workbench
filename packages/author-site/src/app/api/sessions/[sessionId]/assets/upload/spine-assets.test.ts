import fs from "node:fs";
import path from "node:path";
import { prepareSpineAsset } from "./spine-assets";

const samplesDir = path.resolve(process.cwd(), "../..", "动效示例");

beforeAll(() => {
  // yauzl schedules its reads with Node's setImmediate; Jest's jsdom test
  // environment omits it even though the upload route always runs in Node.
  if (!("setImmediate" in globalThis)) {
    Object.assign(globalThis, { setImmediate: setTimeout });
  }
});

describe("prepareSpineAsset", () => {
  it.each([
    ["spine二进制示例.zip", "medal.skel.bytes", "medal.atlas.txt", "math_medal_1000_max.mp3"],
    ["star_second.zip.flutter", "star_second.skel.bytes", "star_second.atlas.txt", "audio_event_star_second_play.mp3"],
  ])("accepts the Spine 4.2 binary package %s, including auxiliary audio", async (filename, skeletonName, atlasName, audioName) => {
    const asset = await prepareSpineAsset(
      fs.readFileSync(path.join(samplesDir, filename)),
      filename,
    );

    expect(asset.manifest.spineVersion).toBe("4.2");
    expect(asset.manifest.skeleton).toContain(skeletonName);
    expect(asset.manifest.atlas).toContain(atlasName);
    expect(asset.manifest.textures).toHaveLength(1);
    expect(asset.manifest.files.some((file) => file.path.includes(audioName))).toBe(true);
    expect(asset.manifest.audio.some((file) => file.path.includes(audioName))).toBe(true);
    expect(asset.manifest.audio.some((file) => file.keys.includes(audioName.replace(/\.(mp3|ogg|wav|m4a)$/i, "")))).toBe(true);
    expect(asset.files.some((file) => file.path.includes(audioName))).toBe(true);
  });
});
