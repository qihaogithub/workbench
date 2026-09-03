import { SpinePlayer } from "@preview/sdk";

interface DemoProps {
  /** 弹窗 Spine 动画：上传单个 Spine ZIP 后由受管资产加载完整素材。 */
  spineAsset?: { kind: "spine"; version: 1; assetId: string };
  spineAnimation?: string;
  spineLoop?: boolean;
}

const FALLBACK_IMAGE = "/api/images/img_5dVk-_aTCmGiCQ";

export default function Demo({ spineAsset, spineAnimation = "", spineLoop = true }: DemoProps) {
  const hasSpine = Boolean(spineAsset);

  return (
    <div
      className="relative overflow-hidden"
      style={{ width: 375, height: 812, background: "white" }}
    >
      {/* 背景 */}
      <img
        src="/api/images/img_VVbU7MykDJjjxA"
        alt="背景"
        className="absolute"
        style={{ width: 375, height: 812, left: 0.5, top: 0.5 }}
      />
      {/* 遮罩 */}
      <div
        className="absolute"
        style={{
          width: 376,
          height: 812,
          left: 0,
          top: 0,
          opacity: 0.7,
          background: "black",
        }}
      />
      {/* 弹窗：Spine 骨骼动画（配置项注入） */}
      {hasSpine ? (
        <SpinePlayer
          src={spineAsset}
          animation={spineAnimation}
          loop={spineLoop}
          className="absolute"
          style={{ width: 375, height: 375, left: 0, top: 218 }}
          fallback={
            <img
              src={FALLBACK_IMAGE}
              alt="弹窗"
              style={{ width: 375, height: 375 }}
            />
          }
        />
      ) : (
        <img
          src={FALLBACK_IMAGE}
          alt="弹窗"
          className="absolute"
          style={{ width: 375, height: 375, left: 0, top: 218 }}
        />
      )}
    </div>
  );
}
