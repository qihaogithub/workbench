import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";

export default function FigmaComponent(props) {
  // 项目级共享配置（由 PreviewPanel 运行时注入）
  const {
    inviteColor1 = '#FF6B35',
    inviteColor2 = '#F7C59F',
    mallColor1 = '#FEF7E5',
    mallColor2 = '#FEF7E5',
    inviteImage1URL = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E9%82%80%E8%AF%B7%E6%B4%BB%E5%8A%A801.png',
    inviteImage2URL = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E9%82%80%E8%AF%B7%E6%B4%BB%E5%8A%A802.png',
    mallImage1URL = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E5%95%86%E5%9C%BA1.png',
    mallImage2URL = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E6%88%91%E7%9A%84%E9%A1%B5/%E8%B5%84%E6%BA%90/%E5%95%86%E5%9C%BA2.png',
  } = props ;
  return (
    _jsxs('div', { className: "w-full h-screen overflow-hidden relative bg-[#ffffff]"    , children: [
    _jsx('style', { children: `
.figma-scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.figma-scrollbar-hide::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
`})
    /* 可滑动内容背景层 - 包含所有原始内容 */
    , _jsx('div', { className: "absolute inset-0 overflow-y-auto overflow-x-hidden figma-scrollbar-hide"    , children: 
      _jsxs('div', { className: "w-[1133px] min-h-screen relative mx-auto bg-[#ffffff]"    , 'data-figma-id': "153:125523", children: [
        _jsx('img', { src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_e545eaf5.png", alt: "static layer" , className: "left-[177px] top-[20px] absolute object-cover"   , 'data-figma-id': "153:157469", style: { width: 780, height: 527 },} )
        , _jsxs('div', { className: "w-[780px] left-[177px] top-[587.25px] absolute inline-flex flex-col justify-start items-start gap-5"        , 'data-figma-id': "153:125585", children: [
          _jsxs('div', { className: "w-[780px] h-[34px] shrink-0 px-1 inline-flex justify-between items-center"      , 'data-figma-id': "153:164881", children: [
            _jsx('div', { className: "shrink-0 justify-start text-[#666666] text-[22.50px] font-medium font-sans leading-[33.75px] whitespace-nowrap"       , 'data-figma-id': "153:164882", children: "邀友得奖"})
            , _jsxs('div', { className: "shrink-0 flex justify-end items-center"   , 'data-figma-id': "153:164883", children: [
              _jsx('div', { className: "shrink-0 text-right justify-center text-[#b2b2b2] text-lg font-normal font-sans leading-[27px] whitespace-nowrap"        , 'data-figma-id': "153:164884", children: "邀请奖励记录"})
              , _jsx('div', { className: "w-4 h-4 shrink-0 relative origin-top-left rotate-180"     , 'data-figma-id': "153:164891", children: 
                _jsx('img', { className: "left-[11px] top-[14px] absolute w-[6.17px] h-3 origin-top-left rotate-180"      , 'data-figma-id': "153:164895", src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_2e4a9690.svg",} )
              })
            ]})
          ]})
          , _jsxs('div', { className: "self-stretch shrink-0 inline-flex justify-start items-center gap-2.5"     , 'data-figma-id': "153:164868", children: [
            _jsx('div', { className: "flex items-center justify-center overflow-hidden rounded-md"    , style: { width: 385, height: 80, backgroundColor: inviteColor1, borderRadius: 20 }, children: 
              _jsx('img', { src: inviteImage1URL, alt: "邀请活动图片1", className: "h-full w-auto" ,} )
            })
            , _jsx('div', { className: "flex items-center justify-center overflow-hidden rounded-md"    , style: { width: 385, height: 77.5, backgroundColor: inviteColor2, borderRadius: 20 }, children: 
              _jsx('img', { src: inviteImage2URL, alt: "邀请活动图片2", className: "h-full w-auto" ,} )
            })
          ]})
        ]})
        , _jsxs('div', { className: "w-[780px] left-[177px] top-[761.25px] absolute inline-flex flex-col justify-start items-start gap-5"        , 'data-figma-id': "153:125594", children: [
          _jsx('div', { className: "self-stretch shrink-0 inline-flex justify-start items-end gap-2.5"     , 'data-figma-id': "153:125595", children: 
            _jsxs('div', { className: "grow basis-0 px-1 flex justify-between items-center"     , 'data-figma-id': "I153:125595;6092:35344", children: [
              _jsx('div', { className: "shrink-0 justify-start text-[#666666] text-[22.50px] font-medium font-sans leading-[33.75px] whitespace-nowrap"       , 'data-figma-id': "I153:125595;6092:35345", children: "叫叫商城"})
              , _jsxs('div', { className: "shrink-0 opacity-0 flex justify-end items-center"    , 'data-figma-id': "I153:125595;6092:35346", children: [
                _jsx('div', { className: "shrink-0 text-right justify-center text-[#b2b2b2] text-lg font-normal font-sans leading-[27px] whitespace-nowrap"        , 'data-figma-id': "I153:125595;6092:35347", children: "邀请奖励记录"})
                , _jsxs('div', { className: "w-4 h-4 shrink-0 relative origin-top-left rotate-180"     , 'data-figma-id': "I153:125595;6092:35348", children: [
                  _jsx('div', { className: "w-[6.17px] h-3 left-[11px] top-[14px] absolute origin-top-left rotate-180 bg-[#acb2bb]"       , 'data-figma-id': "I153:125595;6092:35348;354:288",} )
                  , _jsx('div', { className: "w-4 h-4 left-0 top-0 absolute bg-[#000000]/0"     , 'data-figma-id': "I153:125595;6092:35348;503:1980",} )
                ]})
              ]})
            ]})
          })
          , _jsxs('div', { className: "self-stretch shrink-0 inline-flex justify-start items-center gap-2.5"     , 'data-figma-id': "153:164874", children: [
            _jsx('div', { className: "flex items-center justify-center overflow-hidden rounded-md"    , style: { width: 385, height: 80, backgroundColor: mallColor1, borderRadius: 20 }, children: 
              _jsx('img', { src: mallImage1URL, alt: "商场图片1", className: "h-full w-auto" ,} )
            })
            , _jsx('div', { className: "flex items-center justify-center overflow-hidden rounded-md"    , style: { width: 385, height: 77.5, backgroundColor: mallColor2, borderRadius: 20 }, children: 
              _jsx('img', { src: mallImage2URL, alt: "商场图片2", className: "h-full w-auto" ,} )
            })
          ]})
        ]})
        , _jsx('div', { className: "w-[780px] px-2.5 py-6 left-[177px] top-[915.25px] absolute inline-flex flex-col justify-end items-center gap-2.5"          , 'data-figma-id': "153:125603", children: 
          _jsx('img', { className: "w-[156.98px] h-[39.85px] shrink-0"  , 'data-figma-id': "153:164920", src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_e7e211e2.svg",} )
        })
        , _jsx('img', { src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_3b8dd1f6.png", alt: "static layer" , className: "left-0 top-0 absolute object-cover"   , 'data-figma-id': "153:125605", style: { width: 1133, height: 20 },} )
        , _jsx('div', { className: "left-0 top-[1024px] absolute"  , style: { width: 1133 }, 'data-figma-id': "153:125606", children: 
          _jsx('img', { src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_684bdf65.png", alt: "底部广告图", className: "w-full object-contain" ,} )
        })
      ]})
    })
    /* 顶部导航栏 - 固定在顶部 */
    , _jsx('div', { className: "absolute top-0 left-1/2 -translate-x-1/2 z-10 pointer-events-none"     , style: { width: 1133 }, children: 
      _jsx('img', { src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_3b8dd1f6.png", alt: "顶部导航栏", className: "w-full object-cover" , style: { height: 20 },} )
    })
    /* 底部标签栏 - 固定在底部（吸底） */
    , _jsx('div', { className: "absolute bottom-0 left-1/2 -translate-x-1/2 z-10 pointer-events-none"     , style: { width: 1133 }, children: 
      _jsx('img', { src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_684bdf65.png", alt: "底部标签栏", className: "w-full object-contain" ,} )
    })
    ]})
  );
}
