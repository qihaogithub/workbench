import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";import { useState, useCallback } from "http://localhost:3200/preview-runtime/vendor/react.js";





const IMAGE_CONSTRAINTS = {
  width: 670,
  minHeight: 670,
  maxHeight: 890,
} ;

export default function PhonePopup(props) {
  const { modalImage = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/通用广告弹窗/默认弹窗.png' } = props;
  const [sizeWarning, setSizeWarning] = useState(null);

  const handleImageLoad = useCallback((e) => {
    const img = e.currentTarget;
    const { naturalWidth: w, naturalHeight: h } = img;

    const violations = [];
    if (w !== IMAGE_CONSTRAINTS.width) {
      violations.push(`宽度应为 ${IMAGE_CONSTRAINTS.width}px，当前为 ${w}px`);
    }
    if (h < IMAGE_CONSTRAINTS.minHeight) {
      violations.push(`高度至少 ${IMAGE_CONSTRAINTS.minHeight}px，当前为 ${h}px`);
    }
    if (h > IMAGE_CONSTRAINTS.maxHeight) {
      violations.push(`高度最多 ${IMAGE_CONSTRAINTS.maxHeight}px，当前为 ${h}px`);
    }

    setSizeWarning(violations.length > 0 ? violations.join('；') : null);
  }, []);

  return (
    _jsxs('div', {
      className: "fixed inset-0 z-50 flex flex-col"    ,
      style: {
        backgroundImage: `url(https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E9%80%9A%E7%94%A8%E5%B9%BF%E5%91%8A%E5%BC%B9%E7%AA%97/%E5%B9%BF%E5%9C%BA%E9%A1%B5phone.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
 children: [
      /* 半透明遮罩 — 让背景图隐约可见 */
      _jsx('div', { className: "absolute inset-0 bg-black/70"  ,} )

      /* 内容区域 — 垂直居中显示 */
      , _jsx('div', { className: "relative z-10 flex-1 flex items-center justify-center px-4"      , children: 
        _jsxs('div', { className: "relative inline-block max-w-xs w-full"   , children: [
          /* 关闭按钮 — 在弹窗右上角上方10px处，不重叠 */
          _jsx('div', { className: "absolute z-20 cursor-pointer"  , style: { top: '-46px', right: 0 }, children: 
            _jsxs('svg', { width: "36", height: "36", viewBox: "0 0 42 42"   , fill: "none", children: [
              _jsx('rect', { width: "42", height: "42", fill: "black", fillOpacity: "0.01",} )
              , _jsx('circle', {
                cx: "21",
                cy: "21.0002",
                r: "18.0955",
                stroke: "white",
                strokeWidth: "1.26847",
                strokeLinecap: "round",
                strokeLinejoin: "round",}
              )
              , _jsx('path', {
                fillRule: "evenodd",
                clipRule: "evenodd",
                d: "M26.6199 17.5782C27.126 16.9651 27.0923 16.0559 26.5186 15.4822C25.9091 14.8727 24.9208 14.8727 24.3113 15.4822L21.0002 18.7933L17.6892 15.4822L17.5778 15.381C16.9647 14.8748 16.0555 14.9086 15.4819 15.4822C14.8723 16.0918 14.8723 17.08 15.4819 17.6896L18.7929 21.0006L15.482 24.3115L15.3808 24.4229C14.8746 25.036 14.9083 25.9452 15.482 26.5188C16.0916 27.1284 17.0798 27.1284 17.6893 26.5188L21.0002 23.2079L24.3111 26.5188L24.4225 26.6201C25.0356 27.1263 25.9448 27.0925 26.5185 26.5188C27.128 25.9093 27.128 24.9211 26.5185 24.3115L23.2076 21.0006L26.5186 17.6896L26.6199 17.5782Z"                                                     ,
                fill: "white",}
              )
            ]})
          })

          , _jsx('img', {
            src: modalImage,
            alt: "popup",
            className: "w-full h-auto block rounded-lg"   ,
            onLoad: handleImageLoad,}
          )

          /* 尺寸校验警告 */
          , sizeWarning && (
            _jsxs('div', {
              className: "absolute bottom-0 left-0 right-0 text-center text-xs py-1 px-2 rounded-b"        ,
              style: { backgroundColor: 'rgba(255, 200, 0, 0.9)', color: '#333' },
 children: ["⚠ "
               , sizeWarning
            ]})
          )
        ]})
      })
    ]})
  );
}