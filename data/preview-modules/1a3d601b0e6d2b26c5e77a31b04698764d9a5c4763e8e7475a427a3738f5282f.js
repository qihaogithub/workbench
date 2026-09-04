import {jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment} from "http://localhost:4200/preview-runtime/vendor/react-jsx-runtime.js"; function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } } function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }import { SvgaPlayer, SpinePlayer } from "http://localhost:4200/preview-runtime/vendor/preview-sdk.js";













































/* 参与人数模块：背景图可配置，UI 控件样式固定 */
function ParticipantModule({ bgImage, count }) {
  return (
    _jsxs('div', {
      style: {
        alignSelf: "stretch",
        height: 45,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      },
 children: [
      bgImage ? (
        _jsx('img', {
          src: bgImage,
          alt: "参与人数组件背景图",
          style: { position: "absolute", left: 0, top: 0, width: 375, height: 45, objectFit: "cover" },}
        )
      ) : (
        _jsx('div', { style: { position: "absolute", left: 0, top: 0, width: 375, height: 45, background: "#F0F0F0" },} )
      )
      , _jsxs('div', {
        style: {
          position: "absolute",
          left: 105,
          top: 7,
          width: 165,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        },
 children: [
        _jsx('span', { style: { fontSize: 13, fontWeight: 700, color: "#404040", fontFamily: "PingFang SC" }, children: "参与人数"

        })
        , _jsx('span', { style: { fontSize: 13, fontWeight: 700, color: "#FF9045", fontFamily: "PingFang SC" }, children: 
          _nullishCoalesce(count, () => ( 0))
        })
      ]})
    ]})
  );
}

/* 视频模块：视频背景图 + 封面(poster) + 文件(url) */
function VideoModule({ videoBg, video }) {
  const hasSrc = !!_optionalChain([video, 'optionalAccess', _2 => _2.url]);
  return (
    _jsx('div', {
      style: {
        alignSelf: "stretch",
        height: 211,
        flexShrink: 0,
        position: "relative",
        background: "#DBDBDB",
        overflow: "hidden",
      },
 children: 
      videoBg ? (
        _jsx('img', {
          src: videoBg,
          alt: "视频背景图",
          style: { position: "absolute", left: 0, top: 0, width: 375, height: 211, objectFit: "cover" },}
        )
      ) : (
        _jsx('div', {
          style: {
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
          },
 children: 
          hasSrc ? (
            _jsx('video', {
              src: _optionalChain([video, 'optionalAccess', _3 => _3.url]),
              poster: _optionalChain([video, 'optionalAccess', _4 => _4.poster]),
              controls: true,
              style: { width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 },}
            )
          ) : (
            _jsxs(_Fragment, { children: [
              _optionalChain([video, 'optionalAccess', _5 => _5.poster]) && (
                _jsx('img', {
                  src: video.poster,
                  alt: "视频封面",
                  style: { width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 },}
                )
              )
              , _jsx('img', {
                src: "https://img.onlywnn.cn/figma/h_f9f81d7b.png",
                alt: "播放按钮",
                style: { position: "absolute", left: 132, top: 59, width: 70, height: 70, objectFit: "cover" },}
              )
            ]})
          )
        })
      )
    })
  );
}

/* 图片模块：任意数量、任意位置 */
function ImageModule({ image }) {
  return (
    _jsx('img', {
      src: image,
      alt: "图片组件",
      style: { width: 375, height: "auto", display: "block", objectFit: "cover" },}
    )
  );
}

