import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";






const features = [
  { icon: "zap", title: "极速响应", desc: "毫秒级响应速度，保证用户体验流畅无阻" },
  { icon: "shield", title: "安全可靠", desc: "多重加密防护，数据安全无忧" },
  { icon: "globe", title: "全球覆盖", desc: "遍布全球的节点网络，稳定可靠" },
  { icon: "cpu", title: "智能驱动", desc: "AI 驱动的智能决策，让效率翻倍" },
];

export default function ProductShowcase(props) {
  const {
    heroTitle,
    heroSubtitle,
    ctaLabel,
    featuresTitle,
  } = props;

  const p = props ;
  const brandName = (p.brandName ) || "星辰科技";
  const primaryColor = (p.primaryColor ) || "#4F46E5";
  const accentColor = (p.accentColor ) || "#F59E0B";
  const companySlogan = (p.companySlogan ) || "";
  const brandLogo = p.brandLogo ;

  return (
    _jsxs('div', { className: "min-h-screen bg-white" , children: [
      /* 导航栏 */
      _jsx('header', { className: "fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100"        , children: 
        _jsxs('div', { className: "max-w-6xl mx-auto px-6 h-16 flex items-center justify-between"      , children: [
          _jsxs('div', { className: "flex items-center gap-2"  , children: [
            brandLogo ? (
              _jsx('img', { src: brandLogo, alt: brandName, className: "h-8 w-8 rounded"  ,} )
            ) : (
              _jsx('div', {
                className: "h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"        ,
                style: { backgroundColor: primaryColor },
 children: 
                brandName.charAt(0)
              })
            )
            , _jsx('span', { className: "font-semibold text-gray-900" , children: brandName})
          ]})
          , _jsxs('nav', { className: "flex items-center gap-6 text-sm text-gray-600"    , children: [
            _jsx('a', { href: "#", className: "hover:text-gray-900 transition-colors" , children: "首页"})
            , _jsx('a', { href: "#", className: "hover:text-gray-900 transition-colors" , children: "产品"})
            , _jsx('a', { href: "#", className: "hover:text-gray-900 transition-colors" , children: "关于"})
          ]})
        ]})
      })

      /* Hero 区域 */
      , _jsxs('section', { className: "pt-32 pb-20 px-6 relative overflow-hidden"    , children: [
        _jsx('div', {
          className: "absolute inset-0 opacity-5"  ,
          style: {
            background: `radial-gradient(circle at 20% 50%, ${primaryColor} 0%, transparent 50%), radial-gradient(circle at 80% 50%, ${accentColor} 0%, transparent 50%)`,
          },}
        )
        , _jsxs('div', { className: "max-w-4xl mx-auto text-center relative"   , children: [
          companySlogan && (
            _jsx('span', {
              className: "inline-block text-xs font-medium px-4 py-1.5 rounded-full mb-6"      ,
              style: {
                backgroundColor: `${primaryColor}10`,
                color: primaryColor,
              },
 children: 
              companySlogan
            })
          )
          , _jsx('h1', { className: "text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6"      , children: 
            heroTitle
          })
          , _jsx('p', { className: "text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed"      , children: 
            heroSubtitle
          })
          , _jsx('button', {
            className: "text-white px-8 py-3.5 rounded-xl font-medium text-base shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"         ,
            style: { backgroundColor: primaryColor },
 children: 
            ctaLabel
          })
        ]})
      ]})

      /* 特色区域 */
      , _jsx('section', { className: "py-20 px-6 bg-gray-50"  , children: 
        _jsxs('div', { className: "max-w-6xl mx-auto" , children: [
          _jsx('h2', { className: "text-3xl md:text-4xl font-bold text-center text-gray-900 mb-4"     , children: 
            featuresTitle
          })
          , _jsx('p', { className: "text-gray-500 text-center mb-14 max-w-xl mx-auto"    , children: "全方位满足您的业务需求"

          })
          , _jsx('div', { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"    , children: 
            features.map((f, i) => (
              _jsxs('div', {

                className: "bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all"       ,
 children: [
                _jsx('div', {
                  className: "w-12 h-12 rounded-xl flex items-center justify-center mb-4"      ,
                  style: {
                    backgroundColor: `${primaryColor}10`,
                    color: primaryColor,
                  },
 children: 
                  _jsxs('svg', { className: "w-6 h-6" , fill: "none", viewBox: "0 0 24 24"   , stroke: "currentColor", strokeWidth: 1.5, children: [
                    f.icon === "zap" && (
                      _jsx('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"     ,} )
                    )
                    , f.icon === "shield" && (
                      _jsx('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"                       ,} )
                    )
                    , f.icon === "globe" && (
                      _jsx('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 9.749c0 2.523-.59 4.995-1.757 7.254m0 0A11.96 11.96 0 0112 21"                                                 ,} )
                    )
                    , f.icon === "cpu" && (
                      _jsx('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"                                    ,} )
                    )
                  ]})
                })
                , _jsx('h3', { className: "font-semibold text-gray-900 mb-2"  , children: f.title})
                , _jsx('p', { className: "text-sm text-gray-500 leading-relaxed"  , children: f.desc})
              ]}, i)
            ))
          })
        ]})
      })

      /* CTA 底部 */
      , _jsx('section', { className: "py-20 px-6" , children: 
        _jsxs('div', {
          className: "max-w-4xl mx-auto rounded-3xl p-12 md:p-16 text-center text-white"      ,
          style: { background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` },
 children: [
          _jsx('h2', { className: "text-3xl md:text-4xl font-bold mb-4"   , children: "准备好开始了吗？"})
          , _jsx('p', { className: "text-white/80 text-lg mb-8 max-w-lg mx-auto"    , children: "加入数千家信任我们的企业，开启智能转型之旅"

          })
          , _jsx('button', { className: "bg-white text-gray-900 px-8 py-3.5 rounded-xl font-medium hover:shadow-lg transition-all"       , children: "免费试用"

          })
        ]})
      })

      /* 页脚 */
      , _jsxs('footer', { className: "border-t border-gray-100 py-8 px-6 text-center text-sm text-gray-400"      , children: ["© 2026 "
          , brandName, ". All rights reserved."
      ]})
    ]})
  );
}
