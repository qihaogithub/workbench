import {jsxs as _jsxs, jsx as _jsx} from "http://localhost:3200/preview-runtime/vendor/react-jsx-runtime.js";const rows = [
  {
    "name": "高保真对照 B 事项 1",
    "status": "已上线",
    "value": 58
  },
  {
    "name": "高保真对照 B 事项 2",
    "status": "联调中",
    "value": 69
  },
  {
    "name": "高保真对照 B 事项 3",
    "status": "待确认",
    "value": 80
  },
  {
    "name": "高保真对照 B 事项 4",
    "status": "排期中",
    "value": 91
  },
  {
    "name": "高保真对照 B 事项 5",
    "status": "已上线",
    "value": 63
  },
  {
    "name": "高保真对照 B 事项 6",
    "status": "联调中",
    "value": 74
  },
  {
    "name": "高保真对照 B 事项 7",
    "status": "待确认",
    "value": 85
  },
  {
    "name": "高保真对照 B 事项 8",
    "status": "排期中",
    "value": 96
  },
  {
    "name": "高保真对照 B 事项 9",
    "status": "已上线",
    "value": 68
  },
  {
    "name": "高保真对照 B 事项 10",
    "status": "联调中",
    "value": 79
  },
  {
    "name": "高保真对照 B 事项 11",
    "status": "待确认",
    "value": 90
  },
  {
    "name": "高保真对照 B 事项 12",
    "status": "排期中",
    "value": 62
  },
  {
    "name": "高保真对照 B 事项 13",
    "status": "已上线",
    "value": 73
  },
  {
    "name": "高保真对照 B 事项 14",
    "status": "联调中",
    "value": 84
  },
  {
    "name": "高保真对照 B 事项 15",
    "status": "待确认",
    "value": 95
  },
  {
    "name": "高保真对照 B 事项 16",
    "status": "排期中",
    "value": 67
  }
];
const cards = [
  { label: "活跃模块", value: "42", note: "高保真 React" },
  { label: "状态节点", value: "128", note: "iframe 渲染" },
  { label: "资源占用", value: "Heavy", note: "对比原型页" },
  { label: "交互层级", value: "6", note: "组件树" }
];

export default function HighFidelityCompareB() {
  return (
    _jsxs('main', { style: {
      minHeight: "100%",
      padding: 24,
      background: "linear-gradient(180deg, #ede9fe, #f8fafc 44%, #eef2f7 100%)",
      color: "#111827",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    }, children: [
      _jsxs('header', { style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        border: "1px solid #d8dee8",
        background: "rgba(255,255,255,0.94)",
        padding: 16,
        marginBottom: 16,
        boxShadow: "0 12px 28px rgba(15,23,42,0.08)"
      }, children: [
        _jsxs('div', { children: [
          _jsx('div', { style: { fontSize: 11, color: "#64748b", fontWeight: 800 }, children: "HIGH FIDELITY REACT"  })
          , _jsx('h1', { style: { margin: "4px 0 0", fontSize: 25, lineHeight: 1.08 }, children: "高保真对照 B" })
        ]})
        , _jsx('div', { style: { color: "#7c3aed", fontWeight: 900, border: "1px solid #7c3aed", padding: "8px 10px" }, children: "React"})
      ]})

      , _jsx('section', { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 16 }, children: 
        cards.map((card) => (
          _jsxs('article', { style: { border: "1px solid #e2e8f0", background: "#fff", padding: 16 }, children: [
            _jsx('div', { style: { color: "#64748b", fontSize: 12 }, children: card.label})
            , _jsx('strong', { style: { display: "block", margin: "8px 0", fontSize: 28 }, children: card.value})
            , _jsx('small', { style: { color: "#64748b" }, children: card.note})
          ]}, card.label)
        ))
      })

      , _jsxs('section', { style: { border: "1px solid #d8dee8", background: "#fff", padding: 16, marginBottom: 16 }, children: [
        _jsxs('div', { style: { display: "flex", justifyContent: "space-between", marginBottom: 12 }, children: [
          _jsx('h2', { style: { margin: 0, fontSize: 18 }, children: "高保真组件列表"})
          , _jsx('span', { style: { color: "#64748b", fontSize: 12 }, children: "16 rows" })
        ]})
        , _jsx('div', { style: { display: "grid", gap: 8 }, children: 
          rows.map((row, index) => (
            _jsxs('div', { style: {
              display: "grid",
              gridTemplateColumns: "34px 1fr 64px",
              alignItems: "center",
              gap: 10,
              border: "1px solid #edf2f7",
              background: index % 2 === 0 ? "#f8fafc" : "#fff",
              padding: 10
            }, children: [
              _jsx('b', { style: { color: "#7c3aed" }, children: String(index + 1).padStart(2, "0")})
              , _jsxs('div', { children: [
                _jsx('strong', { style: { display: "block", fontSize: 13 }, children: row.name})
                , _jsx('small', { style: { color: "#64748b" }, children: row.status})
              ]})
              , _jsxs('span', { style: { color: "#7c3aed", fontWeight: 900 }, children: [row.value, "%"]})
            ]}, row.name)
          ))
        })
      ]})

      , _jsxs('footer', { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }, children: [
        _jsx('button', { style: { border: 0, minHeight: 42, background: "#7c3aed", color: "#fff", fontWeight: 900 }, children: "主操作"})
        , _jsx('button', { style: { border: "1px solid #7c3aed", minHeight: 42, background: "#fff", color: "#7c3aed", fontWeight: 900 }, children: "次操作"})
      ]})
    ]})
  );
}