/* 集卡抽奖模块：背景图 / 卡片总数 / 已收集数量 / 已获得与未获得卡片图可配置，进度条与卡片样式固定 */
function CollectLotteryModule({
  bgImage,
  total,
  collected,
  obtainedImage,
  unobtainedImage,
}





) {
  const cardTotal = Math.max(_nullishCoalesce(total, () => ( 4)), 1);
  const gotCount = Math.min(Math.max(_nullishCoalesce(collected, () => ( 1)), 0), cardTotal);
  const percent = (gotCount / cardTotal) * 100;
  return (
    _jsxs('div', {
      style: {
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
      },
 children: [
      bgImage ? (
        _jsx('img', {
          src: bgImage,
          alt: "集卡抽奖背景图",
          style: { position: "absolute", left: 0, top: 0, width: 375, height: 205, objectFit: "cover" },}
        )
      ) : null
      , _jsx('div', {
        style: {
          position: "absolute",
          left: 20,
          top: 105,
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "flex-start",
          gap: 8,
        },
 children: 
        Array.from({ length: cardTotal }).map((_, i) => {
          const obtained = i < gotCount;
          const cardImg = obtained ? obtainedImage : unobtainedImage;
          const label = obtained ? "已获得卡片" : "未获得卡片";
          return (
            _jsx('div', {

              style: {
                width: 98,
                height: 100,
                position: "relative",
                background: obtained ? "#F4F4F4" : "#C5C5C5",
                outline: `1px solid ${obtained ? "white" : "#B3B3B3"}`,
                outlineOffset: -1,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              },
 children: 
              cardImg ? (
                _jsx('img', { src: cardImg, alt: label, style: { width: "100%", height: "100%", objectFit: "cover" },} )
              ) : (
                _jsx('span', {
                  style: {
                    fontSize: 12,
                    fontWeight: 700,
                    color: obtained ? "rgba(0,0,0,0.2)" : "#E9E9E9",
                    fontFamily: "SF Pro Rounded",
                  },
 children: 
                  label
                })
              )
            }, i)
          );
        })
      })
      , _jsxs('div', {
        style: {
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
        },
 children: [
        _jsxs('div', { style: { display: "flex", gap: 4 }, children: [
          _jsx('span', { style: { fontSize: 12, fontWeight: 500, color: "#666666" }, children: "已收集"})
          , _jsx('span', { style: { fontSize: 12, fontWeight: 500, color: "#FF9045" }, children: gotCount})
        ]})
        , _jsxs('div', { style: { flex: 1, height: 14, position: "relative" }, children: [
          _jsx('div', {
            style: {
              height: 11,
              width: "100%",
              position: "absolute",
              top: 1,
              background: "rgba(9,9,9,0.14)",
              borderRadius: 30,
            },}
          )
          , _jsx('div', {
            style: {
              height: 11,
              width: `${percent}%`,
              position: "absolute",
              top: 0.5,
              background: "#FCDA00",
              borderRadius: 30,
            },}
          )
        ]})
        , _jsx('div', { style: { display: "flex", gap: 4 }, children: 
          _jsx('span', { style: { fontSize: 12, fontWeight: 500, color: "#B2B2B2" }, children: cardTotal})
        })
      ]})
    ]})
  );
}

/* 关卡图取图：已完成图 → 已解锁图 → 未解锁图，取第一个有值的图片 */
function resolveLevelImage(card) {
  return card.completedImage || card.unlockedImage || card.lockedImage;
}

/* 关卡组件（可配置：背景图 + 关卡图(自定义图片/自由坐标/自定义尺寸) + 引导形象） */
function LevelModule({
  bgImage,
  guide,
  levels,
}



) {
  const cards = levels && levels.length > 0 ? levels : [];
  return (
    _jsxs('div', {
      style: {
        alignSelf: "stretch",
        flexShrink: 0,
        position: "relative",
        background: "#DBDBDB",
        overflow: "hidden",
      },
 children: [
      /* 关卡背景图：以图片自然高度撑起组件高度（W=375） */
      bgImage ? (
        _jsx('img', {
          src: bgImage,
          alt: "关卡背景图",
          style: { display: "block", width: 375, objectFit: "cover" },}
        )
      ) : (
        _jsx('div', { style: { width: 375, height: 656, background: "#DBDBDB" },} )
      )

      /* 关卡图：position 使用 1 倍像素，w/h 使用 2 倍值 */
      , cards.map((card, i) => {
        const x = _nullishCoalesce(_optionalChain([card, 'access', _6 => _6.position, 'optionalAccess', _7 => _7.x]), () => ( 0));
        const y = _nullishCoalesce(_optionalChain([card, 'access', _8 => _8.position, 'optionalAccess', _9 => _9.y]), () => ( 0));
        const w = (_nullishCoalesce(card.w, () => ( 0))) / 2;
        const h = (_nullishCoalesce(card.h, () => ( 0))) / 2;
        const img = resolveLevelImage(card);
        const style = {
          position: "absolute" ,
          left: x,
          top: y,
          width: w,
          height: h,
          objectFit: "cover" ,
        };
        if (card.animation) {
          return (
            _jsx('div', {

              'data-pos-key': "levelCard",
              style: { position: "absolute", left: x, top: y, width: w, height: h },
 children: 
              _jsx(SvgaPlayer, {
                src: card.animation,
                loop: true,
                autoplay: true,
                style: { width: "100%", height: "100%", objectFit: "cover" },
                fallback: img ? _jsx('img', { src: img, alt: `关卡${i + 1}动画兜底`, style: { width: "100%", height: "100%", objectFit: "cover" },} ) : null,}
              )
            }, i)
          );
        }
        if (!img) return null;
        return _jsx('img', { src: img, 'data-pos-key': "levelCard", alt: `关卡${i + 1}`, style: style,}, i );
      })

      /* 闯关引导形象（Spine） */
      , guide ? (
        _jsx(SpinePlayer, {
          src: guide,
          loop: true,
          fit: "contain",
          alignment: "bottom",
          style: { position: "absolute", left: 8, bottom: 20, width: 80, height: 130 },
          fallback: null,}
        )
      ) : null
    ]})
  );
}

