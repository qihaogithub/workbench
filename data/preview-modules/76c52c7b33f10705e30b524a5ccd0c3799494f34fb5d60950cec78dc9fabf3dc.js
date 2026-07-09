import {jsxs as _jsxs, jsx as _jsx} from "http://10.130.33.131:3200/preview-runtime/vendor/react-jsx-runtime.js";

export default function Demo(_props) {
  return (
    _jsxs('div', { className: "w-[375px] min-h-[812px] bg-white relative overflow-hidden pb-16 font-sans"      , children: [
      /* 导航栏 */
      _jsxs('div', { className: "sticky top-0 z-50 backdrop-blur-[10px] bg-white/90"    , children: [
        _jsxs('div', { className: "h-11 flex items-center justify-between px-5"    , children: [
          _jsx('span', { className: "text-sm font-semibold" , children: "9:41"})
          , _jsxs('svg', { width: "67", height: "12", viewBox: "0 0 67 12"   , className: "fill-black", children: [_jsx('path', { d: "M61 2c.736 0 1.333.598 1.333 1.334v4.666c0 .736-.597 1.334-1.333 1.334H45.666a1.333 1.333 0 01-1.333-1.334V3.334A1.333 1.333 0 0145.666 2H61z"               ,}), _jsx('rect', { x: "1", y: "7", width: "2", height: "4", rx: ".5",}), _jsx('rect', { x: "5", y: "5", width: "2", height: "6", rx: ".5",}), _jsx('rect', { x: "10", y: "2.67", width: "2", height: "8", rx: ".5",}), _jsx('rect', { x: "15", y: ".34", width: "2", height: "10", rx: ".5",})]})
        ]})
        , _jsxs('div', { className: "h-11 flex items-center justify-center relative"    , children: [
          _jsx('button', { className: "absolute left-0 top-0 w-11 h-11 flex items-center justify-center"       , children: 
            _jsx('svg', { width: "24", height: "24", viewBox: "0 0 24 24"   , children: _jsx('path', { d: "M16.318 3.44a1.5 1.5 0 00-2.122 0L8.818 8.817a3.75 3.75 0 000 5.304l5.378 5.379a1.5 1.5 0 002.122-2.122l-5.379-5.378a.75.75 0 010-1.06l5.379-5.379a1.5 1.5 0 000-2.121z"                   , fill: "#404040",})})
          })
          , _jsx('span', { className: "text-lg font-medium text-black"  , children: "成长豆商城"})
          , _jsx('button', { className: "absolute right-0 top-0 w-11 h-11 flex items-center justify-center"       , children: 
            _jsxs('svg', { width: "24", height: "24", viewBox: "0 0 24 24"   , children: [_jsx('circle', { cx: "5", cy: "12", r: "1.5", fill: "black",}), _jsx('circle', { cx: "12", cy: "12", r: "1.5", fill: "black",}), _jsx('circle', { cx: "19", cy: "12", r: "1.5", fill: "black",})]})
          })
        ]})
      ]})

      /* 学豆余额 */
      , _jsxs('div', { className: "flex items-center justify-between py-2 px-5 mx-5 rounded-2xl"      , style: {background:'rgba(255,183,106,0.15)'}, children: [
        _jsxs('div', { className: "flex items-center gap-1.5"  , children: [
          _jsx('span', { className: "text-xs text-[#6B2D03]" , children: "当前成长豆"})
          , _jsx('svg', { width: "16", height: "17", viewBox: "0 0 16 17"   , children: _jsx('path', { d: "M2.93 10.94C.81 7.25 1.39 3.74 4.51 1.93l.16-.09c3.07-1.68 6.32-.4 8.4 3.22 2.12 3.69 1.54 7.2-1.58 9-3.12 1.81-6.44.56-8.56-3.13zM7.14 4.36c-.43-.1-.88.1-1 .46-.72 2-.04 2.85 1.9 3.53l.17.06c1.06.38 1.2.57.9 1.52-.12.36.14.72.57.82.44.1.88-.12 1-.48.55-1.76-.12-2.5-1.95-3.14l-.16-.06c-1.15-.41-1.3-.66-.87-1.87.13-.36-.12-.73-.55-.84z"                        , fill: "#FF9045",})})
          , _jsx('span', { className: "text-lg font-semibold text-[#FF9045]"  , style: {fontFamily:'Baloo'}, children: "3450"})
          , _jsx('span', { className: "text-[#FF9045] text-sm" , children: "›"})
        ]})
        , _jsx('button', { className: "w-6 h-6 rounded-full border border-[#ECCEAF] text-[#ECCEAF] text-sm flex items-center justify-center"         , children: "?"})
      ]})

      /* 金刚区 */
      , _jsxs('div', { className: "mt-3", children: [
        _jsx('div', { className: "flex gap-0 overflow-x-auto px-3 scrollbar-hide"    , children: 
          [
            '超值拼团','限时秒杀','热销新品','推荐有礼',
            '幸运抽奖','赚成长豆','周周分享','福利社区',
            '直播预约','许个愿望'
          ].map((name, i) => (
            _jsxs('div', { className: "flex-shrink-0 w-16 flex flex-col items-center gap-1 relative"      , children: [
              _jsx('div', { className: "w-10 h-10 rounded-xl bg-gray-100"   ,} )
              , _jsx('span', { className: "text-[11px] text-[#666] whitespace-nowrap"  , children: name})
              , i === 6 && (
                _jsx('span', { className: "absolute -top-0.5 right-0.5 bg-[#FCDA00] text-[9px] text-[#544300] px-1.5 rounded-lg"       , children: "上新"})
              )
            ]}, i)
          ))
        })
        , _jsx('div', { className: "flex justify-center mt-1"  , children: 
          _jsx('div', { className: "w-5 h-1 bg-[#FCDA00] rounded-sm"   ,} )
        })
      ]})

      /* 推荐区 */
      , _jsx('div', { className: "flex gap-2 px-5 py-3"   , children: 
        [
          {title:'超值拼团', tag:'拼团', price:'1800'},
          {title:'周三分享', tag:'每周特惠分享'},
          {title:'赚豆攻略', tag:'赚豆秘籍更新'},
        ].map((rec, i) => (
          _jsxs('div', { className: "flex-1 bg-[#F8F7F7] rounded-[10px] p-2 text-center shadow-[0_0_20px_rgba(0,0,0,0.03)]"     , children: [
            _jsx('div', { className: "text-sm font-medium text-[#404040] mb-2"   , children: rec.title})
            , _jsxs('div', { className: "flex flex-col items-center gap-1"   , children: [
              _jsx('div', { className: "w-11 h-11 rounded-lg bg-orange-100"   ,} )
              , _jsx('div', { className: "text-xs text-[#FF9045]" , children: rec.tag})
              , rec.price && _jsx('span', { className: "text-xs font-semibold text-[#FF9045]"  , style: {fontFamily:'Baloo'}, children: rec.price})
            ]})
          ]}, i)
        ))
      })

      /* 分类筛选 */
      , _jsxs('div', { className: "border-t border-[#E0DFDF] bg-white relative"   , children: [
        _jsx('div', { className: "flex gap-6 px-5 pt-2.5 pb-0.5 overflow-x-auto"     , children: 
          ['开学季','活动折扣','盲盒系列','叫叫周边','益智玩具'].map((cat, i) => (
            _jsx('span', { className: `text-base whitespace-nowrap pb-1 ${i===3?'text-[#404040] font-medium border-b-2 border-[#FCDA00]':'text-[#666]'}`, children: cat}, i)
          ))
        })
        , _jsx('div', { className: "flex gap-2 px-5 py-1.5 overflow-x-auto"    , children: 
          ['1-300','300-500','500-1000','1000-1500','1500+'].map((p, i) => (
            _jsx('span', { className: `px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${i===1?'bg-[#FCDA00] text-[#544300]':'border border-[#E0DFDF] text-[#666]'}`, children: p}, i)
          ))
        })
        , _jsx('button', { className: "absolute right-2.5 top-[13px] border-l border-black/[.08] bg-white px-2.5 h-[26px]"       , children: 
          _jsx('svg', { width: "16", height: "17", viewBox: "0 0 16 17"   , fill: "none", children: _jsx('path', { fillRule: "evenodd", clipRule: "evenodd", d: "M7.667 1.333A6.333 6.333 0 1013.6 12.592l1.88 1.88a.667.667 0 11-.943.943l-1.88-1.88a6.333 6.333 0 11-4.99-12.202zm-5 6.334a5 5 0 1110 0 5 5 0 01-10 0z"                     , fill: "#ACB2BB",})})
        })
      ]})

      /* 渐变背景 */
      , _jsx('div', { className: "h-3", style: {background:'linear-gradient(180deg, white 0%, #F5F5F5 100%)'},} )

      /* 商品列表 */
      , _jsxs('div', { className: "px-5 flex flex-col gap-2"   , children: [
        /* Row 1 */
        _jsxs('div', { className: "flex gap-1.5" , children: [
          _jsx(ProductCard, { name: "传统文化故事", price: "1020", sold: "已兑2.3万", color: "#f0e8d8",} )
          , _jsxs('div', { className: "flex-1 bg-[#FFF4ED] rounded-[10px] p-3.5 h-[238px] flex flex-col"      , style: {minHeight:238}, children: [
            _jsx('span', { className: "text-[10px] text-[#A66A29] bg-white border border-[#CDA285] rounded-[20px] px-2 py-0.5 inline-block w-fit mb-2"          , children: "最高得到10000成长豆"})
            , _jsx('span', { className: "text-[28px] font-extrabold text-[#FE9627] leading-tight"   , children: "活动标题"})
            , _jsx('span', { className: "text-xl font-extrabold text-[#99491B] leading-tight mb-2"    , children: "转让活动"})
            , _jsx('button', { className: "bg-[#FCDA00] rounded-[25px] py-1.5 px-[26px] text-base font-medium text-[#6B430B] w-fit mt-auto"        , children: "去看看"})
          ]})
        ]})

        /* Row 2 */
        , _jsxs('div', { className: "flex gap-1.5" , children: [
          _jsx(ProductCard, { name: "幼儿科学启蒙绘本", price: "320", oldPrice: "520", sold: "已兑2.3万", color: "#e8f0e0", tags: ['上新','首单特价'],} )
          , _jsx(ProductCard, { name: "叫叫画笔套装", price: "103", oldPrice: "20", sold: "已兑2.3万", color: "#f5e8dd", tags: ['上新','首单特价'],} )
        ]})

        /* 邀请好友横幅 */
        , _jsxs('div', { className: "bg-[#FFEDED] rounded-2xl py-4 px-5 text-center relative overflow-hidden"      , children: [
          _jsxs('div', { children: [
            _jsx('span', { className: "text-[#FE9627] text-lg font-extrabold"  , children: "邀请好友 " })
            , _jsx('span', { className: "text-[#99491B] text-lg font-extrabold"  , children: "得100豆"})
          ]})
          , _jsx('span', { className: "text-xs text-[#A66A29] bg-white border border-[#CDA285] rounded-full px-[11px] py-0.5 inline-block mt-1 tracking-[2px]"          , children: "最高得到10000成长豆"})
        ]})

        /* Row 3 */
        , _jsxs('div', { className: "flex gap-1.5" , children: [
          _jsx(ProductCard, { name: "职业大发现", price: "670", sold: "已兑2.3万", color: "#eae8f0", tags: ['上新'],} )
          , _jsx(ProductCard, { name: "商品名称", price: "210", sold: "已兑2.3万", color: "#f0e8e5", tags: ['上新'],} )
        ]})

        /* Row 4 */
        , _jsxs('div', { className: "flex gap-1.5" , children: [
          _jsx(ProductCard, { name: "情绪认知绘本", price: "210", oldPrice: "20", sold: "已兑2.3万", color: "#e8f0f0", tags: ['上新','首单特价'],} )
          , _jsx(ProductCard, { name: "商品名称", price: "103", sold: "已兑2.3万", color: "#f0eae0", tags: ['上新'], badge: "分享专区",} )
        ]})

        /* Row 5 */
        , _jsxs('div', { className: "flex gap-1.5" , children: [
          _jsx(ProductCard, { name: "传统文化故事", price: "1020", sold: "已兑2.3万", color: "#e0e8f5", tags: ['上新'],} )
          , _jsx(ProductCard, { name: "商品名称", price: "320", sold: "已兑2.3万", color: "#f5e8e0", tags: ['上新'],} )
        ]})

        /* Row 6 */
        , _jsxs('div', { className: "flex gap-1.5" , children: [
          _jsx(ProductCard, { name: "商品名称", price: "230", sold: "已兑2.3万", color: "#e8e8f0", tags: ['上新'], badge: "分享专区",} )
          , _jsx('div', { className: "flex-1",} )
        ]})
      ]})

      /* 购物车按钮 */
      , _jsx('div', { className: "fixed bottom-10 left-1/2 -translate-x-1/2 -ml-[140px] z-50"     , children: 
        _jsx('div', { className: "w-[50px] h-[50px] bg-white rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.08),0_4px_8px_rgba(0,0,0,0.12)] flex items-center justify-center cursor-pointer border-2 border-white"          , children: 
          _jsx('svg', { width: "24", height: "24", viewBox: "0 0 24 24"   , fill: "none", children: _jsx('path', { d: "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6zM3 6h18v14H3V6zm5 9a2 2 0 104 0 2 2 0 00-4 0z"                    , stroke: "#4E4639", strokeWidth: "2",})})
        })
      })
    ]})
  );
}

