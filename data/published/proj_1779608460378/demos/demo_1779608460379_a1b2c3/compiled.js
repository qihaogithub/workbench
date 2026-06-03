import {jsx as _jsx, jsxs as _jsxs} from 'https://esm.sh/react@18.3.1/jsx-runtime';import React from 'https://esm.sh/react@18.3.1';







const subjects = [
  { key: 'yuedu', label: '阅读', icon: 'https://r2-asset-worker.qihaogo.workers.dev/figma/h_a9956e79.png', bgClass: 'bg-[#fff2ea]', shadow: 'shadow-[inset_0px_-2px_4px_0px_rgba(255,237,224,1.00)]', textColor: 'text-[#6b2d03]' },
  { key: 'yizhi', label: '益智', icon: 'https://r2-asset-worker.qihaogo.workers.dev/figma/h_ac2976ba.png', bgClass: 'bg-[#eaf9ff]', shadow: 'shadow-[inset_0px_-2px_4px_0px_rgba(224,246,255,1.00)]', textColor: 'text-[#004161]' },
  { key: 'meiyu', label: '美育', icon: 'https://r2-asset-worker.qihaogo.workers.dev/figma/h_a1fb5f78.png', bgClass: 'bg-[#f9f5ff]', shadow: 'shadow-[inset_0px_-2px_4px_0px_rgba(243,235,255,1.00)]', textColor: 'text-[#452270]' },
  { key: 'xiezuo', label: '写作', icon: 'https://r2-asset-worker.qihaogo.workers.dev/figma/h_61d1c2e6.png', bgClass: 'bg-[#eefceb]', shadow: 'shadow-[inset_0px_-2px_4px_0px_rgba(229,250,224,1.00)]', textColor: 'text-[#0d5100]' },
  { key: 'yingyu', label: '英语', icon: 'https://r2-asset-worker.qihaogo.workers.dev/figma/h_47751410.png', bgClass: 'bg-[#fff0f3]', shadow: 'shadow-[inset_0px_-2px_4px_0px_rgba(255,229,235,1.00)]', textColor: 'text-[#770923]' },
  {
    key: 'qita',
    label: '其他',
    icon: null,
    bgClass: 'bg-[#fcf9de]',
    shadow: 'shadow-[inset_0px_-2px_4px_0px_rgba(250,246,204,1.00)]',
    textColor: 'text-[#770923]',
    customIcon: (
      _jsx('div', { className: "w-8 h-8 shrink-0 relative shadow-[0px_2.909090280532837px_5.818180561065674px_0px_rgba(245,149,36,0.50)] overflow-hidden"     , children: 
        _jsxs('div', { className: "origin-top-left rotate-[-6.77deg] w-[27.27px] h-[28.80px] left-[1.31px] top-[3.42px] absolute"      , children: [
          _jsx('div', { className: "w-[23.84px] h-[25.40px] left-[3.66px] top-[3.55px] absolute origin-top-left rotate-[6.77deg] opacity-40 bg-[#ffd637] blur-[2.07px]"         ,} )
          , _jsx('div', { className: "w-[23.84px] h-[25.40px] left-[2.97px] top-[2.86px] absolute origin-top-left rotate-[6.77deg] bg-[#ffd637]"       ,} )
          , _jsx('div', { className: "w-[4.26px] h-[3.05px] left-[12.60px] top-[16.90px] absolute bg-[#f2994b]"     ,} )
          , _jsx('div', { className: "w-[2.57px] h-1 left-[8.29px] top-[15.51px] absolute bg-[#b6774b]"     ,} )
          , _jsx('div', { className: "w-[2.57px] h-1 left-[18.50px] top-[14.30px] absolute bg-[#b6774b]"     ,} )
        ]})
      })
    ),
  },
];

