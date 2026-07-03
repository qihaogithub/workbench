import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";export default function DemoPage({ title = "04 数据看板页面结构" }) {
  return (
    _jsxs('main', { className: "min-h-full bg-white p-7 text-slate-900"   , style: { background: "linear-gradient(180deg, hsl(111 52% 96%), #ffffff 42%)" }, children: [
      _jsxs('nav', { className: "mb-6 flex items-center justify-between text-sm text-slate-600"     , children: [
        _jsx('strong', { className: "text-slate-900", children: "04 数据看板" })
        , _jsx('span', { children: "React 04" })
      ]})
      , _jsxs('section', { className: "mb-5 rounded-md border border-slate-300 bg-white/90 p-6"     , children: [
        _jsx('p', { className: "mb-2 text-xs font-bold uppercase tracking-wide"    , style: { color: "hsl(111 68% 38%)" }, children: "High Fidelity Baseline"  })
        , _jsx('h1', { className: "mb-3 text-3xl font-bold leading-tight"   , children: title})
        , _jsx('p', { className: "leading-7 text-slate-600" , children: "用于测试画布承载大量高保真页面 iframe 的运行时压力。"  })
      ]})
      , _jsxs('section', { className: "mb-5 grid grid-cols-2 gap-3"   , children: [

        _jsxs('article', { className: "rounded-md border border-slate-200 bg-white p-4"    , children: [
          _jsx('span', { className: "block text-slate-500" , children: "模块 1" })
          , _jsx('strong', { className: "my-2 block text-2xl"  , children: "15"})
          , _jsx('small', { className: "text-slate-500", children: "流程节点 / 信息块"  })
        ]})

        , _jsxs('article', { className: "rounded-md border border-slate-200 bg-white p-4"    , children: [
          _jsx('span', { className: "block text-slate-500" , children: "模块 2" })
          , _jsx('strong', { className: "my-2 block text-2xl"  , children: "20"})
          , _jsx('small', { className: "text-slate-500", children: "流程节点 / 信息块"  })
        ]})

        , _jsxs('article', { className: "rounded-md border border-slate-200 bg-white p-4"    , children: [
          _jsx('span', { className: "block text-slate-500" , children: "模块 3" })
          , _jsx('strong', { className: "my-2 block text-2xl"  , children: "25"})
          , _jsx('small', { className: "text-slate-500", children: "流程节点 / 信息块"  })
        ]})

        , _jsxs('article', { className: "rounded-md border border-slate-200 bg-white p-4"    , children: [
          _jsx('span', { className: "block text-slate-500" , children: "模块 4" })
          , _jsx('strong', { className: "my-2 block text-2xl"  , children: "30"})
          , _jsx('small', { className: "text-slate-500", children: "流程节点 / 信息块"  })
        ]})
      ]})
      , _jsxs('section', { className: "grid grid-cols-[1.1fr_.9fr] gap-4"  , children: [
        _jsxs('div', { className: "rounded-md border border-slate-200 bg-white p-5"    , children: [
          _jsx('h2', { className: "mb-2 text-lg font-semibold"  , children: "关键区域"})
          , _jsx('p', { className: "leading-7 text-slate-600" , children: "页面主体包含导航、摘要、卡片、列表和操作区。"})
          , _jsx('button', { className: "mt-3 rounded-md px-4 py-2 font-semibold text-white"     , style: { backgroundColor: "hsl(111 64% 42%)" }, children: "主要操作"})
        ]})
        , _jsxs('ul', { className: "m-0 list-none rounded-md border border-slate-200 bg-white p-5"      , children: [

          _jsxs('li', { className: "flex justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0"      , children: [
            _jsx('span', { children: "高保真任务 1" })
            , _jsx('em', { className: "not-italic text-slate-700" , children: "进行中"})
          ]})

          , _jsxs('li', { className: "flex justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0"      , children: [
            _jsx('span', { children: "高保真任务 2" })
            , _jsx('em', { className: "not-italic text-slate-700" , children: "待确认"})
          ]})

          , _jsxs('li', { className: "flex justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0"      , children: [
            _jsx('span', { children: "高保真任务 3" })
            , _jsx('em', { className: "not-italic text-slate-700" , children: "进行中"})
          ]})

          , _jsxs('li', { className: "flex justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0"      , children: [
            _jsx('span', { children: "高保真任务 4" })
            , _jsx('em', { className: "not-italic text-slate-700" , children: "待确认"})
          ]})

          , _jsxs('li', { className: "flex justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0"      , children: [
            _jsx('span', { children: "高保真任务 5" })
            , _jsx('em', { className: "not-italic text-slate-700" , children: "进行中"})
          ]})

          , _jsxs('li', { className: "flex justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0"      , children: [
            _jsx('span', { children: "高保真任务 6" })
            , _jsx('em', { className: "not-italic text-slate-700" , children: "待确认"})
          ]})
        ]})
      ]})
    ]})
  );
}
