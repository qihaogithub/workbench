import { useEffect, useRef, useState } from "react";
import { SvgaPlayer, SpinePlayer } from "@preview/sdk";

interface LevelCard {
  type?: string;
  lockedImage?: string;
  unlockedImage?: string;
  completedImage?: string;
  animation?: string;
  position?: { x: number; y: number };
  w?: number;
  h?: number;
}

/* 集卡抽奖模块：卡片项（已获得图 / 未获得图 / 放大后图） */
interface CollectCardItem {
  type?: string;
  obtainedImage?: string;
  unobtainedImage?: string;
  enlargedImage?: string;
}

interface Module {
  type:
    | "image"
    | "button"
    | "participant"
    | "video"
    | "level"
    | "collectCard"
    | "myWorks"
    | "excellentWorks"
    | "ranking";
  image?: string;
  bgImage?: string;
  count?: number;
  videoBg?: string;
  video?: { url: string; poster?: string };
  guide?: { kind: "spine"; version: 1; assetId: string };
  levels?: LevelCard[];
  cards?: CollectCardItem[];
  headerImage?: string;
  bgColor?: string;
  innerBgColor?: string;
  showAd?: boolean;
  adImage?: string;
}

interface DemoProps {
  bgm: string;
  navColor: string;
  modules: Module[];
}

/* 参与人数胶囊图（头像 + 已参与人数），原图 330x60（2 倍），展示 165x30 */
const PARTICIPANT_BADGE = "/api/images/img_48Pwi7MHkO2FsQ";

