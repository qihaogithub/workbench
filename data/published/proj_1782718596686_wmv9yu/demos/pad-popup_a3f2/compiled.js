import {jsx as _jsx, jsxs as _jsxs} from "/data/proj_1782718596686_wmv9yu/preview-runtime/vendor/react-jsx-runtime.js";import { SvgaPlayer } from "/data/proj_1782718596686_wmv9yu/preview-runtime/vendor/preview-sdk.js";











const DEFAULT_MODAL_IMAGE = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/通用广告弹窗/默认弹窗.png';

function readString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function readMediaType(value) {
  return value === 'svga' ? 'svga' : 'image';
}


export default function PadPopup(props) {
  const config = props ;
  const modalImage = readString(config.modalImage, DEFAULT_MODAL_IMAGE);
  const mediaType = readMediaType(config.mediaType);
  const svgaSrc = readString(config.svgaSrc);
  const showSvga = mediaType === 'svga' && svgaSrc.length > 0;

  return (
    _jsx('div', {
      className: "fixed inset-0 z-50 flex items-center justify-center"     ,
      style: {
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
 children: 
      _jsxs('div', {
        className: "relative flex h-screen w-screen flex-col items-center justify-center"      ,
        style: {
          backgroundImage: 'url(/data/proj_1782718596686_wmv9yu/assets/images/0d1ebc4fadf43c911af54647.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        },
 children: [
        _jsx('div', { className: "absolute inset-0 bg-black/70"  ,} )

        , _jsx('div', { className: "relative z-10 w-full max-w-[26em] px-8"    , children: 
          _jsxs('div', { className: "relative", children: [
            _jsx('div', { className: "absolute z-20 cursor-pointer"  , style: { top: '-46px', right: 0 }, children: 
              _jsxs('svg', { width: "36", height: "36", viewBox: "0 0 42 42"   , fill: "none", children: [
                _jsx('rect', { width: "42", height: "42", fill: "black", fillOpacity: "0.01",} )
                , _jsx('circle', { cx: "21", cy: "21.0002", r: "18.0955", stroke: "white", strokeWidth: "1.26847", strokeLinecap: "round", strokeLinejoin: "round",} )
                , _jsx('path', { fillRule: "evenodd", clipRule: "evenodd", d: "M26.6199 17.5782C27.126 16.9651 27.0923 16.0559 26.5186 15.4822C25.9091 14.8727 24.9208 14.8727 24.3113 15.4822L21.0002 18.7933L17.6892 15.4822L17.5778 15.381C16.9647 14.8748 16.0555 14.9086 15.4819 15.4822C14.8723 16.0918 14.8723 17.08 15.4819 17.6896L18.7929 21.0006L15.482 24.3115L15.3808 24.4229C14.8746 25.036 14.9083 25.9452 15.482 26.5188C16.0916 27.1284 17.0798 27.1284 17.6893 26.5188L21.0002 23.2079L24.3111 26.5188L24.4225 26.6201C25.0356 27.1263 25.9448 27.0925 26.5185 26.5188C27.128 25.9093 27.128 24.9211 26.5185 24.3115L23.2076 21.0006L26.5186 17.6896L26.6199 17.5782Z"                                                     , fill: "white",} )
              ]})
            })

            , showSvga ? (
              _jsx(SvgaPlayer, {
                src: svgaSrc,
                className: "block w-full" ,
                style: { aspectRatio: '670 / 780' },}
              )
            ) : (
              _jsx('img', { src: modalImage, alt: "popup", className: "block h-auto w-full"  ,} )
            )
          ]})
        })
      ]})
    })
  );
}
