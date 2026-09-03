import { SvgaPlayer, SpinePlayer } from "@preview/sdk";

type LevelState = "未解锁" | "已解锁" | "已完成";

interface LevelCard {
  type?: string;
  state?: LevelState;
  lockedImage?: string;
  unlockedImage?: string;
  completedImage?: string;
  animation?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface Module {
  type: "image" | "participant" | "video" | "level";
  image?: string;
  bgImage?: string;
  count?: number;
  videoBg?: string;
  video?: { url: string; poster?: string };
  guide?: { kind: "spine"; version: 1; assetId: string };
  levels?: LevelCard[];
}

interface DemoProps {
  bgm: string;
  navColor: string;
  modules: Module[];
}

/* 参与人数模块：背景图可配置，UI 控件样式固定 */
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
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 7,
          width: 165,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#404040", fontFamily: "PingFang SC" }}>
          参与人数
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#FF9045", fontFamily: "PingFang SC" }}>
          {count ?? 0}
        </span>
      </div>
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
      {videoBg ? (
        <img
          src={videoBg}
          alt="视频背景图"
          style={{ position: "absolute", left: 0, top: 0, width: 375, height: 211, objectFit: "cover" }}
        />
      ) : (
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
      )}
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

/* 集卡抽奖（固定特色区块） */
function CollectLottery() {
  return (
    <div
      style={{
        flexShrink: 0,
        position: "relative",
        background: "#DBDBDB",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "flex-start",
        gap: 10,
        paddingTop: 105,
        width: "100%",
        minHeight: 205,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 105,
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 98,
            height: 100,
            position: "relative",
            background: "#F4F4F4",
            outline: "1px solid white",
            outlineOffset: -1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.2)", fontFamily: "SF Pro Rounded" }}>
            已获得卡片
          </span>
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 98,
              height: 100,
              position: "relative",
              background: "#C5C5C5",
              outline: "1px solid #B3B3B3",
              outlineOffset: -1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#E9E9E9", fontFamily: "SF Pro Rounded" }}>
              未获得卡片
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 68,
          width: 339,
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
          <span style={{ fontSize: 12, fontWeight: 500, color: "#FF9045" }}>1</span>
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
              width: 133,
              position: "absolute",
              top: 0.5,
              background: "#FCDA00",
              borderRadius: 30,
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#B2B2B2" }}>1</span>
        </div>
      </div>
    </div>
  );
}

/* 关卡组件（可配置：背景图 + 关卡图(三状态/自定义位置) + 引导形象） */
function resolveLevelImage(card: LevelCard): string | undefined {
  const state = card.state || "未解锁";
  if (state === "已完成") return card.completedImage || card.unlockedImage || card.lockedImage;
  if (state === "已解锁") return card.unlockedImage || card.completedImage || card.lockedImage;
  return card.lockedImage || card.unlockedImage || card.completedImage;
}

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

      {/* 关卡图：按 2 倍坐标换算后定位 */}
      {cards.map((card, i) => {
        const x = (card.x ?? 0) / 2;
        const y = (card.y ?? 0) / 2;
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
            <SvgaPlayer
              key={i}
              src={card.animation}
              loop
              autoplay
              style={style}
              fallback={img ? <img src={img} alt={`关卡${i + 1}动画兜底`} style={style} /> : null}
            />
          );
        }
        if (!img) return null;
        return <img key={i} src={img} alt={`关卡${i + 1}`} style={style} />;
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

/* 按钮组件（固定特色区块） */
function ButtonModule() {
  return (
    <img
      src="https://img.onlywnn.cn/figma/h_4dce23b9.png"
      alt="按钮组件"
      style={{ width: 375, height: 97, objectFit: "cover", display: "block" }}
    />
  );
}

/* 领课广告（固定特色区块） */
function AdModule() {
  return (
    <div style={{ alignSelf: "stretch", height: 236, flexShrink: 0, position: "relative" }}>
      <img
        src="https://img.onlywnn.cn/figma/h_e0d1c962.png"
        alt="图片组件"
        style={{ position: "absolute", left: 0, top: 0, width: 375, height: 236, objectFit: "cover" }}
      />
      <span
        style={{
          position: "absolute",
          left: 111,
          top: 89,
          opacity: 0.11,
          fontSize: 38.5,
          fontWeight: 700,
          fontFamily: "SF Pro Rounded",
          color: "black",
        }}
      >
        领课广告
      </span>
    </div>
  );
}

/* 我的作品（固定特色区块） */
function MyWorks() {
  return (
    <div
      style={{
        width: "100%",
        padding: "10px 16px",
        background: "#FFEAA3",
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
        }}
      >
        <img
          src="https://img.onlywnn.cn/figma/h_5d121fd1.png"
          alt="我的作品背景图"
          style={{ position: "absolute", left: 0, top: 0, width: 343, height: 226, objectFit: "cover" }}
        />
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

/* 优秀作品（固定特色区块） */
function ExcellentWorks() {
  return (
    <div
      style={{
        width: "100%",
        padding: "10px 16px",
        background: "#FFEAA3",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 343,
          height: 432,
          position: "relative",
          background: "#FFBA39",
          borderRadius: 25,
          overflow: "hidden",
        }}
      >
        <img
          src="https://img.onlywnn.cn/figma/h_a7e988c4.png"
          alt="优秀作品背景图"
          style={{ position: "absolute", left: 0, top: 0, width: 343, height: 290, objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 70,
            width: 343,
            padding: "0 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
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
          <img
            src="https://img.onlywnn.cn/figma/h_86750433.png"
            alt="优秀作品广告图"
            style={{ width: 311, height: 166, objectFit: "cover" }}
          />
        </div>
      </div>
    </div>
  );
}

/* 排行榜（固定特色区块） */
function Ranking() {
  return (
    <div
      style={{
        width: "100%",
        padding: "10px 16px",
        overflow: "hidden",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 343,
          height: 751,
          position: "relative",
          background: "#FFC575",
          overflow: "hidden",
          borderRadius: 25,
        }}
      >
        <img
          src="https://img.onlywnn.cn/figma/h_942707f9.png"
          alt="排行榜头图"
          style={{ position: "absolute", left: 0, top: 0, width: 343, height: 290, objectFit: "cover" }}
        />
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
  { type: "image", image: "https://img.onlywnn.cn/figma/h_483ae3df.png" },
  {
    type: "level",
    bgImage: "https://img.onlywnn.cn/figma/h_6e2a6768.png",
    levels: [
      {
        type: "levelCard",
        state: "已解锁",
        unlockedImage: "https://img.onlywnn.cn/figma/h_e589fc90.png",
        x: 28,
        y: 2,
        w: 330,
        h: 368,
      },
      {
        type: "levelCard",
        state: "未解锁",
        lockedImage: "https://img.onlywnn.cn/figma/h_70aef182.png",
        x: 392,
        y: 294,
        w: 330,
        h: 368,
      },
      {
        type: "levelCard",
        state: "未解锁",
        lockedImage: "https://img.onlywnn.cn/figma/h_61c26d1d.png",
        x: 80,
        y: 632,
        w: 342,
        h: 390,
      },
    ],
  },
];

function renderModule(m: Module, key: number) {
  switch (m.type) {
    case "participant":
      return <ParticipantModule key={key} bgImage={m.bgImage} count={m.count} />;
    case "video":
      return <VideoModule key={key} videoBg={m.videoBg} video={m.video} />;
    case "image":
      return <ImageModule key={key} image={m.image} />;
    case "level":
      return (
        <LevelModule
          key={key}
          bgImage={m.bgImage}
          guide={m.guide}
          levels={m.levels}
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
        {/* 内容模块流 */}
        {list.map((m, i) => renderModule(m, i))}

        {/* 固定特色区块 */}
        <CollectLottery />
        <ButtonModule />
        <AdModule />
        <MyWorks />
        <ExcellentWorks />
        <Ranking />
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