/* 参与人数模块：背景图可配置，人数胶囊整体使用图片展示 */
function ParticipantModule({ bgImage, count }: { bgImage?: string; count?: number }) {
  return (
    <div
      style={{
        alignSelf: "stretch",
        height: 45,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {bgImage ? (
        <img
          src={bgImage}
          alt="参与人数组件背景图"
          style={{ position: "absolute", left: 0, top: 0, width: 375, height: 45, objectFit: "cover" }}
        />
      ) : (
        <div style={{ position: "absolute", left: 0, top: 0, width: 375, height: 45, background: "#F0F0F0" }} />
      )}
      <img
        src={PARTICIPANT_BADGE}
        alt={`${count ?? 2908} 人已参与`}
        style={{
          position: "absolute",
          left: 105,
          top: 7.5,
          width: 165,
          height: 30,
          objectFit: "contain",
          display: "block",
        }}
      />
    </div>
  );
}

/* 视频模块：视频背景图 + 封面(poster) + 文件(url) */
function VideoModule({ videoBg, video }: { videoBg?: string; video?: { url: string; poster?: string } }) {
  const hasSrc = !!video?.url;
  return (
    <div
      style={{
        alignSelf: "stretch",
        height: 211,
        flexShrink: 0,
        position: "relative",
        background: "#DBDBDB",
        overflow: "hidden",
      }}
    >
      {/* 背景图铺底，视频框（真实视频 / 默认占位）始终叠加在上层，两者不再互斥 */}
      {videoBg ? (
        <img
          src={videoBg}
          alt="视频背景图"
          style={{ position: "absolute", left: 0, top: 0, width: 375, height: 211, objectFit: "cover" }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 21,
          top: 11,
          width: 335,
          height: 188,
          background: "#F4F4F4",
          borderRadius: 10,
          border: "2px solid white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {hasSrc ? (
          <video
            src={video?.url}
            poster={video?.poster}
            controls
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
          />
        ) : (
          <>
            {video?.poster && (
              <img
                src={video.poster}
                alt="视频封面"
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
              />
            )}
            <img
              src="https://img.onlywnn.cn/figma/h_f9f81d7b.png"
              alt="播放按钮"
              style={{ position: "absolute", left: 132, top: 59, width: 70, height: 70, objectFit: "cover" }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* 图片模块：任意数量、任意位置 */
function ImageModule({ image }: { image?: string }) {
  return (
    <img
      src={image}
      alt="图片组件"
      style={{ width: 375, height: "auto", display: "block", objectFit: "cover" }}
    />
  );
}

/* 集卡抽奖模块：默认素材（配置值为空时兜底，避免灰色占位） */
const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const FALLBACK_CARDS: string[] = [
  svgDataUri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 98 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#FFE082'/><stop offset='1' stop-color='#FFB300'/></linearGradient></defs><rect width='98' height='100' rx='10' fill='url(#g)'/><rect x='4' y='4' width='90' height='92' rx='8' fill='none' stroke='rgba(255,255,255,0.7)' stroke-width='2'/><path d='M49 24l6.8 14.2 15.7 2.1-11.6 11 2.9 15.7L49 61.9l-13.8 7.1 2.9-15.7-11.6-11 15.7-2.1z' fill='#FF7043'/><text x='49' y='90' text-anchor='middle' font-family='PingFang SC,sans-serif' font-size='10' font-weight='700' fill='#8D5500'>卡片1</text></svg>`),
  svgDataUri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 98 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#B3E5FC'/><stop offset='1' stop-color='#29B6F6'/></linearGradient></defs><rect width='98' height='100' rx='10' fill='url(#g)'/><rect x='4' y='4' width='90' height='92' rx='8' fill='none' stroke='rgba(255,255,255,0.7)' stroke-width='2'/><circle cx='49' cy='44' r='14' fill='none' stroke='#0277BD' stroke-width='3'/><circle cx='49' cy='44' r='6' fill='#0277BD'/><path d='M35 66c4.7-4.7 23.3-4.7 28 0' fill='none' stroke='#0277BD' stroke-width='3' stroke-linecap='round'/><text x='49' y='90' text-anchor='middle' font-family='PingFang SC,sans-serif' font-size='10' font-weight='700' fill='#01579B'>卡片2</text></svg>`),
  svgDataUri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 98 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#C8E6C9'/><stop offset='1' stop-color='#66BB6A'/></linearGradient></defs><rect width='98' height='100' rx='10' fill='url(#g)'/><rect x='4' y='4' width='90' height='92' rx='8' fill='none' stroke='rgba(255,255,255,0.7)' stroke-width='2'/><path d='M49 22c12 8.5 17.5 16 17.5 24A17.5 17.5 0 0 1 49 65a17.5 17.5 0 0 1-17.5-19c0-8 5.5-15.5 17.5-24z' fill='#1B5E20'/><text x='49' y='90' text-anchor='middle' font-family='PingFang SC,sans-serif' font-size='10' font-weight='700' fill='#1B5E20'>卡片3</text></svg>`),
  svgDataUri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 98 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#F8BBD0'/><stop offset='1' stop-color='#EC407A'/></linearGradient></defs><rect width='98' height='100' rx='10' fill='url(#g)'/><rect x='4' y='4' width='90' height='92' rx='8' fill='none' stroke='rgba(255,255,255,0.7)' stroke-width='2'/><path d='M49 66l-14.5-13.6a8.8 8.8 0 0 1 12.4-12.6L49 43.9l2.1-4.1a8.8 8.8 0 0 1 12.4 12.6z' fill='#880E4F'/><text x='49' y='90' text-anchor='middle' font-family='PingFang SC,sans-serif' font-size='10' font-weight='700' fill='#880E4F'>卡片4</text></svg>`),
];

const FALLBACK_LARGE = svgDataUri(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 335 342'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#FFF3C4'/><stop offset='1' stop-color='#FFC94D'/></linearGradient></defs><rect width='335' height='342' rx='24' fill='url(#g)'/><rect x='10' y='10' width='315' height='322' rx='18' fill='none' stroke='rgba(255,255,255,0.8)' stroke-width='4'/><circle cx='167.5' cy='120' r='62' fill='none' stroke='#FF9800' stroke-width='5' stroke-dasharray='10 8'/><path d='M167.5 78l13 27.5 30.4 4.2-22.3 21.7 5.4 30.3-26.5-14.1-26.5 14.1 5.4-30.3-22.3-21.7 30.4-4.2z' fill='#FF7043'/><text x='167.5' y='240' text-anchor='middle' font-family='PingFang SC,sans-serif' font-size='34' font-weight='700' fill='#8D5500'>查看卡片大图</text><text x='167.5' y='278' text-anchor='middle' font-family='PingFang SC,sans-serif' font-size='18' fill='#A06800'>放大预览默认素材</text></svg>`);

const DEFAULT_CARDS: CollectCardItem[] = [
  { type: "card", obtainedImage: "", unobtainedImage: "", enlargedImage: "" },
  { type: "card", obtainedImage: "", unobtainedImage: "", enlargedImage: "" },
  { type: "card", obtainedImage: "", unobtainedImage: "", enlargedImage: "" },
  { type: "card", obtainedImage: "", unobtainedImage: "", enlargedImage: "" },
];

/* 集卡抽奖模块尺寸标注（1 倍像素，来自设计稿） */
const COLLECT_SIDE = 20; // 内容区左右间距
const COLLECT_PROGRESS_BLOCK_H = 51; // 进度条区域高度（含上方去抽奖按钮区）
const COLLECT_INNER_GAP = 16; // 进度条与卡片行间距
const COLLECT_CARD_H = 100; // 卡片高度固定 100，宽度按卡片数量均分自适应
const COLLECT_CARD_GAP = 8; // 卡片间距
const COLLECT_BOTTOM = 20; // 卡片行与背景底部间距
const COLLECT_MIN_H = 187; // 背景最小高度（最大高度不限）

/* 集卡抽奖模块：背景图 / 卡片列表可配置；卡片数量与进度目标由 cards.length 计算，首张默认已获得 */
function CollectLotteryModule({ bgImage, cards }: { bgImage?: string; cards?: CollectCardItem[] }) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  /* 背景图按 375 宽等比缩放后的自然高度，用于模块高度自适应（最小 187，最大不限） */
  const [bgHeight, setBgHeight] = useState(0);
  const bgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    setBgHeight(0);
    const img = bgRef.current;
    if (!img) return;
    const measure = () => {
      if (img.naturalWidth > 0) setBgHeight(Math.round((img.naturalHeight / img.naturalWidth) * 375));
    };
    if (img.complete) measure();
    else {
      img.addEventListener("load", measure);
      return () => img.removeEventListener("load", measure);
    }
  }, [bgImage]);
  const cardList = cards && cards.length > 0 ? cards : DEFAULT_CARDS;
  const cardTotal = cardList.length;
  /* 默认状态：第 1 张已获得，其余未获得 */
  const obtainedIndex = 0;
  const gotCount = Math.min(obtainedIndex + 1, cardTotal);
  const percent = cardTotal > 0 ? (gotCount / cardTotal) * 100 : 0;
  const previewCard = previewIndex !== null ? cardList[previewIndex] : null;
  const previewObtained = previewIndex !== null && previewIndex <= obtainedIndex;
  /* 放大图缺失时回退使用当前卡片图；再缺失时使用默认素材 */
  const previewSrc =
    (previewCard && previewCard.enlargedImage) ||
    (previewCard && (previewObtained ? previewCard.obtainedImage : previewCard.unobtainedImage)) ||
    (previewObtained ? FALLBACK_CARDS[0] : FALLBACK_CARDS[1]) ||
    FALLBACK_LARGE;
  /* 内容自上而下：进度条区域 51 → 间距 16 → 卡片 100 → 底部间距 20（合计最小 187） */
  const progressTop = 0;
  const cardsTop = COLLECT_PROGRESS_BLOCK_H + COLLECT_INNER_GAP;
  const contentHeight = cardsTop + COLLECT_CARD_H + COLLECT_BOTTOM;
  /* 模块高度不固定：由背景图等比缩放后的高度决定，最小 187、最大不限 */
  const moduleHeight = Math.max(COLLECT_MIN_H, contentHeight, bgHeight);
  /* 卡片宽度不固定：在内容区（左右各 20）内按卡片数量均分，高度固定 100 */
  const cardWidth = `calc((100% - ${COLLECT_CARD_GAP * (cardList.length - 1)}px) / ${cardList.length})`;
  return (
    <div
      style={{
        alignSelf: "stretch",
        flexShrink: 0,
        position: "relative",
        height: moduleHeight,
        background: "#DBDBDB",
        overflow: "hidden",
      }}
    >
      {bgImage ? (
        <img
          ref={bgRef}
          src={bgImage}
          alt="集卡抽奖背景图"
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0) setBgHeight(Math.round((el.naturalHeight / el.naturalWidth) * 375));
          }}
          style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      {/* 卡片行：高度固定 100，宽度按卡片数量在内容区内均分 */}
      <div
        style={{
          position: "absolute",
          left: COLLECT_SIDE,
          top: cardsTop,
          width: `calc(100% - ${COLLECT_SIDE * 2}px)`,
          height: COLLECT_CARD_H,
          display: "flex",
          alignItems: "stretch",
          gap: COLLECT_CARD_GAP,
        }}
      >
        {cardList.map((card, i) => {
          const obtained = i <= obtainedIndex;
          const cardImg = obtained
            ? card.obtainedImage || FALLBACK_CARDS[i % 4]
            : card.unobtainedImage || FALLBACK_CARDS[(i + 1) % 4];
          const label = obtained ? "已获得卡片" : "未获得卡片";
          return (
            <button
              key={i}
              type="button"
              onClick={() => setPreviewIndex(i)}
              style={{
                width: cardWidth,
                height: COLLECT_CARD_H,
                position: "relative",
                background: obtained ? "#F4F4F4" : "#C5C5C5",
                outline: `1px solid ${obtained ? "white" : "#B3B3B3"}`,
                outlineOffset: -1,
                overflow: "hidden",
                border: "none",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <img src={cardImg} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          );
        })}
      </div>
      {/* 进度条：位于 51 高的进度条区域内垂直居中，左右各留 20，宽度随模块自适应 */}
      <div
        style={{
          position: "absolute",
          left: COLLECT_SIDE,
          top: progressTop,
          width: `calc(100% - ${COLLECT_SIDE * 2}px)`,
          height: COLLECT_PROGRESS_BLOCK_H,
          display: "flex",
          alignItems: "center",
        }}
      >
      <div
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "2px 10px",
          background: "white",
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#666666" }}>已收集</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#FF9045" }}>{gotCount}</span>
        </div>
        <div style={{ flex: 1, height: 14, position: "relative" }}>
          <div
            style={{
              height: 11,
              width: "100%",
              position: "absolute",
              top: 1,
              background: "rgba(9,9,9,0.14)",
              borderRadius: 30,
            }}
          />
          <div
            style={{
              height: 11,
              width: `${percent}%`,
              position: "absolute",
              top: 0.5,
              background: "#FCDA00",
              borderRadius: 30,
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#B2B2B2" }}>{cardTotal}</span>
        </div>
      </div>
      </div>

      {/* 卡片放大预览：点击卡片弹出，点击关闭按钮或遮罩收起 */}
      {previewIndex !== null && (
        <div
          onClick={() => setPreviewIndex(null)}
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: 375,
            height: 812,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            zIndex: 999,
          }}
        >
          <img
            src={previewSrc}
            alt="卡片放大预览"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 335,
              height: 342,
              objectFit: "contain",
              borderRadius: 24,
              outline: "3px solid white",
              outlineOffset: -3,
            }}
          />
          <button
            type="button"
            aria-label="关闭"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewIndex(null);
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: "rgba(255,255,255,0.92)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path d="M2 2 L14 14 M14 2 L2 14" stroke="#333" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/* 关卡图取图：已完成图 → 已解锁图 → 未解锁图，取第一个有值的图片 */
function resolveLevelImage(card: LevelCard): string | undefined {
  return card.completedImage || card.unlockedImage || card.lockedImage;
}

/* 关卡组件（可配置：背景图 + 关卡图(自定义图片/自由坐标/自定义尺寸) + 引导形象） */
function LevelModule({
  bgImage,
  guide,
  levels,
}: {
  bgImage?: string;
  guide?: { kind: "spine"; version: 1; assetId: string };
  levels?: LevelCard[];
}) {
  const cards = levels && levels.length > 0 ? levels : [];
  return (
    <div
      style={{
        alignSelf: "stretch",
        flexShrink: 0,
        position: "relative",
        background: "#DBDBDB",
        overflow: "hidden",
      }}
    >
      {/* 关卡背景图：以图片自然高度撑起组件高度（W=375） */}
      {bgImage ? (
        <img
          src={bgImage}
          alt="关卡背景图"
          style={{ display: "block", width: 375, objectFit: "cover" }}
        />
      ) : (
        <div style={{ width: 375, height: 656, background: "#DBDBDB" }} />
      )}

      {/* 关卡图：position 使用 1 倍像素，w/h 使用 2 倍值 */}
      {cards.map((card, i) => {
        const x = card.position?.x ?? 0;
        const y = card.position?.y ?? 0;
        const w = (card.w ?? 0) / 2;
        const h = (card.h ?? 0) / 2;
        const img = resolveLevelImage(card);
        const style = {
          position: "absolute" as const,
          left: x,
          top: y,
          width: w,
          height: h,
          objectFit: "cover" as const,
        };
        if (card.animation) {
          return (
            <div
              key={i}
              data-pos-key="levelCard"
              style={{ position: "absolute", left: x, top: y, width: w, height: h }}
            >
              <SvgaPlayer
                src={card.animation}
                loop
                autoplay
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                fallback={img ? <img src={img} alt={`关卡${i + 1}动画兜底`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
              />
            </div>
          );
        }
        if (!img) return null;
        return <img key={i} src={img} data-pos-key="levelCard" alt={`关卡${i + 1}`} style={style} />;
      })}

      {/* 闯关引导形象（Spine） */}
      {guide ? (
        <SpinePlayer
          src={guide}
          loop
          fit="contain"
          alignment="bottom"
          style={{ position: "absolute", left: 8, bottom: 20, width: 80, height: 130 }}
          fallback={null}
        />
      ) : null}
    </div>
  );
}

/* 按钮模块（图片可配置，整宽展示，高度 97px） */
function ButtonModule({ image }: { image?: string }) {
  const src = image || "https://img.onlywnn.cn/figma/h_4dce23b9.png";
  return (
    <img
      src={src}
      alt="按钮组件"
      style={{ width: 375, height: 97, objectFit: "cover", display: "block", flexShrink: 0 }}
    />
  );
}

/* 我的作品（内容模块）：模块背景头图 / 背景色 / 模块内背景色可配置 */
function MyWorks({
  headerImage,
  bgColor,
  innerBgColor,
}: {
  headerImage?: string;
  bgColor?: string;
  innerBgColor?: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        padding: "10px 16px",
        background: bgColor || "#FFEAA3",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 343,
          height: 226,
          position: "relative",
          overflow: "hidden",
          borderRadius: 25,
          background: innerBgColor || "#FFBA39",
        }}
      >
        {headerImage ? (
          <img
            src={headerImage}
            alt="我的作品模块背景头图"
            style={{ position: "absolute", left: 0, top: 0, width: 343, height: 226, objectFit: "cover" }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            left: 16,
            top: 70,
            width: 311,
            background: "white",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div style={{ padding: "8px 0 8px 8px", display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src="https://img.onlywnn.cn/figma/h_c4d5a09e.png"
              alt="作品封面"
              style={{ width: 124, height: 124, borderRadius: 12 }}
            />
          </div>
          <div
            style={{
              flex: 1,
              padding: "12px 16px 12px 0",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-end", gap: 34 }}>
              <span style={{ fontSize: 20, fontWeight: 500, color: "#404040" }}>魏豆豆</span>
            </div>
            <div
              style={{
                padding: "2px 8px",
                background: "white",
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 16, color: "#FF715C" }}>❤</span>
              <span style={{ fontSize: 18, fontWeight: 500, color: "#FF715C" }}>12</span>
            </div>
            <img
              src="https://img.onlywnn.cn/figma/h_20b80f7e.png"
              alt="按钮"
              style={{ width: 147, height: 36, objectFit: "cover" }}
            />
          </div>
          <div
            style={{
              position: "absolute",
              left: 8,
              top: 8,
              padding: "0 6px",
              background: "#FF715C",
              borderTopLeftRadius: 12,
              borderBottomRightRadius: 8,
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 12, color: "white" }}>排名</span>
            <span style={{ fontSize: 12, color: "white" }}>12</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 优秀作品（内容模块）：模块背景头图 / 背景色 / 模块内背景色 / 广告图开关 + 广告图可配置 */
const EXCELLENT_HEADER_FALLBACK = "/api/images/img_krgLOxEh4x3XbQ";

/* 优秀作品模块尺寸标注（1 倍像素）：头图 290 / 内容区起点 70 / 作品行 168 / 广告图 166 / 间距 12 / 底部内边距 16 */
const EXCELLENT_HEADER_H = 290;
const EXCELLENT_CONTENT_TOP = 70;
const EXCELLENT_WORKS_H = 168;
const EXCELLENT_AD_H = 166;
const EXCELLENT_ROW_GAP = 12;
const EXCELLENT_BOTTOM_PAD = 16;

function ExcellentWorks({
  headerImage,
  bgColor,
  innerBgColor,
  showAd = true,
  adImage,
}: {
  headerImage?: string;
  bgColor?: string;
  innerBgColor?: string;
  showAd?: boolean;
  adImage?: string;
}) {
  const header = headerImage || EXCELLENT_HEADER_FALLBACK;
  /* 广告图开关：关闭（或开启但未配图）时隐藏广告位，容器高度按内容收敛到 16 底边距；
     头图 250–290 区域原本被广告图覆盖，隐藏后一并裁掉，不会露出多余空白 */
  const hasAd = showAd && !!adImage;
  const contentHeight = EXCELLENT_WORKS_H + (hasAd ? EXCELLENT_ROW_GAP + EXCELLENT_AD_H : 0);
  const containerHeight = EXCELLENT_CONTENT_TOP + contentHeight + EXCELLENT_BOTTOM_PAD;
  return (
    <div
      style={{
        width: "100%",
        padding: "10px 16px",
        background: bgColor || "#FFEAA3",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 343,
          height: containerHeight,
          position: "relative",
          background: innerBgColor || "#FFBA39",
          borderRadius: 25,
          overflow: "hidden",
        }}
      >
        {header ? (
          <img
            src={header}
            alt="优秀作品模块背景头图"
            style={{ position: "absolute", left: 0, top: 0, width: 343, height: EXCELLENT_HEADER_H, objectFit: "cover" }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: EXCELLENT_CONTENT_TOP,
            width: 343,
            padding: "0 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: EXCELLENT_ROW_GAP,
          }}
        >
          <div style={{ alignSelf: "stretch", display: "flex", alignItems: "flex-end", gap: 8 }}>
            {["h_d3d88535.png", "h_2637513b.png", "h_abfb8bd9.png"].map((f, i) => (
              <div
                key={i}
                style={{
                  position: "relative",
                  borderRadius: 12,
                  overflow: "hidden",
                  outline: "1px solid white",
                  outlineOffset: -1,
                  boxShadow: "0 0 8px rgba(0,0,0,0.12)",
                }}
              >
                <img src={`https://img.onlywnn.cn/figma/${f}`} alt="作品" style={{ width: 130, height: 130 }} />
                <div
                  style={{
                    width: 130,
                    padding: 6,
                    background: "linear-gradient(0deg, white 0%, white 100%), linear-gradient(180deg, rgba(76,76,76,0) 0%, rgba(77,77,77,0.5) 60%)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <img
                    src="https://img.onlywnn.cn/figma/h_781b9753.png"
                    alt="头像"
                    style={{ width: 26, height: 26, borderRadius: 9999 }}
                  />
                  <span style={{ fontSize: 14, color: "#404040" }}>骋骋。</span>
                </div>
              </div>
            ))}
          </div>
          {hasAd && (
            <img
              src={adImage}
              alt="优秀作品广告图"
              style={{ width: 311, height: EXCELLENT_AD_H, objectFit: "cover" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* 排行榜（内容模块）：模块背景头图 / 背景色 / 模块内背景色可配置，颜色默认透明 */
function Ranking({
  headerImage,
  bgColor,
  innerBgColor,
}: {
  headerImage?: string;
  bgColor?: string;
  innerBgColor?: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        padding: "10px 16px",
        background: bgColor || "transparent",
        overflow: "hidden",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      {/* 模块内背景色作用于该整体卡片容器（头图 + 榜单区域） */}
      <div
        style={{
          width: 343,
          height: 751,
          position: "relative",
          background: innerBgColor || "#FFC575",
          overflow: "hidden",
          borderRadius: 25,
        }}
      >
        {headerImage ? (
          <img
            src={headerImage}
            alt="排行榜模块背景头图"
            style={{ position: "absolute", left: 0, top: 0, width: 343, height: 290, objectFit: "cover" }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            left: 16,
            top: 250,
            width: 311,
            height: 400,
            background: "white",
            borderRadius: 16,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            paddingBottom: 40,
          }}
        >
          {/* 前三名 */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: -114,
              width: 311,
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <div style={{ width: 94, height: 132, position: "relative" }}>
              <img
                src="https://img.onlywnn.cn/figma/h_da563882.png"
                alt="第2名背景图"
                style={{ position: "absolute", left: 0, top: 0, width: 94, height: 132, objectFit: "cover" }}
              />
              <img
                src="https://img.onlywnn.cn/figma/h_7f44a115.png"
                alt="头像"
                style={{ position: "absolute", left: 12, top: 34, width: 70, height: 70, borderRadius: 8 }}
              />
            </div>
            <div style={{ width: 123, height: 167, position: "relative" }}>
              <img
                src="https://img.onlywnn.cn/figma/h_50b55e4f.png"
                alt="第1名背景图"
                style={{ position: "absolute", left: 0, top: 0, width: 123, height: 167, objectFit: "cover" }}
              />
              <img
                src="https://img.onlywnn.cn/figma/h_ba9a691.png"
                alt="头像"
                style={{ position: "absolute", left: 12, top: 40, width: 99, height: 99, borderRadius: 8 }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 139,
                  width: 123,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 16, color: "#404040" }}>吴*萱</span>
              </div>
            </div>
            <div style={{ width: 94, height: 132, position: "relative" }}>
              <img
                src="https://img.onlywnn.cn/figma/h_f2b2b21b.png"
                alt="第3名背景图"
                style={{ position: "absolute", left: 0, top: 0, width: 94, height: 132, objectFit: "cover" }}
              />
              <img
                src="https://img.onlywnn.cn/figma/h_14176f77.png"
                alt="头像"
                style={{ position: "absolute", left: 12, top: 34, width: 70, height: 70, borderRadius: 8 }}
              />
            </div>
          </div>
          {/* 4-8 名列表 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 160 }}>
            {[
              ["4", "李梓发", "997"],
              ["5", "李世海", "934"],
              ["6", "吴彦谦", "922"],
              ["7", "钱萌萌", "312"],
              ["8", "冯启彬", "12"],
            ].map(([rank, name, likes]) => (
              <div
                key={rank}
                style={{
                  width: 311,
                  height: 52,
                  position: "relative",
                  background: "white",
                  borderRadius: 16,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span style={{ position: "absolute", left: 16, width: 25, textAlign: "center", color: "#404040", fontSize: 14 }}>
                  {rank}
                </span>
                <img
                  src="https://img.onlywnn.cn/figma/h_e88a9e02.png"
                  alt="头像"
                  style={{ position: "absolute", left: 61, width: 52, height: 52, borderRadius: 8 }}
                />
                <span style={{ position: "absolute", left: 127, color: "#404040", fontSize: 14 }}>{name}</span>
                <div
                  style={{
                    position: "absolute",
                    left: 225,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ color: "#FF715C", fontSize: 14 }}>❤</span>
                  <span style={{ color: "#FF715C", fontSize: 14 }}>{likes}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_MODULES: Module[] = [
  { type: "image", image: "https://img.onlywnn.cn/figma/h_c61916f5.png" },
  { type: "participant", bgImage: "https://img.onlywnn.cn/figma/h_19dbcc85.png", count: 128 },
  { type: "video", videoBg: "", video: { url: "", poster: "" } },
  {
    type: "collectCard",
    bgImage: "",
    cards: DEFAULT_CARDS,
  },
  {
    type: "level",
    bgImage: "https://img.onlywnn.cn/figma/h_6e2a6768.png",
    levels: [
      {
        type: "levelCard",
        unlockedImage: "https://img.onlywnn.cn/figma/h_e589fc90.png",
        position: { x: 14, y: 1 },
        w: 330,
        h: 368,
      },
      {
        type: "levelCard",
        lockedImage: "https://img.onlywnn.cn/figma/h_70aef182.png",
        position: { x: 196, y: 147 },
        w: 330,
        h: 368,
      },
      {
        type: "levelCard",
        lockedImage: "https://img.onlywnn.cn/figma/h_61c26d1d.png",
        position: { x: 40, y: 316 },
        w: 342,
        h: 390,
      },
    ],
  },
  { type: "image", image: "https://img.onlywnn.cn/figma/h_483ae3df.png" },
  { type: "button", image: "https://img.onlywnn.cn/figma/h_4dce23b9.png" },
  {
    type: "myWorks",
    headerImage: "/api/images/img_S5_tiyYeuTb0Tw",
    bgColor: "#FFEAA3",
    innerBgColor: "#FFBA39",
  },
  {
    type: "excellentWorks",
    headerImage: EXCELLENT_HEADER_FALLBACK,
    bgColor: "#FFEAA3",
    innerBgColor: "#FFBA39",
    showAd: true,
    adImage: "https://img.onlywnn.cn/figma/h_86750433.png",
  },
  {
    type: "ranking",
    headerImage: "",
    bgColor: "",
    innerBgColor: "",
  },
  /* 领课广告：作为可选的图片模块，默认排在内容模块最后 */
  { type: "image", image: "https://img.onlywnn.cn/figma/h_e0d1c962.png" },
];

function renderModule(m: Module, key: number) {
  switch (m.type) {
    case "participant":
      return <ParticipantModule key={key} bgImage={m.bgImage} count={m.count} />;
    case "video":
      return <VideoModule key={key} videoBg={m.videoBg} video={m.video} />;
    case "image":
      return <ImageModule key={key} image={m.image} />;
    case "button":
      return <ButtonModule key={key} image={m.image} />;
    case "level":
      return (
        <LevelModule
          key={key}
          bgImage={m.bgImage}
          guide={m.guide}
          levels={m.levels}
        />
      );
    case "collectCard":
      return <CollectLotteryModule key={key} bgImage={m.bgImage} cards={m.cards} />;
    case "myWorks":
      return (
        <MyWorks
          key={key}
          headerImage={m.headerImage}
          bgColor={m.bgColor}
          innerBgColor={m.innerBgColor}
        />
      );
    case "excellentWorks":
      return (
        <ExcellentWorks
          key={key}
          headerImage={m.headerImage}
          bgColor={m.bgColor}
          innerBgColor={m.innerBgColor}
          showAd={m.showAd}
          adImage={m.adImage}
        />
      );
    case "ranking":
      return (
        <Ranking
          key={key}
          headerImage={m.headerImage}
          bgColor={m.bgColor}
          innerBgColor={m.innerBgColor}
        />
      );
    default:
      return null;
  }
}

export default function Demo({ navColor = "#C4C4C4", modules }: DemoProps) {
  const list = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  return (
    <div style={{ width: 375, minHeight: 812, position: "relative", background: "#FFEAA3", margin: "0 auto" }}>
      {/* 内容区 */}
      <div
        style={{
          position: "relative",
          top: 88,
          background: "#FFEAA3",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        {/* 内容模块流（含我的作品 / 优秀作品 / 排行榜 / 领课广告，顺序由配置面板拖拽排序决定） */}
        {list.map((m, i) => renderModule(m, i))}
      </div>

      {/* 原生导航/状态栏目 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 375,
          background: navColor,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <div style={{ width: 375, height: 44, position: "relative" }}>
          <img
            src="https://img.onlywnn.cn/figma/h_37173ecb.svg"
            alt="状态图标"
            style={{ position: "absolute", left: 293.67, top: 17.33, width: 67, height: 11 }}
          />
          <img
            src="https://img.onlywnn.cn/figma/h_ce0aae82.svg"
            alt="时间"
            style={{ position: "absolute", left: 20.6, top: 16.81, width: 24, height: 10 }}
          />
        </div>
        <div
          style={{
            width: 375,
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <img src="https://img.onlywnn.cn/figma/h_f6be9123.png" alt="功能左" style={{ width: 44, height: 44 }} />
          <img src="https://img.onlywnn.cn/figma/h_3372662a.png" alt="功能右" style={{ width: 44, height: 44 }} />
          <div
            style={{
              position: "absolute",
              left: 51,
              top: 9.5,
              width: 272,
              height: 25,
              textAlign: "center",
              color: "white",
              fontSize: 18,
              fontWeight: 500,
            }}
          />
        </div>
      </div>

      {/* 规则 / 音乐 */}
      <img
        src="https://img.onlywnn.cn/figma/h_111a6947.png"
        alt="规则"
        style={{ position: "absolute", left: 318, top: 143, width: 57, height: 25 }}
      />
      <img
        src="https://img.onlywnn.cn/figma/h_cb7f0ea2.png"
        alt="音乐"
        style={{ position: "absolute", left: 333, top: 105, width: 30, height: 30 }}
      />
    </div>
  );
}
