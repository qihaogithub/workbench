import {jsxs as _jsxs, jsx as _jsx} from 'https://esm.sh/react@18.3.1/jsx-runtime';

export default function FullScreenImage(_props) {
  return (
    _jsxs('div', {
      className: "w-[375px] h-[812px] relative overflow-hidden"   ,
      style: { backgroundColor: '#000000' },
 children: [
      _jsx('img', {
        src: "/api/images/8a7a1155c9a7-image.png",
        alt: "全屏展示",
        className: "w-full h-full object-cover"  ,
        draggable: false,}
      )

      /* 大标题 */
      , _jsx('div', { className: "absolute inset-0 flex items-center justify-center pointer-events-none"     , children: 
        _jsx('h1', { className: "text-white text-3xl font-bold tracking-wider text-center px-8 drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"      , children: "精彩内容推荐"

        })
      })
    ]})
  );
}