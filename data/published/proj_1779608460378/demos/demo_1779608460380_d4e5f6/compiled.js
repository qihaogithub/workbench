import {jsxs as _jsxs, jsx as _jsx} from 'https://esm.sh/react@18.3.1/jsx-runtime';





const subjects = [
  { key: 'yuedu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/阅读.png', bgClass: 'bg-[#fff2ea]' },
  { key: 'yizhi', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/益智.png', bgClass: 'bg-[#eaf9ff]' },
  { key: 'meiyu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/美育.png', bgClass: 'bg-[#f9f5ff]' },
  { key: 'xiezuo', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/写作.png', bgClass: 'bg-[#eefceb]' },
  { key: 'yingyu', icon: 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/科目图标/英语.png', bgClass: 'bg-[#fff0f3]' },
];

export default function PadSquare(props) {
  const {
    bigBannerForeground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_前景图.png',
    bigBannerBackground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_背景图.png',
    miniBanners = [
      'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D01.png',
      'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D02.png',
      'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D05.png',
      'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D04.png',
      'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/小banner/Property%201%3D06.png',
    ],
  } = props;

  return (
    _jsxs('div', {
      className: "w-full min-h-screen bg-white flex flex-col overflow-hidden"     ,
      style: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: 768,
        margin: '0 auto',
      },
 children: [
      _jsx('style', { children: `
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `})

      /* 顶部状态栏和 Logo */
      , _jsxs('div', { className: "w-full flex-shrink-0" , children: [
        _jsx('img', {
          src: "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/状态栏_pad.png",
          alt: "status",
          className: "w-full h-auto" ,}
        )
        , _jsxs('div', { className: "flex items-center justify-between h-11 px-5"    , children: [
          _jsx('img', {
            className: "w-[154px] h-[30px]" ,
            src: "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/顶部/叫叫%20Logo%20-%20基础.png",
            alt: "Logo",}
          )
          , _jsx('img', {
            className: "h-[30px]",
            src: "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/顶部/扫一扫.png",
            alt: "扫一扫",}
          )
        ]})
      ]})

      /* 内容区 */
      , _jsxs('div', { className: "flex-1 flex flex-col items-center overflow-y-auto"    , children: [
        /* 科目图标 */
        _jsx('div', { className: "flex items-center justify-between px-10 gap-[11px] mt-4 w-full"      , children: 
          subjects.map((s) => (
            _jsx('div', {

              className: `${s.bgClass} flex items-center justify-center w-[58.2px] rounded-[12px_12px_24px_12px] py-1.5`,
 children: 
              _jsx('img', { src: s.icon, alt: s.key, className: "w-8 h-8" ,} )
            }, s.key)
          ))
        })

        /* 大Banner - 使用配置的图片原始尺寸 */
        , _jsx('div', { className: "w-full px-10 mt-4"  , children: 
          _jsxs('div', { className: "relative w-full overflow-hidden rounded-2xl"   , children: [
            /* 背景图 - 根据前景图比例自动适应 */
            _jsx('img', {
              className: "absolute w-full bottom-0 left-1/2 -translate-x-1/2 object-cover"     ,
              src: bigBannerBackground,
              alt: "banner-bg",
              style: { height: '89.583%' },}
            )
            /* 前景图 */
            , _jsx('img', {
              className: "relative w-full h-auto object-cover"   ,
              src: bigBannerForeground,
              alt: "banner-fg",}
            )
          ]})
        })

        /* 小Banner滚动区 */
        , _jsx('div', { className: "w-full pl-10 mt-5 overflow-x-auto hide-scrollbar"    , children: 
          _jsx('div', { className: "flex gap-2" , children: 
            miniBanners.map((url, i) => (
              _jsx('img', {

                src: url,
                alt: `mini-banner-${i + 1}`,
                className: "h-[137px] w-auto flex-shrink-0"  ,}, i
              )
            ))
          })
        })
      ]})

      /* 底部标签栏 */
      , _jsx('div', { className: "w-full flex-shrink-0" , children: 
        _jsx('img', {
          src: "https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/底部/底部标签栏_pad.png",
          alt: "tabBar",
          className: "w-full h-auto" ,}
        )
      })
    ]})
  );
}