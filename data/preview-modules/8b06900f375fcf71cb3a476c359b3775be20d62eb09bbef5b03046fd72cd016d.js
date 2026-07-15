import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";import React from "http://localhost:3200/preview-runtime/vendor/react.js";







export default function CoreFlowRegression({
  title,
  description,
  enabled,
}) {
  return (
    _jsxs('main', { className: "min-h-screen bg-white px-6 py-10 text-slate-950"    , children: [
      _jsx('p', { className: "text-sm font-medium text-emerald-700"  , children: "core-flow-regression"})
      , _jsx('h1', { className: "mt-3 text-3xl font-bold"  , children: title})
      , _jsx('p', { className: "mt-4 text-base text-slate-600"  , children: description})
      , _jsx('span', { className: "mt-6 inline-flex rounded-md bg-slate-950 px-3 py-2 text-sm text-white"       , children: 
        enabled ? '已启用' : '未启用'
      })
    ]})
  );
}
