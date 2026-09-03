import {jsxs as _jsxs, jsx as _jsx} from "/data/proj_1779608460378/preview-runtime/vendor/react-jsx-runtime.js";

export default function PadSquare(props) {
  // 项目级共享配置：运行时注入，不在 Props 接口中声明
  const {
    bigBannerForeground = '/data/proj_1779608460378/assets/images/a5b9ed28a447cc7ed5a5216a.png',
    bigBannerBackground = '/data/proj_1779608460378/assets/images/54ae7aef6bd771a728037113.png',
    miniBanners = [
      '/data/proj_1779608460378/assets/images/febf858c881f562d9f93760d.png',
      '/data/proj_1779608460378/assets/images/86d76ee04b2d6ec2e87907d0.png',
      '/data/proj_1779608460378/assets/images/473f0b45c9266c867cf9a942.png',
      '/data/proj_1779608460378/assets/images/61e147c8b72a4b2a0f96a1fa.png',
      '/data/proj_1779608460378/assets/images/65cc0cd1305c527ebac81d08.png',
    ],
  } = props ;

  return (
    _jsxs('div', {
      className: "w-[1024px] h-[768px] relative bg-white overflow-hidden"    ,
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

      /* 顶部状态栏 */
      , _jsx('img', {
        src: "/data/proj_1779608460378/assets/images/3a7203b9dc0c1c5dc9e6d327.png",
        alt: "status bar" ,
        className: "left-0 top-0 absolute object-cover max-w-none"    ,
        style: { width: 1023, height: 58 },}
      )

      /* 内容区域 */
      , _jsxs('div', { className: "w-[1023.10px] px-[36.15px] left-0 top-[57.84px] absolute inline-flex flex-col justify-start items-start gap-5"         , children: [

        /* 科目选择 - 参考设计图 */
        _jsx('img', {
          src: "/data/proj_1779608460378/assets/images/af164cffc0bf9f5f466c166f.png",
          alt: "subjects",
          className: "object-cover max-w-none" ,
          style: { width: 951, height: 54 },}
        )

        /* 大Banner - 使用项目级配置的前景图 */
        , _jsxs('div', { className: "w-[950px] h-[291.93px] shrink-0 relative overflow-hidden"    , children: [
          _jsx('div', { className: "w-[951.82px] h-[261.52px] left-[-1.22px] top-[30.41px] absolute bg-gradient-to-b from-[#ffd5ec] to-[#fceef6] rounded-3xl overflow-hidden"         , children: 
            _jsx('img', {
              className: "w-[948.78px] h-[265.17px] left-[1.22px] top-[-3.65px] absolute max-w-none"     ,
              src: bigBannerBackground ,
              alt: "banner-bg-deco",
              style: { width: 949, height: 265 },}
            )
          })
          , _jsx('img', {
            className: "w-[948.78px] h-[291.93px] left-[1.40px] top-[0.38px] absolute max-w-none"     ,
            src: bigBannerForeground,
            alt: "banner-fg",
            style: { width: 949, height: 292 },}
          )
        ]})

        /* 小Banner横滑区 - 由项目级 miniBanners 配置驱动 */
        , _jsx('div', { className: "shrink-0 inline-flex justify-start items-start gap-[14.91px] overflow-x-auto figma-scrollbar-hide"      , children: 
          (miniBanners ).map((url, i) => (
            _jsx('img', {

              src: url,
              alt: `mini-banner-${i + 1}`,
              className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
              style: { width: 220, height: 124 },}, i
            )
          ))
        })

        /* 底部课程卡片区 */
        , _jsx('img', {
          src: "/data/proj_1779608460378/assets/images/1a9aaecb82ead288ceaa6862.png",
          alt: "course-section",
          className: "relative object-cover max-w-none"  ,
          style: { width: 951, height: 228 },}
        )
      ]})

      /* 底部标签栏 */
      , _jsx('img', {
        src: "/data/proj_1779608460378/assets/images/e20570ef830d1ee4b1741b99.png",
        alt: "tabBar",
        className: "left-0 top-[706px] absolute object-cover max-w-none"    ,
        style: { width: 1024, height: 62 },}
      )
    ]})
  );
}