import {jsxs as _jsxs, jsx as _jsx} from "http://0.0.0.0:3200/preview-runtime/vendor/react-jsx-runtime.js";







export default function ContactSection(props) {
  const {
    contactEmail,
    contactPhone,
    address,
    workingHours,
    showFooter,
  } = props;

  const p = props ;
  const brandName = (p.brandName ) || "星辰科技";
  const primaryColor = (p.primaryColor ) || "#4F46E5";
  const accentColor = (p.accentColor ) || "#F59E0B";
  const companySlogan = (p.companySlogan ) || "";
  const brandLogo = p.brandLogo ;

  const contactCards = [
    {
      icon: "mail",
      label: "电子邮箱",
      value: contactEmail,
      href: `mailto:${contactEmail}`,
      bgColor: `${primaryColor}08`,
      iconColor: primaryColor,
    },
    {
      icon: "phone",
      label: "联系电话",
      value: contactPhone,
      href: `tel:${contactPhone.replace(/-/g, "")}`,
      bgColor: `${accentColor}08`,
      iconColor: accentColor,
    },
    {
      icon: "map",
      label: "公司地址",
      value: address,
      href: "#",
      bgColor: "#ecfdf5",
      iconColor: "#10b981",
    },
    {
      icon: "clock",
      label: "工作时间",
      value: workingHours,
      href: "#",
      bgColor: "#f3e8ff",
      iconColor: "#8b5cf6",
    },
  ];

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
            , _jsx('a', { href: "#", style: { color: primaryColor }, className: "font-medium", children: "联系我们"})
          ]})
        ]})
      })

      /* 页面标题区 */
      , _jsxs('section', { className: "pt-32 pb-16 px-6 relative overflow-hidden"    , children: [
        _jsx('div', {
          className: "absolute inset-0 opacity-5"  ,
          style: {
            background: `radial-gradient(circle at 30% 40%, ${primaryColor} 0%, transparent 60%), radial-gradient(circle at 70% 60%, ${accentColor} 0%, transparent 50%)`,
          },}
        )
        , _jsxs('div', { className: "max-w-3xl mx-auto text-center relative"   , children: [
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
          , _jsx('h1', { className: "text-4xl md:text-5xl font-bold text-gray-900 mb-4"    , children: "联系我们"})
          , _jsx('p', { className: "text-lg text-gray-500 max-w-xl mx-auto"   , children: "无论您有任何问题或合作意向，我们都期待与您沟通"

          })
        ]})
      ]})

      /* 联系卡片网格 */
      , _jsx('section', { className: "pb-20 px-6" , children: 
        _jsx('div', { className: "max-w-5xl mx-auto" , children: 
          _jsx('div', { className: "grid grid-cols-1 md:grid-cols-2 gap-5"   , children: 
            contactCards.map((card, i) => (
              _jsx('a', {

                href: card.href,
                className: "rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all group"       ,
                style: { backgroundColor: card.bgColor },
 children: 
                _jsxs('div', { className: "flex items-start gap-4"  , children: [
                  _jsxs('div', {
                    className: "w-12 h-12 rounded-xl flex items-center justify-center shrink-0"      ,
                    style: { backgroundColor: `${card.iconColor}15`, color: card.iconColor },
 children: [
                    card.icon === "mail" && (
                      _jsx('svg', { className: "w-6 h-6" , fill: "none", viewBox: "0 0 24 24"   , stroke: "currentColor", strokeWidth: 1.5, children: 
                        _jsx('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"                               ,} )
                      })
                    )
                    , card.icon === "phone" && (
                      _jsx('svg', { className: "w-6 h-6" , fill: "none", viewBox: "0 0 24 24"   , stroke: "currentColor", strokeWidth: 1.5, children: 
                        _jsx('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"                     ,} )
                      })
                    )
                    , card.icon === "map" && (
                      _jsxs('svg', { className: "w-6 h-6" , fill: "none", viewBox: "0 0 24 24"   , stroke: "currentColor", strokeWidth: 1.5, children: [
                        _jsx('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"          ,} )
                        , _jsx('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"           ,} )
                      ]})
                    )
                    , card.icon === "clock" && (
                      _jsx('svg', { className: "w-6 h-6" , fill: "none", viewBox: "0 0 24 24"   , stroke: "currentColor", strokeWidth: 1.5, children: 
                        _jsx('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"           ,} )
                      })
                    )
                  ]})
                  , _jsxs('div', { className: "flex-1 min-w-0" , children: [
                    _jsx('p', { className: "text-sm font-medium text-gray-500 mb-0.5"   , children: card.label})
                    , _jsx('p', { className: "text-base font-semibold text-gray-900 group-hover:text-gray-900 transition-colors truncate"     , children: 
                      card.value
                    })
                  ]})
                  , _jsx('svg', { className: "w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0 mt-1"      , fill: "none", viewBox: "0 0 24 24"   , stroke: "currentColor", strokeWidth: 1.5, children: 
                    _jsx('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"     ,} )
                  })
                ]})
              }, i)
            ))
          })
        })
      })

      /* 联系表单区域 */
      , _jsx('section', { className: "pb-24 px-6" , children: 
        _jsx('div', { className: "max-w-5xl mx-auto" , children: 
          _jsx('div', {
            className: "rounded-3xl p-8 md:p-12"  ,
            style: { backgroundColor: `${primaryColor}04` },
 children: 
            _jsxs('div', { className: "max-w-xl mx-auto" , children: [
              _jsx('h2', { className: "text-2xl font-bold text-gray-900 mb-2 text-center"    , children: "发送消息"})
              , _jsx('p', { className: "text-gray-500 text-center mb-8 text-sm"   , children: "我们会在 24 小时内回复您"  })
              , _jsxs('div', { className: "space-y-4", children: [
                _jsxs('div', { className: "grid grid-cols-1 md:grid-cols-2 gap-4"   , children: [
                  _jsxs('div', { children: [
                    _jsx('label', { className: "block text-sm font-medium text-gray-700 mb-1"    , children: "姓名"})
                    , _jsx('input', {
                      type: "text",
                      placeholder: "您的姓名",
                      className: "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 text-sm"         ,
                      style: { focusRing: primaryColor },}
                    )
                  ]})
                  , _jsxs('div', { children: [
                    _jsx('label', { className: "block text-sm font-medium text-gray-700 mb-1"    , children: "邮箱"})
                    , _jsx('input', {
                      type: "email",
                      placeholder: "your@email.com",
                      className: "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 text-sm"         ,}
                    )
                  ]})
                ]})
                , _jsxs('div', { children: [
                  _jsx('label', { className: "block text-sm font-medium text-gray-700 mb-1"    , children: "主题"})
                  , _jsx('input', {
                    type: "text",
                    placeholder: "请选择主题",
                    className: "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 text-sm"         ,}
                  )
                ]})
                , _jsxs('div', { children: [
                  _jsx('label', { className: "block text-sm font-medium text-gray-700 mb-1"    , children: "消息"})
                  , _jsx('textarea', {
                    rows: 4,
                    placeholder: "请描述您的需求...",
                    className: "w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 text-sm resize-none"          ,}
                  )
                ]})
                , _jsx('button', {
                  className: "w-full text-white py-3 rounded-xl font-medium text-sm hover:shadow-lg transition-all"       ,
                  style: { backgroundColor: primaryColor },
 children: "发送消息"

                })
              ]})
            ]})
          })
        })
      })

      /* 页脚 */
      , showFooter && (
        _jsxs('footer', { className: "border-t border-gray-100 py-8 px-6 text-center text-sm text-gray-400"      , children: ["© 2026 "
            , brandName, ". All rights reserved."
        ]})
      )
    ]})
  );
}