/* 按钮模块（图片可配置，整宽展示，高度 97px） */
function ButtonModule({ image }) {
  const src = image || "https://img.onlywnn.cn/figma/h_4dce23b9.png";
  return (
    _jsx('img', {
      src: src,
      alt: "按钮组件",
      style: { width: 375, height: 97, objectFit: "cover", display: "block", flexShrink: 0 },}
    )
  );
}

/* 领课广告（固定特色区块） */
function AdModule() {
  return (
    _jsxs('div', { style: { alignSelf: "stretch", height: 236, flexShrink: 0, position: "relative" }, children: [
      _jsx('img', {
        src: "https://img.onlywnn.cn/figma/h_e0d1c962.png",
        alt: "图片组件",
        style: { position: "absolute", left: 0, top: 0, width: 375, height: 236, objectFit: "cover" },}
      )
      , _jsx('span', {
        style: {
          position: "absolute",
          left: 111,
          top: 89,
          opacity: 0.11,
          fontSize: 38.5,
          fontWeight: 700,
          fontFamily: "SF Pro Rounded",
          color: "black",
        },
 children: "领课广告"

      })
    ]})
  );
}

/* 我的作品（内容模块）：模块背景头图 / 背景色 / 模块内背景色可配置 */
function MyWorks({
  headerImage,
  bgColor,
  innerBgColor,
}



) {
  return (
    _jsx('div', {
      style: {
        width: "100%",
        padding: "10px 16px",
        background: bgColor || "#FFEAA3",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 10,
      },
 children: 
      _jsxs('div', {
        style: {
          width: 343,
          height: 226,
          position: "relative",
          overflow: "hidden",
          borderRadius: 25,
          background: innerBgColor || "#FFBA39",
        },
 children: [
        headerImage ? (
          _jsx('img', {
            src: headerImage,
            alt: "我的作品模块背景头图",
            style: { position: "absolute", left: 0, top: 0, width: 343, height: 226, objectFit: "cover" },}
          )
        ) : null
        , _jsxs('div', {
          style: {
            position: "absolute",
            left: 16,
            top: 70,
            width: 311,
            background: "white",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            gap: 16,
          },
 children: [
          _jsx('div', { style: { padding: "8px 0 8px 8px", display: "flex", alignItems: "center", gap: 12 }, children: 
            _jsx('img', {
              src: "https://img.onlywnn.cn/figma/h_c4d5a09e.png",
              alt: "作品封面",
              style: { width: 124, height: 124, borderRadius: 12 },}
            )
          })
          , _jsxs('div', {
            style: {
              flex: 1,
              padding: "12px 16px 12px 0",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              alignItems: "flex-start",
            },
 children: [
            _jsx('div', { style: { display: "flex", alignItems: "flex-end", gap: 34 }, children: 
              _jsx('span', { style: { fontSize: 20, fontWeight: 500, color: "#404040" }, children: "魏豆豆"})
            })
            , _jsxs('div', {
              style: {
                padding: "2px 8px",
                background: "white",
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                gap: 4,
              },
 children: [
              _jsx('span', { style: { fontSize: 16, color: "#FF715C" }, children: "❤"})
              , _jsx('span', { style: { fontSize: 18, fontWeight: 500, color: "#FF715C" }, children: "12"})
            ]})
            , _jsx('img', {
              src: "https://img.onlywnn.cn/figma/h_20b80f7e.png",
              alt: "按钮",
              style: { width: 147, height: 36, objectFit: "cover" },}
            )
          ]})
          , _jsxs('div', {
            style: {
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
            },
 children: [
            _jsx('span', { style: { fontSize: 12, color: "white" }, children: "排名"})
            , _jsx('span', { style: { fontSize: 12, color: "white" }, children: "12"})
          ]})
        ]})
      ]})
    })
  );
}

