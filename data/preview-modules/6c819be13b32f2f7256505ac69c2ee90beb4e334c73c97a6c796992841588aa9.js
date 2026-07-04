import {jsxs as _jsxs, Fragment as _Fragment, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";import React from "http://localhost:3200/preview-runtime/vendor/react.js";



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
_jsxs(_Fragment, { children: [
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
    , _jsxs('div', { className: "w-[375px] h-[812px] relative bg-[#ffffff] rounded-3xl overflow-hidden"     , 'data-figma-id': "152:6385", children: [
      /* 可滑动内容背景层 - 包含所有原始内容 */
      _jsxs('div', { className: "absolute inset-0 overflow-y-auto overflow-x-hidden figma-scrollbar-hide"    , children: [
        _jsxs('div', { className: "w-[335px] left-[20px] top-[513px] absolute inline-flex flex-col justify-start items-start gap-3.5"        , 'data-figma-id': "152:114803", children: [
          _jsxs('div', { className: "self-stretch shrink-0 pb-3.5 flex flex-col justify-start items-start gap-2"       , 'data-figma-id': "152:6405", children: [
            _jsxs('div', { className: "w-[335px] h-[27px] shrink-0 inline-flex justify-between items-center"     , 'data-figma-id': "152:6407", children: [
              _jsx('div', { className: "shrink-0 justify-start text-[#3f3f3f] text-lg font-medium font-sans leading-[27px] whitespace-nowrap"       , 'data-figma-id': "152:6408", children: "邀请活动"})
              , _jsxs('div', { className: "shrink-0 pr-1 flex justify-end items-center"    , 'data-figma-id': "152:6409", children: [
                _jsx('div', { className: "shrink-0 text-right justify-center text-[#acb2bb] text-xs font-normal font-sans leading-[18px] whitespace-nowrap"        , 'data-figma-id': "152:6410", children: "邀请奖励记录"})
                , _jsx('img', { src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_853e7362.png", alt: "static layer" , className: "object-cover", 'data-figma-id': "152:6411", style: { width: 16, height: 16 },} )
              ]})
            ]})
            , _jsxs('div', { className: "self-stretch shrink-0 inline-flex justify-start items-center gap-2"     , 'data-figma-id': "152:6412", children: [
              _jsx('div', { className: "flex items-center justify-center overflow-hidden rounded-md"    , 'data-slot-type': "color", style: { width: 163.50, height: 64, backgroundColor: inviteColor1, borderRadius: 16 }, children: 
                _jsx('img', { src: inviteImage1URL, alt: "邀请活动图片1", className: "h-full w-auto" ,} )
              })
              , _jsx('div', { className: "flex items-center justify-center overflow-hidden rounded-md"    , 'data-slot-type': "color", style: { width: 163.50, height: 62, backgroundColor: inviteColor2, borderRadius: 16 }, children: 
                _jsx('img', { src: inviteImage2URL, alt: "邀请活动图片2", className: "h-full w-auto" ,} )
              })
            ]})
          ]})
          , _jsxs('div', { className: "self-stretch shrink-0 pb-3.5 flex flex-col justify-start items-start gap-2"       , 'data-figma-id': "152:6415", children: [
            _jsx('div', { className: "self-stretch shrink-0 inline-flex justify-start items-end gap-2.5"     , 'data-figma-id': "152:6416", children: 
              _jsxs('div', { className: "grow basis-0 px-1 flex justify-between items-center"     , 'data-figma-id': "I152:6416;6092:35332", children: [
                _jsx('div', { className: "shrink-0 justify-start text-[#666666] text-lg font-medium font-sans leading-[27px] whitespace-nowrap"       , 'data-figma-id': "I152:6416;6092:35333", children: "叫叫商城"})
                , _jsxs('div', { className: "shrink-0 pr-1 opacity-0 flex justify-end items-center"     , 'data-figma-id': "I152:6416;6092:35334", children: [
                  _jsx('div', { className: "shrink-0 text-right justify-center text-[#acb2bb] text-xs font-normal font-sans leading-[18px] whitespace-nowrap"        , 'data-figma-id': "I152:6416;6092:35335", children: "邀请奖励记录"})
                  , _jsxs('div', { className: "w-4 h-4 shrink-0 relative origin-top-left rotate-180"     , 'data-figma-id': "I152:6416;6092:35336", children: [
                    _jsx('div', { className: "w-[6.17px] h-3 left-[11px] top-[14px] absolute origin-top-left rotate-180 bg-[#acb2bb]"       , 'data-figma-id': "I152:6416;6092:35336;354:288",} )
                    , _jsx('div', { className: "w-4 h-4 left-0 top-0 absolute bg-[#000000]/0"     , 'data-figma-id': "I152:6416;6092:35336;503:1980",} )
                  ]})
                ]})
              ]})
            })
            , _jsxs('div', { className: "w-[335px] shrink-0 inline-flex justify-start items-center gap-2"     , 'data-figma-id': "152:114823", children: [
              _jsx('div', { className: "flex items-center justify-center overflow-hidden rounded-md"    , 'data-slot-type': "color", style: { width: 163.50, height: 64, backgroundColor: mallColor1, borderRadius: 16 }, children: 
                _jsx('img', { src: mallImage1URL, alt: "商场图片1", className: "h-full w-auto" ,} )
              })
              , _jsx('div', { className: "flex items-center justify-center overflow-hidden rounded-md"    , 'data-slot-type': "color", style: { width: 163.50, height: 62, backgroundColor: mallColor2, borderRadius: 16 }, children: 
                _jsx('img', { src: mallImage2URL, alt: "商场图片2", className: "h-full w-auto" ,} )
              })
            ]})
          ]})
        ]})
        , _jsx('div', { className: "w-[335px] px-2.5 py-6 left-[20px] top-[767px] absolute inline-flex flex-col justify-end items-center gap-2.5"          , 'data-figma-id': "152:6420", children: 
          _jsxs('div', { className: "w-[159px] h-[45px] shrink-0 relative overflow-hidden"    , 'data-figma-id': "152:6421", children: [
            _jsxs('div', { className: "w-[126px] h-5 left-[17px] top-0 absolute overflow-hidden"     , 'data-figma-id': "I152:6421;412:16040", children: [
              _jsx('div', { className: "left-[22px] top-[2px] absolute justify-start text-[#abb2bb] text-sm font-normal font-['FZLanTingYuan-DB-GBK'] leading-4 whitespace-nowrap"         , 'data-figma-id': "I152:6421;412:16041", children: "400-686-7000"})
              , _jsx('div', { className: "w-5 h-5 left-0 top-0 absolute"    , 'data-figma-id': "I152:6421;412:16042", children: 
                _jsx('div', { className: "w-5 h-5 left-0 top-0 absolute"    , 'data-figma-id': "I152:6421;412:16043", children: 
                  _jsxs('div', { className: "w-5 h-5 left-0 top-0 absolute"    , 'data-figma-id': "I152:6421;412:16043;0:4505", children: [
                    _jsx('div', { className: "w-5 h-5 left-0 top-0 absolute opacity-0 bg-[#d7d7d7]"      , 'data-figma-id': "I152:6421;412:16043;0:4506",} )
                    , _jsx('img', { className: "left-[2px] top-[2px] absolute w-4 h-4"    , 'data-figma-id': "I152:6421;412:16043;0:4507", src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_9496a29f.svg",} )
                  ]})
                })
              })
            ]})
            , _jsx('div', { className: "left-0 top-[28px] absolute text-center justify-start text-[#abb2bb] text-sm font-normal font-['FZLanTingYuan-R-GBK'] whitespace-nowrap"         , 'data-figma-id': "I152:6421;412:16044", children: "周一至周五 09:30~18:00" })
          ]})
        })
        , _jsx('img', { src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_5af15f6d.png", alt: "static layer" , className: "left-0 top-0 absolute object-cover"   , 'data-figma-id': "152:6422", style: { width: 375, height: 44 },} )
        , _jsx('img', { src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_f781f1fa.png", alt: "static layer" , className: "left-[20px] top-[44px] absolute object-cover"   , 'data-figma-id': "152:88506", style: { width: 335, height: 455 },} )
      ]})
      /* 顶部导航栏 - 固定在顶部 */
      , _jsx('div', { className: "absolute top-0 left-0 right-0 z-10 pointer-events-none"     , children: 
        _jsx('img', { src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_5af15f6d.png", alt: "顶部导航栏", className: "w-full object-cover" , style: { height: 44 },} )
      })
      /* 底部标签栏 - 固定在底部（吸底） */
      , _jsx('div', { className: "absolute bottom-0 left-0 right-0 z-10 pointer-events-none"     , children: 
        _jsx('img', { src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_eba70025.png", alt: "底部标签栏", className: "w-full object-cover" , style: { height: 90 },} )
      })
    ]})
  ]})
  );
}