function ProductCard({name, price, oldPrice, sold, color, tags=[], badge}


) {
  return (
    _jsxs('div', { className: "flex-1 bg-white rounded-[10px] overflow-hidden relative"    , children: [
      badge && (
        _jsx('div', { className: "absolute top-0 right-2 bg-[#FF8031] text-white text-xs px-2 py-1 rounded-sm border-2 border-white z-10"           , children: badge})
      )
      , _jsx('div', { className: "w-full h-[169px]" , style: {background: color},} )
      , _jsxs('div', { className: "p-1.5", children: [
        _jsxs('div', { className: "flex items-center gap-1 mb-1"   , children: [
          tags.map((tag, i) => (
            _jsx('span', { className: `px-1 py-0.5 rounded text-[10px] text-white ${tag==='上新'?'bg-[#55CC3D]':''} ${tag==='首单特价'?'bg-[#ED704A]':''}`, children: tag}, i)
          ))
          , _jsx('span', { className: "text-sm font-medium text-[#666] truncate"   , children: name})
        ]})
        , _jsxs('div', { className: "flex items-center gap-1"  , children: [
          _jsxs('div', { className: "flex items-center gap-0.5"  , children: [
            _jsx('svg', { width: "16", height: "17", viewBox: "0 0 16 17"   , children: _jsx('path', { d: "M2.93 10.94C.81 7.25 1.39 3.74 4.51 1.93l.16-.09c3.07-1.68 6.32-.4 8.4 3.22 2.12 3.69 1.54 7.2-1.58 9-3.12 1.81-6.44.56-8.56-3.13zM7.14 4.36c-.43-.1-.88.1-1 .46-.72 2-.04 2.85 1.9 3.53l.17.06c1.06.38 1.2.57.9 1.52-.12.36.14.72.57.82.44.1.88-.12 1-.48.55-1.76-.12-2.5-1.95-3.14l-.16-.06c-1.15-.41-1.3-.66-.87-1.87.13-.36-.12-.73-.55-.84z"                        , fill: "#FF9045",})})
            , _jsx('span', { className: "text-lg font-semibold text-[#FF9045]"  , style: {fontFamily:'Baloo'}, children: price})
          ]})
          , oldPrice && _jsx('span', { className: "text-xs text-[#B2B2B2] line-through"  , children: oldPrice})
          , _jsx('span', { className: "text-xs text-[#B2B2B2] ml-auto"  , children: sold})
        ]})
      ]})
    ]})
  );
}
