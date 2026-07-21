import {jsxs as _jsxs, jsx as _jsx} from "http://10.131.75.39:3200/preview-runtime/vendor/react-jsx-runtime.js";

export default function PadSquare(_props) {
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
        src: "../../assets/images/3a7203b9dc0c-pad-status-bar.png",
        alt: "status bar" ,
        className: "left-0 top-0 absolute object-cover max-w-none"    ,
        style: { width: 1023, height: 58 },}
      )

      /* 内容区域 */
      , _jsxs('div', { className: "w-[1023.10px] px-[36.15px] left-0 top-[57.84px] absolute inline-flex flex-col justify-start items-start gap-5"         , children: [

        /* 科目选择 */
        _jsx('img', {
          src: "../../assets/images/af164cffc0bf-pad-subjects.png",
          alt: "subjects",
          className: "object-cover max-w-none" ,
          style: { width: 951, height: 54 },}
        )

        /* 大Banner */
        , _jsxs('div', { className: "w-[950px] h-[291.93px] shrink-0 relative overflow-hidden"    , children: [
          _jsx('div', { className: "w-[951.82px] h-[261.52px] left-[-1.22px] top-[30.41px] absolute bg-gradient-to-b from-[#ffd5ec] to-[#fceef6] rounded-3xl overflow-hidden"         , children: 
            _jsx('img', {
              className: "w-[948.78px] h-[265.17px] left-[1.22px] top-[-3.65px] absolute max-w-none"     ,
              src: "../../assets/images/32412ce0f5d3-pad-banner-bg.png",
              alt: "banner-bg-deco",
              style: { width: 949, height: 265 },}
            )
          })
          , _jsx('img', {
            className: "w-[948.78px] h-[291.93px] left-[1.40px] top-[0.38px] absolute max-w-none"     ,
            src: "../../assets/images/a5b9ed28a447-big-banner-fg.png",
            alt: "banner-fg",
            style: { width: 949, height: 292 },}
          )
        ]})

        /* 横滑课程卡片 */
        , _jsxs('div', { className: "shrink-0 inline-flex justify-start items-start gap-[14.91px] overflow-x-auto figma-scrollbar-hide"      , children: [
          _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "../../assets/images/69f2b94bee11-pad-course-card-1.png",
            alt: "course-card-1",
            style: { width: 220, height: 124 },}
          )
          , _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "../../assets/images/cfd18e3e1c64-pad-course-card-2.png",
            alt: "course-card-2",
            style: { width: 220, height: 124 },}
          )
          , _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "../../assets/images/afa710b1131a-pad-course-card-3.png",
            alt: "course-card-3",
            style: { width: 220, height: 124 },}
          )
          , _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "../../assets/images/ca8ad9af20db-pad-course-card-4.png",
            alt: "course-card-4",
            style: { width: 220, height: 124 },}
          )
          , _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "../../assets/images/5569826aad99-pad-course-card-5.png",
            alt: "course-card-5",
            style: { width: 220, height: 124 },}
          )
        ]})

        /* 底部课程卡片区 */
        , _jsx('img', {
          src: "../../assets/images/1a9aaecb82ea-pad-bottom-course.png",
          alt: "course-section",
          className: "relative object-cover max-w-none"  ,
          style: { width: 951, height: 228 },}
        )
      ]})

      /* 底部标签栏 */
      , _jsx('img', {
        src: "../../assets/images/e20570ef830d-pad-tab-bar.png",
        alt: "tabBar",
        className: "left-0 top-[706px] absolute object-cover max-w-none"    ,
        style: { width: 1024, height: 62 },}
      )
    ]})
  );
}