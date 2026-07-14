import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";import { Icon } from "http://localhost:3200/preview-runtime/vendor/preview-sdk.js";



export default function Demo(_props) {
  return (
    _jsxs('div', { className: "max-w-[375px] mx-auto min-h-screen bg-white relative pb-[72px] shadow-[0_0_20px_rgba(0,0,0,0.05)] font-sans"       , children: [
      /* 头部 */
      _jsxs('div', { className: "flex flex-col items-center px-5 pt-10 pb-6 bg-gradient-to-b from-[#667eea] to-[#764ba2] text-white rounded-b-[28px]"          , children: [
        _jsx('div', { className: "w-20 h-20 rounded-full border-3 border-white/60 overflow-hidden mb-3 bg-[#e8e8ed]"       , children: 
          _jsx('div', { className: "w-full h-full flex items-center justify-center text-3xl"     , children: "👤"})
        })
        , _jsx('h1', { className: "text-[22px] font-bold mb-1"  , children: "小林同学"})
        , _jsx('p', { className: "text-sm opacity-85" , children: "前端开发者 · 摄影爱好者 · 猫奴"    })
      ]})

      /* 统计卡片 */
      , _jsx('div', { className: "flex justify-around px-4 py-5 bg-white mx-4 -mt-4 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.06)] relative z-10"          , children: 
        [
          { num: "128", label: "动态" },
          { num: "1.2k", label: "粉丝" },
          { num: "68", label: "关注" },
        ].map((item) => (
          _jsxs('div', { className: "flex flex-col items-center gap-0.5"   , children: [
            _jsx('span', { className: "text-xl font-bold text-[#1d1d1f]"  , children: item.num})
            , _jsx('span', { className: "text-xs text-[#86868b]" , children: item.label})
          ]}, item.label)
        ))
      })

      /* 菜单网格 */
      , _jsx('div', { className: "grid grid-cols-3 gap-3 px-4 pt-6 pb-2"     , children: 
        [
          { icon: "image", label: "相册" },
          { icon: "file-text", label: "文章" },
          { icon: "video", label: "视频" },
          { icon: "heart", label: "收藏" },
          { icon: "tag", label: "标签" },
          { icon: "settings", label: "更多" },
        ].map((item) => (
          _jsxs('div', {

            className: "flex flex-col items-center gap-2 py-4 bg-[#f9f9fb] rounded-xl cursor-pointer hover:bg-[#f0f0f5] hover:-translate-y-0.5 transition-all duration-150"           ,
 children: [
            _jsx(Icon, { name: item.icon, className: "w-7 h-7 text-[#515154]"  ,} )
            , _jsx('span', { className: "text-xs text-[#515154]" , children: item.label})
          ]}, item.label)
        ))
      })

      /* 最近动态 */
      , _jsx('div', { className: "px-4 pt-5 pb-3"  , children: 
        _jsx('h2', { className: "text-base font-semibold text-[#1d1d1f]"  , children: "最近动态"})
      })

      , _jsx('div', { className: "flex flex-col px-4"  , children: 
        [
          { emoji: "👤", text: "周末去爬山了，山顶的风景真的超级棒！🏔️", time: "2 小时前" },
          { emoji: "📸", text: "分享一组街拍作品，阳光洒在老城区的巷子里...", time: "昨天" },
          { emoji: "🐱", text: "我家猫又学会了新技能——开冰箱门😂", time: "3 天前" },
        ].map((item, i) => (
          _jsxs('div', {

            className: "flex gap-3 py-3.5 border-b border-[#f0f0f2] last:border-b-0"     ,
 children: [
            _jsx('div', { className: "flex-shrink-0 w-10 h-10 rounded-xl bg-[#e8e8ed] flex items-center justify-center text-xl"        , children: 
              item.emoji
            })
            , _jsxs('div', { className: "flex-1 min-w-0" , children: [
              _jsx('p', { className: "text-sm leading-[1.5] text-[#1d1d1f] mb-1"   , children: item.text})
              , _jsx('span', { className: "text-xs text-[#86868b]" , children: item.time})
            ]})
          ]}, i)
        ))
      })

      /* 底部导航 */
      , _jsx('div', { className: "fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[375px] flex justify-around items-center py-2 pb-[max(8px,env(safe-area-inset-bottom))] bg-white/92 backdrop-blur-[12px] border-t border-[#f0f0f2] z-50"               , children: 
        [
          { icon: "home", label: "首页", active: true },
          { icon: "search", label: "发现" },
          { icon: "plus", label: "发布" },
          { icon: "bell", label: "消息" },
          { icon: "user", label: "我的" },
        ].map((item) => (
          _jsxs('div', {

            className: "flex flex-col items-center gap-0.5 cursor-pointer px-3 py-1"      ,
 children: [
            _jsx(Icon, { name: item.icon, className: `w-5 h-5 ${item.active ? "text-[#667eea]" : "text-[#86868b]"}`,} )
            , _jsx('span', { className: `text-[10px] ${item.active ? "text-[#667eea] font-semibold" : "text-[#86868b]"}`, children: 
              item.label
            })
          ]}, item.label)
        ))
      })
    ]})
  );
}