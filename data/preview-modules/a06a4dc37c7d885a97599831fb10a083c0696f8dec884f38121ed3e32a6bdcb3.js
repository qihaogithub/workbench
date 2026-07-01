import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";






const phoneAssetBase = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/伴读/轮播广告/手机';

export default function PhoneBanduAd({
  phoneSingleAdImage = `${phoneAssetBase}/一行一个广告图.png`,
  carouselAdImage = `${phoneAssetBase}/广告图.png`,
}) {
  return (
    _jsxs('div', {
      className: "relative mx-auto overflow-hidden bg-white"   ,
      style: { width: 375, maxWidth: '100%', height: '100vh', minHeight: 812 },
 children: [
      _jsx('img', {
        src: `${phoneAssetBase}/底部吸顶内容.png`,
        alt: "顶部吸顶内容",
        className: "absolute left-0 top-0 z-20 w-[375px]"    ,}
      )

      , _jsxs('div', { className: "absolute left-0 top-[141px] flex h-[585px] w-[375px] flex-col items-center overflow-x-hidden overflow-y-auto bg-white"          , children: [
        _jsxs('div', { className: "flex flex-col items-center"  , children: [
          _jsx('img', { src: `${phoneAssetBase}/重磅更新标题.png`, alt: "重磅更新", className: "w-[344px]",} )
          , _jsx('img', { src: phoneSingleAdImage, alt: "手机广告图", className: "h-[180px] w-[344px] object-cover"  ,} )
          , _jsx('img', { src: `${phoneAssetBase}/叫叫活动标题.png`, alt: "叫叫活动", className: "w-[344px]",} )
        ]})

        , _jsx('div', { className: "h-[180px] w-[344px] shrink-0 overflow-hidden rounded-[10px] bg-[#d9d9d9]"     , children: 
          _jsx('img', { src: carouselAdImage, alt: "轮播广告图", className: "h-full w-full object-cover"  ,} )
        })

        , _jsx('img', { src: `${phoneAssetBase}/下.png`, alt: "底部内容", className: "w-[375px] shrink-0" ,} )
      ]})

      , _jsx('img', {
        src: `${phoneAssetBase}/吸底标签栏.png`,
        alt: "底部标签栏",
        className: "absolute bottom-0 left-0 z-20 h-[86px] w-[375px]"     ,}
      )
    ]})
  );
}