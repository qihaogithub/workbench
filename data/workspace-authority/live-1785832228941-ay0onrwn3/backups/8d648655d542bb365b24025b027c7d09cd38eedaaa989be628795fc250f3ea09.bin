import { LottiePlayer, RivePlayer, SpinePlayer, SvgaPlayer } from "@preview/sdk";

interface DemoProps {
  "Lottie 动效"?: Record<string, unknown>;
  "SVGA 动效"?: Record<string, unknown>;
  "Spine 动效"?: Record<string, unknown>;
  "Rive 动效"?: Record<string, unknown>;
}

const PAGE_TITLE = "动效格式展示";
const SUBTITLE = "Lottie · SVGA · Spine · Rive";
const BG_COLOR = "#0f172a";
const ACCENT_COLOR = "#6366f1";

export default function MotionFormats(props: DemoProps) {
  const lottie = props["Lottie 动效"] || {};
  const svga = props["SVGA 动效"] || {};
  const spine = props["Spine 动效"] || {};
  const rive = props["Rive 动效"] || {};

  const lottieSrc = (lottie.src as string) || "";
  const lottieLoop = lottie.loop !== false;
  const lottieAutoplay = lottie.autoplay !== false;
  const svgaSrc = (svga.src as string) || "";
  const spineSkeleton = (spine.skeleton as string) || "";
  const spineAtlas = (spine.atlas as string) || "";
  const spineTexture = (spine.texture as string) || "";
  const spineLoop = spine.loop !== false;
  const riveSrc = (rive.src as string) || "";
  const riveFit = (rive.fit as string) || "cover";
  const riveAutoplay = rive.autoplay !== false;

  const Card = ({
    icon,
    title,
    tag,
    children,
  }: {
    icon: string;
    title: string;
    tag: string;
    children: React.ReactNode;
  }) => (
    <div className="bg-slate-800/70 rounded-2xl border border-slate-700/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/60">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-semibold text-slate-100">{title}</span>
        <span
          className="ml-auto text-[10px] px-2 py-0.5 rounded-full text-white font-mono"
          style={{ backgroundColor: ACCENT_COLOR }}
        >
          {tag}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  const Placeholder = ({ text }: { text: string }) => (
    <div className="flex flex-col items-center justify-center h-40 rounded-xl border-2 border-dashed border-slate-600 text-slate-500">
      <span className="text-3xl mb-2">✨</span>
      <span className="text-xs text-center px-4">{text}</span>
    </div>
  );

  return (
    <div className="min-h-screen px-3 py-5 space-y-4" style={{ backgroundColor: BG_COLOR }}>
      {/* 头部 */}
      <div className="pt-3 pb-1">
        <h1 className="text-xl font-bold text-white">{PAGE_TITLE}</h1>
        <p className="text-sm text-slate-400 mt-1">{SUBTITLE}</p>
      </div>

      {/* Lottie 动效 */}
      <Card icon="🎞️" title="Lottie 动效" tag="Lottie .json">
        {lottieSrc ? (
          <div className="flex items-center justify-center h-40 rounded-xl bg-slate-900/60 overflow-hidden">
            <LottiePlayer
              src={lottieSrc}
              loop={lottieLoop}
              autoplay={lottieAutoplay}
              renderer="svg"
              className="w-full h-full"
              fallback={<div className="text-xs text-slate-400">Lottie 加载中...</div>}
            />
          </div>
        ) : (
          <Placeholder text="在右侧面板「Lottie 动效」上传 .json 动画素材" />
        )}
      </Card>

      {/* SVGA 动效 */}
      <Card icon="🎬" title="SVGA 动效" tag="SVGA .svga">
        {svgaSrc ? (
          <div className="flex items-center justify-center h-40 rounded-xl bg-slate-900/60 overflow-hidden">
            <SvgaPlayer
              src={svgaSrc}
              style={{ display: "block", width: "100%", height: "100%" }}
            />
          </div>
        ) : (
          <Placeholder text="在右侧面板「SVGA 动效」上传 .svga 动画素材" />
        )}
      </Card>

      {/* Spine 动效 */}
      <Card icon="🦴" title="Spine 动效" tag="Spine .skel/.json">
        {spineSkeleton && spineAtlas && spineTexture ? (
          <div className="flex items-center justify-center h-40 rounded-xl bg-slate-900/60 overflow-hidden">
            <SpinePlayer
              skeleton={spineSkeleton}
              atlas={spineAtlas}
              texture={spineTexture}
              loop={spineLoop}
              fallback={<div className="text-xs text-slate-400">Spine 加载中...</div>}
            />
          </div>
        ) : (
          <Placeholder text="在右侧面板「Spine 动效」上传骨架、图集与纹理三个文件" />
        )}
      </Card>

      {/* Rive 动效 */}
      <Card icon="🌊" title="Rive 动效" tag="Rive .riv">
        {riveSrc ? (
          <div className="flex items-center justify-center h-40 rounded-xl bg-slate-900/60 overflow-hidden">
            <RivePlayer
              src={riveSrc}
              fit={riveFit}
              alignment="center"
              autoplay={riveAutoplay}
              className="w-full h-full"
              fallback={<div className="text-xs text-slate-400">Rive 加载中...</div>}
            />
          </div>
        ) : (
          <Placeholder text="在右侧面板「Rive 动效」上传 .riv 动画素材" />
        )}
      </Card>

      {/* 底部说明 */}
      <div
        className="rounded-xl px-4 py-3 text-xs text-slate-300"
        style={{ backgroundColor: `${ACCENT_COLOR}1a`, border: `1px solid ${ACCENT_COLOR}33` }}
      >
        <p className="font-semibold mb-1" style={{ color: ACCENT_COLOR }}>
          动效性能提示
        </p>
        <p>
          四种动效格式均通过系统播放器渲染：Lottie / SVGA / Spine / Rive 使用对应播放组件。素材在右侧配置面板中上传后即可实时替换预览。
        </p>
      </div>
    </div>
  );
}