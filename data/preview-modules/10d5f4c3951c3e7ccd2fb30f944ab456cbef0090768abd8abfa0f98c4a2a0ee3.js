import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js"; function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }import React from "http://localhost:3200/preview-runtime/vendor/react.js";







export default function ConfigRegressionPage(props) {
  return (
    _jsxs('main', { style: { minHeight: '100vh', padding: 24, fontFamily: 'Arial, sans-serif' }, children: [
      _jsx('h1', { children: _nullishCoalesce(props.sharedTitle, () => ( 'missing-shared-e2e'))})
      , _jsx('p', { 'data-testid': "page-label", children: "page-one-runtime-e2e"})
      , _jsx('p', { children: _nullishCoalesce(props.pageTitle, () => ( 'missing-page-title-e2e'))})
      , _jsx('button', { type: "button", children: _nullishCoalesce(props.pageCta, () => ( 'missing-page-cta-e2e'))})
    ]})
  );
}