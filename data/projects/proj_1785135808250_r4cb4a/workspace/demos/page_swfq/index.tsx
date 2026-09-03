interface DemoProps {
  /** 开场引入视频，值为 { url, poster? }，仅支持 MP4 / WebM */
  video?: { url?: string; poster?: string };
}

export default function Demo({ video }: DemoProps) {
  return (
    <div className="relative overflow-hidden" style={{ width: 375, height: 812, background: "black" }}>
      {/* Group 2344：背景图组 */}
      <div
        className="absolute"
        style={{ width: 375, height: 900, left: 0, top: -44 }}
      >
        <div
          className="absolute"
          style={{ width: 375, height: 900, left: 0, top: 0, background: "#B5B5B5" }}
        />
        {/* “视频”占位文字（原 Figma 静态标注，30% 透明度） */}
        <div
          className="absolute"
          style={{
            left: 131,
            top: 407,
            opacity: 0.3,
            color: "white",
            fontSize: 57,
            fontFamily: "FZLanTingYuan-B-GBK, serif",
            fontWeight: 400,
            lineHeight: "85.5px",
            whiteSpace: "nowrap",
          }}
        >
          视频
        </div>
      </div>

      {/* 开场引入视频（配置项注入） */}
      {video?.url ? (
        <video
          src={video.url}
          poster={video.poster}
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: "cover" }}
          autoPlay
          muted
          playsInline
        />
      ) : null}

      {/* 跳过按钮 */}
      <div
        className="absolute"
        style={{ width: 88, height: 34, left: 267, top: 738 }}
      >
        <div className="absolute" style={{ width: 88, height: 34, left: 0, top: 0, overflow: "hidden" }}>
          <div
            className="absolute"
            style={{ width: 88, height: 34, left: 0, top: 0, background: "white", borderRadius: 17 }}
          />
          <div className="absolute" style={{ width: 20, height: 20, left: 15, top: 7 }}>
            <div className="absolute" style={{ width: 20, height: 20, left: 0, top: 0 }}>
              <div
                className="absolute"
                style={{ width: 20, height: 20, left: 0, top: 0, opacity: 0, background: "#D8D8D8" }}
              />
              <div className="absolute" style={{ width: 14, height: 14, left: 3, top: 3 }}>
                <img
                  src="/api/images/img_sH3rSLk5fX6V4A"
                  alt="vector"
                  className="absolute"
                  style={{ left: 0, top: 0, width: 12, height: 14, objectFit: "contain" }}
                />
                <div
                  className="absolute"
                  style={{ width: 4, height: 14, left: 10, top: 0, background: "#8FAEBE", borderRadius: 2 }}
                />
              </div>
            </div>
          </div>
          <div
            className="absolute"
            style={{
              left: 38,
              top: 6,
              textAlign: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "#8FAEBE",
              fontSize: 16,
              fontFamily: "PingFang SC, sans-serif",
              fontWeight: 400,
            }}
          >
            跳过
          </div>
        </div>
      </div>
    </div>
  );
}
