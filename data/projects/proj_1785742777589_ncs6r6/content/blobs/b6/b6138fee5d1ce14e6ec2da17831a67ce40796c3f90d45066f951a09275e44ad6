import { LottiePlayer, RivePlayer, SpinePlayer, SvgaPlayer } from "@preview/sdk";
import { motion } from "framer-motion";

interface DemoProps {
  lottieSrc?: string;
  lottieLoop?: boolean;
  lottieAutoplay?: boolean;
  svgaSrc?: string;
  spineAsset?: { kind: "spine"; version: 1; assetId: string };
  spineAnimation?: string;
  spineLoop?: boolean;
  spineAudioEnabled?: boolean;
  riveSrc?: string;
  riveFit?: string;
  riveAutoplay?: boolean;
}

const PAGE_TITLE = "动效格式展示";
const SUBTITLE = "Lottie · SVGA · Spine · Rive";
const BG_COLOR = "#0a0f1e";
const GRADIENT_START = "#6366f1";
const GRADIENT_END = "#8b5cf6";

// 将指向当前会话素材（/api/sessions/...）的带主机名 URL 规范为同源相对路径，
// 避免配置数据中残留的内部主机名在用户浏览器不可达导致素材加载失败。
const toLocalPath = (url?: string): string => {
  if (!url) return "";
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.pathname.startsWith("/api/sessions/")) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return url;
  } catch {
    return url;
  }
};

export default function MotionFormats(props: DemoProps) {
  const {
    lottieSrc = "",
    lottieLoop = true,
    lottieAutoplay = true,
    svgaSrc = "",
    spineAsset,
    spineAnimation = "",
    spineLoop = true,
    spineAudioEnabled = true,
    riveSrc = "",
    riveFit = "cover",
    riveAutoplay = true,
  } = props;

  const hasSpine = !!spineAsset;

  const Card = ({
    icon,
    title,
    tag,
    children,
    index,
  }: {
    icon: string;
    title: string;
    tag: string;
    children: React.ReactNode;
    index: number;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300"
    >
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-700/40 bg-gradient-to-r from-slate-800/60 to-transparent">
        <span className="text-xl">{icon}</span>
        <span className="text-sm font-semibold text-white tracking-wide">{title}</span>
        <span
          className="ml-auto text-[10px] px-2.5 py-0.5 rounded-full text-white font-mono font-medium shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${GRADIENT_START}, ${GRADIENT_END})`,
          }}
        >
          {tag}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </motion.div>
  );

  const Placeholder = ({ text, icon: placeholderIcon }: { text: string; icon: string }) => (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="flex flex-col items-center justify-center h-44 rounded-xl border-2 border-dashed border-slate-600/60 bg-slate-900/30 text-slate-400 group hover:border-slate-500/60 transition-colors duration-300"
    >
      <span className="text-4xl mb-3 opacity-60 group-hover:opacity-80 transition-opacity duration-300">{placeholderIcon}</span>
      <span className="text-xs text-center px-6 leading-relaxed">{text}</span>
    </motion.div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen px-3 py-6 space-y-5"
      style={{
        backgroundColor: BG_COLOR,
        backgroundImage: `radial-gradient(ellipse at 50% 0%, ${GRADIENT_START}15 0%, transparent 50%)`,
      }}
    >
      {/* 头部 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="pt-2 pb-2 px-4 rounded-2xl"
        style={{
          background: `linear-gradient(135deg, ${GRADIENT_START}20, ${GRADIENT_END}15)`,
          border: `1px solid ${GRADIENT_START}30`,
        }}
      >
        <h1 className="text-2xl font-bold text-white tracking-tight">{PAGE_TITLE}</h1>
        <p className="text-sm text-slate-300 mt-1.5 font-medium">{SUBTITLE}</p>
      </motion.div>

      {/* 动效卡片网格 */}
      <div className="grid grid-cols-1 gap-4">

      {/* Lottie 动效 */}
      <Card icon="🎞️" title="Lottie 动效" tag="Lottie .json" index={0}>
        {lottieSrc ? (
          <div className="flex items-center justify-center h-44 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-800/50 overflow-hidden shadow-inner">
            <LottiePlayer
              src={toLocalPath(lottieSrc)}
              loop={lottieLoop}
              autoplay={lottieAutoplay}
              renderer="svg"
              className="w-full h-full"
              fallback={<div className="text-xs text-slate-400">Lottie 加载中...</div>}
            />
          </div>
        ) : (
          <Placeholder icon="🎞️" text="在右侧面板「Lottie 动效」上传 .json 动画素材" />
        )}
      </Card>

      {/* SVGA 动效 */}
      <Card icon="🎬" title="SVGA 动效" tag="SVGA .svga" index={1}>
        {svgaSrc ? (
          <div className="flex items-center justify-center h-44 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-800/50 overflow-hidden shadow-inner">
            <SvgaPlayer
              src={toLocalPath(svgaSrc)}
              style={{ display: "block", width: "100%", height: "100%" }}
            />
          </div>
        ) : (
          <Placeholder icon="🎬" text="在右侧面板「SVGA 动效」上传 .svga 动画素材" />
        )}
      </Card>

      {/* Spine 动效 */}
      <Card icon="🦴" title="Spine 动效" tag="Spine .zip" index={2}>
        {hasSpine ? (
          <div className="flex items-center justify-center h-44 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-800/50 overflow-hidden shadow-inner">
            <SpinePlayer
              src={spineAsset}
              animation={spineAnimation}
              loop={spineLoop}
              audioEnabled={spineAudioEnabled}
              onError={() => {
                // 加载失败交由 SDK 内部回退到 fallback，避免错误冒泡到页面运行时
              }}
              fallback={
                <div className="text-xs text-slate-400 px-4 text-center">
                  Spine 素材加载中或不可用，请检查上传的 .zip 素材包
                </div>
              }
            />
          </div>
        ) : (
          <Placeholder icon="🦴" text="在右侧面板「Spine 动效」上传 .zip 打包素材（骨架+图集+纹理）" />
        )}
      </Card>

      {/* Rive 动效 */}
      <Card icon="🌊" title="Rive 动效" tag="Rive .riv" index={3}>
        {riveSrc ? (
          <div className="flex items-center justify-center h-44 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-800/50 overflow-hidden shadow-inner">
            <RivePlayer
              src={toLocalPath(riveSrc)}
              fit={riveFit}
              alignment="center"
              autoplay={riveAutoplay}
              className="w-full h-full"
              fallback={<div className="text-xs text-slate-400">Rive 加载中...</div>}
            />
          </div>
        ) : (
          <Placeholder icon="🌊" text="在右侧面板「Rive 动效」上传 .riv 动画素材" />
        )}
      </Card>

      </div>

      {/* 底部说明 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="rounded-xl px-4 py-3.5 text-xs text-slate-300 shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${GRADIENT_START}15, ${GRADIENT_END}10)`,
          border: `1px solid ${GRADIENT_START}25`,
        }}
      >
        <p className="font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: GRADIENT_START }}>
          <span>💡</span>
          <span>动效性能提示</span>
        </p>
        <p className="leading-relaxed text-slate-400">
          四种动效格式均通过系统播放器渲染：Lottie / SVGA / Spine / Rive 使用对应播放组件。素材在右侧配置面板中上传后即可实时替换预览。
        </p>
      </motion.div>
    </motion.div>
  );
}