export default function PhoneSquare(props) {
  const {
    bigBannerForeground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_前景图.png',
    bigBannerBackground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_背景图.png',
    miniBanners = [
      'https://r2-asset-worker.qihaogo.workers.dev/figma/h_afbdf012.png',
      'https://r2-asset-worker.qihaogo.workers.dev/figma/h_ea536e2d.png',
      'https://r2-asset-worker.qihaogo.workers.dev/figma/h_54877a4c.png',
      'https://r2-asset-worker.qihaogo.workers.dev/figma/h_762c6b71.png',
      'https://r2-asset-worker.qihaogo.workers.dev/figma/h_3be0b370.png',
      'https://r2-asset-worker.qihaogo.workers.dev/figma/h_f4868f75.png',
    ],
  } = props;

  return (
    _jsxs('div', {
      className: "w-[375px] h-[812px] relative bg-white overflow-hidden"    ,
      style: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
 children: [
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

      /* 主内容区 */
      , _jsxs('div', { className: "w-[375px] left-0 top-0 absolute bg-white inline-flex flex-col justify-center items-center overflow-hidden"         , children: [

        /* 顶部状态栏 */
        _jsx('img', {
          src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_d9e0a2b8.png",
          alt: "status bar" ,
          className: "object-cover max-w-none" ,
          style: { width: 375, height: 88 },}
        )

        /* 内容区域 */
        , _jsxs('div', { className: "self-stretch shrink-0 px-5 flex flex-col justify-start items-start"      , children: [

          /* 科目图标行 */
          _jsx('div', { className: "w-[335px] shrink-0 inline-flex justify-start items-center gap-[11px] overflow-x-auto overflow-y-hidden figma-scrollbar-hide"        , children: 
            subjects.map((s) => (
              _jsxs('div', {

                className: `w-[58.20px] shrink-0 pt-1 pb-2 ${s.bgClass} rounded-tl-xl rounded-tr-xl rounded-bl-xl rounded-br-3xl ${s.shadow} inline-flex flex-col justify-center items-center gap-0.5 overflow-hidden`,
 children: [
                s.customIcon || (
                  _jsx('img', { src: s.icon, alt: s.key, className: "object-cover max-w-none" , style: { width: 32, height: 32 },} )
                )
                , _jsx('div', { className: `shrink-0 text-center justify-start ${s.textColor} text-xs font-normal font-sans leading-[18px] whitespace-nowrap`, children: 
                  s.label
                })
              ]}, s.key)
            ))
          })

          /* 大Banner */
          , _jsxs('div', { className: "w-[335px] h-48 shrink-0 relative overflow-hidden"    , 'data-figma-id': "161:15396", children: [
            /* Banner背景渐变 */
            _jsx('div', { className: "w-[335px] h-[172px] left-0 top-[20px] absolute bg-gradient-to-b from-[#ffd5ec] to-[#fceef6] rounded-2xl overflow-hidden"         , children: 
              _jsx('img', {
                src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_ad3e8cc1.svg",
                className: "left-[-144.98px] top-[-1.25px] absolute w-[626px] h-[174px] max-w-none"     ,
                alt: "banner-bg-shape",}
              )
            })
            /* Banner前景装饰 */
            , _jsx('img', {
              src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_57ed088e.svg",
              className: "left-[-143.98px] top-[0.25px] absolute w-[624px] h-48 max-w-none"     ,
              alt: "banner-fg-shape",}
            )
            /* 可配置的大Banner前景图 */
            , _jsx('img', {
              src: bigBannerForeground,
              alt: "banner-fg",
              className: "absolute bottom-0 left-1/2 -translate-x-1/2 h-full object-contain z-10"      ,}
            )
          ]})

          /* 小Banner滚动区 - 添加 mt-5 与大Banner间隔20px */
          , _jsx('div', { className: "shrink-0 mt-5 inline-flex justify-start items-start gap-2 overflow-x-auto figma-scrollbar-hide"       , children: 
            miniBanners.map((url, i) => (
              _jsx('img', {

                src: url,
                alt: `mini-banner-${i + 1}`,
                className: "w-[162.50px] h-[92px] shrink-0 max-w-none"   ,
                style: { width: 163, height: 92 },}, i
              )
            ))
          })

          /* 免费试一试区域 */
          , _jsx('div', { className: "w-[335px] shrink-0 pt-6 flex flex-col justify-end items-start"      , children: 
            _jsxs('div', { className: "self-stretch shrink-0 px-1 inline-flex justify-between items-center"     , children: [
              _jsx('div', { className: "grow basis-0 min-w-0 justify-start text-[#3f3f3f] text-lg font-medium font-sans leading-[27px]"        , children: "免费试一试"

              })
              , _jsxs('div', { className: "h-6 shrink-0 pl-3 pr-1.5 rounded-[99px] outline outline-1 outline-offset-[-1px] outline-[#f4f3f3] flex justify-center items-center gap-0.5"            , children: [
                _jsx('div', { className: "shrink-0 text-right justify-start text-[#b2b2b2] text-sm font-normal font-sans leading-[30px] tracking-wider whitespace-nowrap"         , children: "K1学什么？"

                })
                , _jsx('img', {
                  src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_3a5cb93a.svg",
                  className: "relative w-[29.01px] h-4 shrink-0 origin-top-left -rotate-90 max-w-none"      ,
                  alt: "arrow",}
                )
              ]})
            ]})
          })

          /* 课程卡片 */
          , _jsx('img', {
            src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_f9228c0.png",
            alt: "course card" ,
            className: "object-cover max-w-none" ,
            style: { width: 335, height: 293 },}
          )
        ]})
      ]})

      /* 底部标签栏 */
      , _jsx('img', {
        src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_c4f6ba41.png",
        alt: "tabBar",
        className: "left-0 top-[722px] absolute object-cover max-w-none"    ,
        style: { width: 375, height: 90 },}
      )
    ]})
  );
}