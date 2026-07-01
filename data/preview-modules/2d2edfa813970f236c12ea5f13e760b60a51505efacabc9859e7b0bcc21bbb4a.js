import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";



export default function Demo(_props) {
  const accent = "rose";
  const accentMap = {
    rose: { bg: "from-[#ffe2e8] via-[#fff5f1] to-[#ffd074]", ink: "#7f1d1d", pill: "#ef4444", soft: "#fff1f2" },
  };
  const theme = accentMap[accent];

  return (
    _jsxs('div', { className: "min-h-screen relative bg-gradient-to-br"  , style: { backgroundImage: `linear-gradient(to bottom right, ${theme.bg})` }, children: [
            /* StatusBar */
            _jsxs('div', { className: "flex h-9 items-center justify-between px-5 text-[11px] font-semibold text-black/70"       , children: [
              _jsx('span', { children: "9:41"})
              , _jsxs('div', { className: "flex items-center gap-1"  , children: [
                _jsx('span', { className: "h-2 w-3 rounded-[2px] border border-black/50"    ,} )
                , _jsx('span', { className: "h-2 w-3 rounded-[2px] bg-black/60"   ,} )
                , _jsx('span', { className: "h-2 w-5 rounded-[3px] border border-black/50"    , children: 
                  _jsx('span', { className: "block h-full w-4 rounded-[2px] bg-black/60"    ,} )
                })
              ]})
            ]})

            /* Header */
            , _jsxs('header', { className: "flex items-center justify-between px-5 py-2"    , children: [
              _jsx('button', { className: "grid h-8 w-8 place-items-center rounded-full bg-white/70 text-sm font-bold text-black/70 shadow-sm"         , children: "‹"})
              , _jsxs('div', { className: "text-center", children: [
                _jsx('p', { className: "text-[11px] font-medium text-black/45"  , children: "连续闯关解锁口语练习"})
                , _jsx('h2', { className: "text-sm font-bold" , style: { color: theme.ink }, children: "5天英语表达体验包"})
              ]})
              , _jsx('button', { className: "grid h-8 w-8 place-items-center rounded-full bg-white/70 text-sm font-bold text-black/70 shadow-sm"         , children: "···"})
            ]})

            /* Reward Content */
            , _jsx('div', { className: "px-6 pt-8" , children: 
              _jsxs('div', { className: "rounded-[28px] bg-black/55 p-5 text-center text-white shadow-xl backdrop-blur"      , children: [
                /* Mascot */
                _jsxs('div', { className: "relative mx-auto h-28 w-28"   , children: [
                  _jsx('div', { className: "absolute inset-2 rounded-[32px] bg-white/85 shadow-lg ring-1 ring-black/10"      ,} )
                  , _jsx('div', { className: "absolute left-8 top-8 h-4 w-4 rounded-full bg-black/70"      ,} )
                  , _jsx('div', { className: "absolute right-8 top-8 h-4 w-4 rounded-full bg-black/70"      ,} )
                  , _jsx('div', { className: "absolute left-1/2 top-[58px] h-5 w-10 -translate-x-1/2 rounded-b-full border-b-4 border-black/50"        ,} )
                  , _jsx('div', { className: "absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#ef4444] px-3 py-1 text-[10px] font-bold text-white shadow"           , children: "OU"})
                ]})
                , _jsx('h2', { className: "mt-3 text-2xl font-black leading-tight"   , children: "5天英语表达体验包"})
                , _jsx('p', { className: "mt-2 text-sm text-white/80"  , children: "连续闯关解锁口语练习"})
                , _jsxs('div', { className: "mt-5 rounded-[20px] bg-white p-4 text-left text-[#111827]"     , children: [
                  _jsx('p', { className: "text-xs font-semibold text-[#ef4444]"  , children: "体验包权益"})
                  , _jsx('div', { className: "mt-3 grid grid-cols-3 gap-2 text-center text-[11px]"     , children: 
                    ["每日表达", "AI纠音", "闯关奖励"].map((item) => (
                      _jsx('span', { className: "rounded-xl bg-[#fff1f2] p-2 font-semibold"   , children: item}, item)
                    ))
                  })
                  , _jsx('div', { className: "mt-4", children: 
                    _jsx('button', {
                      className: "h-11 w-full rounded-full bg-[#ef4444] px-5 text-sm font-bold text-white shadow-sm transition hover:brightness-95"          ,
 children: "立即领取"

                    })
                  })
                ]})
              ]})
            })

            /* Bottom Tabs */
            , _jsx('nav', { className: "absolute bottom-0 left-0 right-0 grid grid-cols-4 border-t border-black/5 bg-white/95 px-4 py-2 text-center text-[10px] text-[#6b7280]"             , children: 
              ["首页", "任务", "作品", "我的"].map((item, index) => (
                _jsxs('div', { className: index === 1 ? "font-bold" : "", style: { color: index === 1 ? theme.pill : undefined }, children: [
                  _jsx('span', { className: "mx-auto mb-1 block h-5 w-5 rounded-md bg-black/10"      ,} )
                  , item
                ]}, item)
              ))
            })
          ]})
          );
}
