import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";





export default function HighFidelityCompareA({
  headline = "高保真对照 A：配置可编辑",
  themeColor = "#2563EB",
  ctaLabel = "高保真配置按钮",
}) {
  const rows = ["组件树", "配置 Props", "iframe runtime", "视觉属性"];
  return (
    _jsxs('main', { style: { minHeight: "100%", padding: 24, background: "#DBEAFE", color: "#111827" }, children: [
      _jsxs('section', { style: { border: "1px solid #d8dee8", background: "#fff", padding: 20, boxShadow: "0 18px 36px rgba(15,23,42,.12)" }, children: [
        _jsx('p', { style: { margin: "0 0 8px", color: themeColor, fontSize: 12, fontWeight: 900 }, children: "HIGH FIDELITY REACT"  })
        , _jsx('h1', { style: { margin: "0 0 12px", fontSize: 30, lineHeight: 1.08 }, children: headline})
        , _jsx('button', { style: { border: 0, minHeight: 40, padding: "0 14px", background: themeColor, color: "#fff", fontWeight: 900 }, children: ctaLabel})
      ]})
      , _jsx('section', { style: { display: "grid", gap: 10, marginTop: 14 }, children: 
        rows.map((row, index) => (
          _jsxs('article', { style: { display: "grid", gridTemplateColumns: "34px 1fr", gap: 10, border: "1px solid #d8dee8", background: "#fff", padding: 12 }, children: [
            _jsx('b', { style: { color: themeColor }, children: String(index + 1).padStart(2, "0")})
            , _jsx('span', { children: row})
          ]}, row)
        ))
      })
    ]})
  );
}