/* 优秀作品（内容模块） */
function ExcellentWorks() {
  return (
    _jsx('div', {
      style: {
        width: "100%",
        padding: "10px 16px",
        background: "#FFEAA3",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      },
 children: 
      _jsxs('div', {
        style: {
          width: 343,
          height: 432,
          position: "relative",
          background: "#FFBA39",
          borderRadius: 25,
          overflow: "hidden",
        },
 children: [
        _jsx('img', {
          src: "https://img.onlywnn.cn/figma/h_a7e988c4.png",
          alt: "优秀作品背景图",
          style: { position: "absolute", left: 0, top: 0, width: 343, height: 290, objectFit: "cover" },}
        )
        , _jsxs('div', {
          style: {
            position: "absolute",
            left: 0,
            top: 70,
            width: 343,
            padding: "0 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          },
 children: [
          _jsx('div', { style: { alignSelf: "stretch", display: "flex", alignItems: "flex-end", gap: 8 }, children: 
            ["h_d3d88535.png", "h_2637513b.png", "h_abfb8bd9.png"].map((f, i) => (
              _jsxs('div', {

                style: {
                  position: "relative",
                  borderRadius: 12,
                  overflow: "hidden",
                  outline: "1px solid white",
                  outlineOffset: -1,
                  boxShadow: "0 0 8px rgba(0,0,0,0.12)",
                },
 children: [
                _jsx('img', { src: `https://img.onlywnn.cn/figma/${f}`, alt: "作品", style: { width: 130, height: 130 },} )
                , _jsxs('div', {
                  style: {
                    width: 130,
                    padding: 6,
                    background: "linear-gradient(0deg, white 0%, white 100%), linear-gradient(180deg, rgba(76,76,76,0) 0%, rgba(77,77,77,0.5) 60%)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  },
 children: [
                  _jsx('img', {
                    src: "https://img.onlywnn.cn/figma/h_781b9753.png",
                    alt: "头像",
                    style: { width: 26, height: 26, borderRadius: 9999 },}
                  )
                  , _jsx('span', { style: { fontSize: 14, color: "#404040" }, children: "骋骋。"})
                ]})
              ]}, i)
            ))
          })
          , _jsx('img', {
            src: "https://img.onlywnn.cn/figma/h_86750433.png",
            alt: "优秀作品广告图",
            style: { width: 311, height: 166, objectFit: "cover" },}
          )
        ]})
      ]})
    })
  );
}

/* 排行榜（内容模块） */
function Ranking() {
  return (
    _jsx('div', {
      style: {
        width: "100%",
        padding: "10px 16px",
        overflow: "hidden",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      },
 children: 
      _jsxs('div', {
        style: {
          width: 343,
          height: 751,
          position: "relative",
          background: "#FFC575",
          overflow: "hidden",
          borderRadius: 25,
        },
 children: [
        _jsx('img', {
          src: "https://img.onlywnn.cn/figma/h_942707f9.png",
          alt: "排行榜头图",
          style: { position: "absolute", left: 0, top: 0, width: 343, height: 290, objectFit: "cover" },}
        )
        , _jsxs('div', {
          style: {
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
          },
 children: [
          /* 前三名 */
          _jsxs('div', {
            style: {
              position: "absolute",
              left: 0,
              top: -114,
              width: 311,
              display: "flex",
              alignItems: "flex-end",
            },
 children: [
            _jsxs('div', { style: { width: 94, height: 132, position: "relative" }, children: [
              _jsx('img', {
                src: "https://img.onlywnn.cn/figma/h_da563882.png",
                alt: "第2名背景图",
                style: { position: "absolute", left: 0, top: 0, width: 94, height: 132, objectFit: "cover" },}
              )
              , _jsx('img', {
                src: "https://img.onlywnn.cn/figma/h_7f44a115.png",
                alt: "头像",
                style: { position: "absolute", left: 12, top: 34, width: 70, height: 70, borderRadius: 8 },}
              )
            ]})
            , _jsxs('div', { style: { width: 123, height: 167, position: "relative" }, children: [
              _jsx('img', {
                src: "https://img.onlywnn.cn/figma/h_50b55e4f.png",
                alt: "第1名背景图",
                style: { position: "absolute", left: 0, top: 0, width: 123, height: 167, objectFit: "cover" },}
              )
              , _jsx('img', {
                src: "https://img.onlywnn.cn/figma/h_ba9a691.png",
                alt: "头像",
                style: { position: "absolute", left: 12, top: 40, width: 99, height: 99, borderRadius: 8 },}
              )
              , _jsx('div', {
                style: {
                  position: "absolute",
                  left: 0,
                  top: 139,
                  width: 123,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                },
 children: 
                _jsx('span', { style: { fontSize: 16, color: "#404040" }, children: "吴*萱"})
              })
            ]})
            , _jsxs('div', { style: { width: 94, height: 132, position: "relative" }, children: [
              _jsx('img', {
                src: "https://img.onlywnn.cn/figma/h_f2b2b21b.png",
                alt: "第3名背景图",
                style: { position: "absolute", left: 0, top: 0, width: 94, height: 132, objectFit: "cover" },}
              )
              , _jsx('img', {
                src: "https://img.onlywnn.cn/figma/h_14176f77.png",
                alt: "头像",
                style: { position: "absolute", left: 12, top: 34, width: 70, height: 70, borderRadius: 8 },}
              )
            ]})
          ]})
          /* 4-8 名列表 */
          , _jsx('div', { style: { display: "flex", flexDirection: "column", gap: 12, marginTop: 160 }, children: 
            [
              ["4", "李梓发", "997"],
              ["5", "李世海", "934"],
              ["6", "吴彦谦", "922"],
              ["7", "钱萌萌", "312"],
              ["8", "冯启彬", "12"],
            ].map(([rank, name, likes]) => (
              _jsxs('div', {

                style: {
                  width: 311,
                  height: 52,
                  position: "relative",
                  background: "white",
                  borderRadius: 16,
                  display: "flex",
                  alignItems: "center",
                },
 children: [
                _jsx('span', { style: { position: "absolute", left: 16, width: 25, textAlign: "center", color: "#404040", fontSize: 14 }, children: 
                  rank
                })
                , _jsx('img', {
                  src: "https://img.onlywnn.cn/figma/h_e88a9e02.png",
                  alt: "头像",
                  style: { position: "absolute", left: 61, width: 52, height: 52, borderRadius: 8 },}
                )
                , _jsx('span', { style: { position: "absolute", left: 127, color: "#404040", fontSize: 14 }, children: name})
                , _jsxs('div', {
                  style: {
                    position: "absolute",
                    left: 225,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  },
 children: [
                  _jsx('span', { style: { color: "#FF715C", fontSize: 14 }, children: "❤"})
                  , _jsx('span', { style: { color: "#FF715C", fontSize: 14 }, children: likes})
                ]})
              ]}, rank)
            ))
          })
        ]})
      ]})
    })
  );
}

const DEFAULT_MODULES = [
  { type: "image", image: "https://img.onlywnn.cn/figma/h_c61916f5.png" },
  { type: "participant", bgImage: "https://img.onlywnn.cn/figma/h_19dbcc85.png", count: 128 },
  { type: "video", videoBg: "", video: { url: "", poster: "" } },
  {
    type: "collectCard",
    bgImage: "",
    total: 4,
    collected: 1,
    obtainedImage: "",
    unobtainedImage: "",
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
  { type: "excellentWorks" },
  { type: "ranking" },
];

function renderModule(m, key) {
  switch (m.type) {
    case "participant":
      return _jsx(ParticipantModule, { bgImage: m.bgImage, count: m.count,}, key );
    case "video":
      return _jsx(VideoModule, { videoBg: m.videoBg, video: m.video,}, key );
    case "image":
      return _jsx(ImageModule, { image: m.image,}, key );
    case "button":
      return _jsx(ButtonModule, { image: m.image,}, key );
    case "level":
      return (
        _jsx(LevelModule, {

          bgImage: m.bgImage,
          guide: m.guide,
          levels: m.levels,}, key
        )
      );
    case "collectCard":
      return (
        _jsx(CollectLotteryModule, {

          bgImage: m.bgImage,
          total: m.total,
          collected: m.collected,
          obtainedImage: m.obtainedImage,
          unobtainedImage: m.unobtainedImage,}, key
        )
      );
    case "myWorks":
      return (
        _jsx(MyWorks, {

          headerImage: m.headerImage,
          bgColor: m.bgColor,
          innerBgColor: m.innerBgColor,}, key
        )
      );
    case "excellentWorks":
      return _jsx(ExcellentWorks, {}, key );
    case "ranking":
      return _jsx(Ranking, {}, key );
    default:
      return null;
  }
}

export default function Demo({ navColor = "#C4C4C4", modules }) {
  const list = modules && modules.length > 0 ? modules : DEFAULT_MODULES;
  return (
    _jsxs('div', { style: { width: 375, minHeight: 812, position: "relative", background: "#FFEAA3", margin: "0 auto" }, children: [
      /* 内容区 */
      _jsxs('div', {
        style: {
          position: "relative",
          top: 88,
          background: "#FFEAA3",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        },
 children: [
        /* 内容模块流（含我的作品 / 优秀作品 / 排行榜，顺序由配置面板拖拽排序决定） */
        list.map((m, i) => renderModule(m, i))

        /* 固定特色区块 */
        , _jsx(AdModule, {} )
      ]})

      /* 原生导航/状态栏目 */
      , _jsxs('div', {
        style: {
          position: "absolute",
          left: 0,
          top: 0,
          width: 375,
          background: navColor,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        },
 children: [
        _jsxs('div', { style: { width: 375, height: 44, position: "relative" }, children: [
          _jsx('img', {
            src: "https://img.onlywnn.cn/figma/h_37173ecb.svg",
            alt: "状态图标",
            style: { position: "absolute", left: 293.67, top: 17.33, width: 67, height: 11 },}
          )
          , _jsx('img', {
            src: "https://img.onlywnn.cn/figma/h_ce0aae82.svg",
            alt: "时间",
            style: { position: "absolute", left: 20.6, top: 16.81, width: 24, height: 10 },}
          )
        ]})
        , _jsxs('div', {
          style: {
            width: 375,
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          },
 children: [
          _jsx('img', { src: "https://img.onlywnn.cn/figma/h_f6be9123.png", alt: "功能左", style: { width: 44, height: 44 },} )
          , _jsx('img', { src: "https://img.onlywnn.cn/figma/h_3372662a.png", alt: "功能右", style: { width: 44, height: 44 },} )
          , _jsx('div', {
            style: {
              position: "absolute",
              left: 51,
              top: 9.5,
              width: 272,
              height: 25,
              textAlign: "center",
              color: "white",
              fontSize: 18,
              fontWeight: 500,
            },}
          )
        ]})
      ]})

      /* 规则 / 音乐 */
      , _jsx('img', {
        src: "https://img.onlywnn.cn/figma/h_111a6947.png",
        alt: "规则",
        style: { position: "absolute", left: 318, top: 143, width: 57, height: 25 },}
      )
      , _jsx('img', {
        src: "https://img.onlywnn.cn/figma/h_cb7f0ea2.png",
        alt: "音乐",
        style: { position: "absolute", left: 333, top: 105, width: 30, height: 30 },}
      )
    ]})
  );
}
