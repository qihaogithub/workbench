import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";



export default function PadSquare(props) {
  const {
    bigBannerForeground = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/广场页/大banner/banner_前景图.png',
  } = props;

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
        src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_569f7368.png",
        alt: "status bar" ,
        className: "left-0 top-0 absolute object-cover max-w-none"    ,
        style: { width: 1023, height: 58 },}
      )

      /* 内容区域 */
      , _jsxs('div', { className: "w-[1023.10px] px-[36.15px] left-0 top-[57.84px] absolute inline-flex flex-col justify-start items-start gap-5"         , children: [

        /* 科目选择 - 参考设计图 */
        _jsx('img', {
          src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_b2570ead.png",
          alt: "subjects",
          className: "object-cover max-w-none" ,
          style: { width: 951, height: 54 },}
        )

        /* 大Banner - 使用项目级配置的前景图 */
        , _jsxs('div', { className: "w-[950px] h-[291.93px] shrink-0 relative overflow-hidden"    , children: [
          _jsx('div', { className: "w-[951.82px] h-[261.52px] left-[-1.22px] top-[30.41px] absolute bg-gradient-to-b from-[#ffd5ec] to-[#fceef6] rounded-3xl overflow-hidden"         , children: 
            _jsx('img', {
              className: "w-[948.78px] h-[265.17px] left-[1.22px] top-[-3.65px] absolute max-w-none"     ,
              src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_df5192e8.png",
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

        /* 横滑领课卡片 - 6张课程卡片 */
        , _jsxs('div', { className: "shrink-0 inline-flex justify-start items-start gap-[14.91px] overflow-x-auto figma-scrollbar-hide"      , children: [
          _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_526b8a8b.png",
            alt: "course-card-1",
            style: { width: 220, height: 124 },}
          )
          , _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_71cc80a5.png",
            alt: "course-card-2",
            style: { width: 220, height: 124 },}
          )
          , _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_b9ff3ad5.png",
            alt: "course-card-3",
            style: { width: 220, height: 124 },}
          )
          , _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_c7fa7da1.png",
            alt: "course-card-4",
            style: { width: 220, height: 124 },}
          )
          , _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_744e2e57.png",
            alt: "course-card-5",
            style: { width: 220, height: 124 },}
          )
          , _jsx('img', {
            className: "w-[219.62px] h-[123.54px] shrink-0 max-w-none"   ,
            src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_8946e15c.png",
            alt: "course-card-6",
            style: { width: 220, height: 124 },}
          )
        ]})

        /* 底部课程卡片区 */
        , _jsx('img', {
          src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_c925e908.png",
          alt: "course-section",
          className: "relative object-cover max-w-none"  ,
          style: { width: 951, height: 228 },}
        )
      ]})

      /* 底部标签栏 */
      , _jsx('img', {
        src: "https://r2-asset-worker.qihaogo.workers.dev/figma/h_ccadf0df.png",
        alt: "tabBar",
        className: "left-0 top-[706px] absolute object-cover max-w-none"    ,
        style: { width: 1024, height: 62 },}
      )
    ]})
  );
}