import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { prepareSpineAsset } from "./spine-assets";

const repoRoot = path.resolve(process.cwd(), "../..");
const samplesDir = path.join(repoRoot, "动效示例");

beforeAll(() => {
  // yauzl schedules its reads with Node's setImmediate; Jest's jsdom test
  // environment omits it even though the upload route always runs in Node.
  if (!("setImmediate" in globalThis)) {
    Object.assign(globalThis, { setImmediate: setTimeout });
  }
});

describe("prepareSpineAsset", () => {
  it.each([
    [
      "spine二进制示例.zip",
      "medal.skel.bytes",
      "medal.atlas.txt",
      "math_medal_1000_max.mp3",
      ["in", "loop"],
    ],
    [
      "star_second.zip.flutter",
      "star_second.skel.bytes",
      "star_second.atlas.txt",
      "audio_event_star_second_play.mp3",
      ["play", "play2"],
    ],
  ])(
    "accepts and parses the Spine 4.2 binary package %s, including auxiliary audio",
    async (filename, skeletonName, atlasName, audioName, animationNames) => {
      const asset = await prepareSpineAsset(
        fs.readFileSync(path.join(samplesDir, filename)),
        filename,
      );

      expect(asset.manifest.spineVersion).toBe("4.2");
      expect(asset.manifest.skeleton).toContain(skeletonName);
      expect(asset.manifest.atlas).toContain(atlasName);
      expect(asset.manifest.textures).toHaveLength(1);
      expect(
        asset.manifest.files.some((file) => file.path.includes(audioName)),
      ).toBe(true);
      expect(
        asset.manifest.audio.some((file) => file.path.includes(audioName)),
      ).toBe(true);
      expect(
        asset.manifest.audio.some((file) =>
          file.keys.includes(audioName.replace(/\.(mp3|ogg|wav|m4a)$/i, "")),
        ),
      ).toBe(true);
      expect(asset.files.some((file) => file.path.includes(audioName))).toBe(
        true,
      );

      const skeletonFile = asset.files.find(
        (file) => file.path === asset.manifest.skeleton,
      );
      const atlasFile = asset.files.find(
        (file) => file.path === asset.manifest.atlas,
      );
      expect(skeletonFile).toBeDefined();
      expect(atlasFile).toBeDefined();

      const runtimeCheck = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `
          import * as Spine42 from "@esotericsoftware/spine-webgl-42";
          const chunks = [];
          for await (const chunk of process.stdin) chunks.push(chunk);
          const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const textureAtlas = new Spine42.TextureAtlas(input.atlas);
          for (const page of textureAtlas.pages) {
            page.setTexture(new Spine42.FakeTexture({ width: page.width, height: page.height }));
          }
          const skeletonData = new Spine42.SkeletonBinary(
            new Spine42.AtlasAttachmentLoader(textureAtlas),
          ).readSkeletonData(Buffer.from(input.skeleton, "base64"));
          const skeleton = new Spine42.Skeleton(skeletonData);
          skeleton.updateWorldTransform(Spine42.Physics.update);
          process.stdout.write(JSON.stringify({
            version: skeletonData.version,
            animations: skeletonData.animations.map((animation) => animation.name),
          }));
        `,
        ],
        {
          cwd: repoRoot,
          encoding: "utf8",
          input: JSON.stringify({
            skeleton: skeletonFile!.content.toString("base64"),
            atlas: atlasFile!.content.toString("utf8"),
          }),
        },
      );

      expect(runtimeCheck.stderr).toBe("");
      expect(runtimeCheck.status).toBe(0);
      expect(JSON.parse(runtimeCheck.stdout)).toEqual({
        version: "4.2.32",
        animations: animationNames,
      });
    },
  );
});
