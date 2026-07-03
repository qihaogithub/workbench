import {jsx as _jsx, jsxs as _jsxs} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js"; function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }import React from "http://localhost:3200/preview-runtime/vendor/react.js";






































const DEFAULT_MODAL_IMAGE = 'https://uiweb.oss-cn-chengdu.aliyuncs.com/img/通用广告弹窗/默认弹窗.png';
const SVGA_SCRIPT_ID = '__opencode_svga_player_web__';
const SVGA_SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/svgaplayerweb@2.3.1/build/svga.min.js';

function readString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function readMediaType(value) {
  return value === 'svga' ? 'svga' : 'image';
}

function loadSvgaApi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('SVGA 只能在浏览器环境加载'));
  }
  if (window.SVGA) return Promise.resolve(window.SVGA);
  if (window.__opencodeSvgaPlayerPromise) return window.__opencodeSvgaPlayerPromise;

  window.__opencodeSvgaPlayerPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SVGA_SCRIPT_ID) ;
    const resolveWhenReady = () => {
      if (window.SVGA) resolve(window.SVGA);
      else reject(new Error('SVGA 播放器加载失败'));
    };

    if (existing) {
      existing.addEventListener('load', resolveWhenReady, { once: true });
      existing.addEventListener('error', () => reject(new Error('SVGA 播放器加载失败')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SVGA_SCRIPT_ID;
    script.src = SVGA_SCRIPT_SRC;
    script.async = true;
    script.onload = resolveWhenReady;
    script.onerror = () => reject(new Error('SVGA 播放器加载失败'));
    document.body.appendChild(script);
  });

  return window.__opencodeSvgaPlayerPromise;
}

function useSvgaPlayer(mediaType, svgaSrc) {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (mediaType !== 'svga' || !svgaSrc) return;

    let disposed = false;
    let player = null;

    loadSvgaApi()
      .then((SVGA) => {
        const container = containerRef.current;
        if (disposed || !container) return;

        container.innerHTML = '';
        player = new SVGA.Player(container);
        player.loops = 0;
        _optionalChain([player, 'access', _ => _.setContentMode, 'optionalCall', _2 => _2('AspectFit')]);

        const parser = new SVGA.Parser();
        parser.load(
          svgaSrc,
          (videoItem) => {
            if (disposed || !player) return;
            player.setVideoItem(videoItem);
            player.startAnimation();
          },
          () => undefined,
        );
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      if (player) {
        player.stopAnimation();
        _optionalChain([player, 'access', _3 => _3.clear, 'optionalCall', _4 => _4()]);
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [mediaType, svgaSrc]);

  return containerRef;
}


export default function PadPopup(props) {
  const config = props ;
  const modalImage = readString(config.modalImage, DEFAULT_MODAL_IMAGE);
  const mediaType = readMediaType(config.mediaType);
  const svgaSrc = readString(config.svgaSrc);
  const svgaContainerRef = useSvgaPlayer(mediaType, svgaSrc);
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
          backgroundImage: 'url(https://uiweb.oss-cn-chengdu.aliyuncs.com/img/%E9%80%9A%E7%94%A8%E5%B9%BF%E5%91%8A%E5%BC%B9%E7%AA%97/%E9%A6%96%E9%A1%B5-pad.webp)',
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

            , showSvga ? (
              _jsx('div', {
                ref: svgaContainerRef,
                className: "block w-full overflow-hidden"  ,
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
