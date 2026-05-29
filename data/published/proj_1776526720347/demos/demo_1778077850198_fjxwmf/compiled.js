import {jsxs as _jsxs, jsx as _jsx} from 'https://esm.sh/react@18.3.1/jsx-runtime'; function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } }import React from 'https://esm.sh/react@18.3.1';











const CATEGORY_MAP = {
  technology: { label: '科技', color: '#3b82f6', bg: '#dbeafe', icon: '💻' },
  nature: { label: '自然', color: '#22c55e', bg: '#dcfce7', icon: '🌿' },
  art: { label: '艺术', color: '#ec4899', bg: '#fce7f3', icon: '🎨' },
  science: { label: '科学', color: '#a855f7', bg: '#f3e8ff', icon: '🔬' },
};

const SAMPLE_DATA = {
  technology: [
    { title: 'AI 智能助手', desc: '基于大语言模型的智能对话系统', rating: 4.8 },
    { title: '云计算平台', desc: '弹性可扩展的云端基础设施', rating: 4.6 },
    { title: '数据可视化', desc: '将数据转化为直观的图表', rating: 4.9 },
    { title: '网络安全套件', desc: '全方位保护企业数字资产', rating: 4.5 },
    { title: '物联网网关', desc: '连接万物的智能中枢', rating: 4.3 },
    { title: '区块链服务', desc: '去中心化信任基础设施', rating: 4.2 },
    { title: '边缘计算', desc: '靠近数据源的实时处理', rating: 4.7 },
    { title: '量子模拟器', desc: '下一代计算范式探索', rating: 4.1 },
    { title: '自动化运维', desc: '智能化的系统运维管理', rating: 4.4 },
    { title: '低代码平台', desc: '拖拽式应用快速搭建', rating: 4.6 },
  ],
  nature: [
    { title: '热带雨林', desc: '地球上最丰富的生态系统', rating: 4.9 },
    { title: '珊瑚礁', desc: '海洋中的热带雨林', rating: 4.8 },
    { title: '高山草甸', desc: '海拔3000米以上的花海', rating: 4.7 },
    { title: '极光奇观', desc: '太阳风与磁场的交响乐', rating: 5.0 },
    { title: '沙漠绿洲', desc: '荒漠中的生命之源', rating: 4.5 },
    { title: '深海热泉', desc: '极端环境中的生命奇观', rating: 4.6 },
    { title: '湿地生态', desc: '地球之肾的净化力量', rating: 4.4 },
    { title: '冰川世界', desc: '封存千万年的时光', rating: 4.7 },
    { title: '草原迁徙', desc: '生命最壮丽的旅程', rating: 4.8 },
    { title: '萤火虫谷', desc: '夏夜里的星光盛宴', rating: 4.9 },
  ],
  art: [
    { title: '印象派光影', desc: '捕捉瞬间的光色变幻', rating: 4.7 },
    { title: '水墨丹青', desc: '东方美学的意境表达', rating: 4.8 },
    { title: '街头涂鸦', desc: '城市墙壁上的自由灵魂', rating: 4.4 },
    { title: '数字艺术', desc: '像素之间的无限可能', rating: 4.6 },
    { title: '雕塑空间', desc: '三维世界的形态探索', rating: 4.5 },
    { title: '摄影纪实', desc: '镜头下的真实与感动', rating: 4.7 },
    { title: '插画童话', desc: '画笔编织的梦幻世界', rating: 4.8 },
    { title: '建筑设计', desc: '空间与光影的交响诗', rating: 4.6 },
    { title: '陶艺匠心', desc: '泥土与火焰的完美邂逅', rating: 4.5 },
    { title: '舞蹈韵律', desc: '身体语言的艺术表达', rating: 4.7 },
  ],
  science: [
    { title: '基因编辑', desc: '改写生命密码的技术', rating: 4.8 },
    { title: '量子计算', desc: '颠覆传统计算的革命', rating: 4.6 },
    { title: '核聚变能源', desc: '人造太阳的清洁能源', rating: 4.5 },
    { title: '脑机接口', desc: '思想与机器的直接对话', rating: 4.7 },
    { title: '深空探测', desc: '人类对宇宙的不懈追问', rating: 4.9 },
    { title: '纳米材料', desc: '微观世界的工程奇迹', rating: 4.4 },
    { title: '合成生物学', desc: '设计与构建生命系统', rating: 4.6 },
    { title: '暗物质研究', desc: '宇宙隐藏的质量之谜', rating: 4.3 },
    { title: '气候模型', desc: '预测地球未来气候', rating: 4.5 },
    { title: '仿生机器人', desc: '向自然学习的设计智慧', rating: 4.7 },
  ],
};

const formatValue = (item) => {
  if (item.label.includes('率')) return `${item.value}%`;
  if (item.value >= 10000) return `${(item.value / 10000).toFixed(1)}万`;
  if (Number.isInteger(item.value)) return item.value.toLocaleString();
  return item.value.toString();
};

const ConfigDataPage = (props) => {
  const globalProps = props ;
  const brandName = (globalProps.brandName ) || 'OpenCode Workbench';
  const primaryColor = (globalProps.primaryColor ) || '#6366f1';
  const darkMode = _nullishCoalesce((globalProps.darkMode ), () => ( false));
  const companySlogan = (globalProps.companySlogan ) || '用配置驱动一切';

  const {
    pageTitle = '配置项展示 · 数据内容类',
    description = '通过右侧面板调整配置项，实时预览效果。本页演示：文本、数字滑块、开关、下拉选择、数组等配置类型。',
    itemCount = 6,
    showRating = true,
    category = 'technology',
    tagStyle = 'filled',
    dataItems = [],
  } = props;

  const cat = CATEGORY_MAP[category] || CATEGORY_MAP.technology;
  const items = SAMPLE_DATA[category] || SAMPLE_DATA.technology;
  const displayItems = items.slice(0, Math.min(Math.max(itemCount, 2), 16));

  const bgColor = darkMode ? '#0f172a' : '#f8fafc';
  const textColor = darkMode ? '#f1f5f9' : '#1e293b';
  const mutedColor = darkMode ? '#64748b' : '#94a3b8';
  const cardBg = darkMode ? '#1e293b' : '#ffffff';
  const borderColor = darkMode ? '#334155' : '#e2e8f0';
  const sectionBg = darkMode ? '#1a2332' : '#f1f5f9';
  const globalBadgeBg = darkMode ? '#1e293b' : '#ffffff';

  const getTagStyle = (color) => {
    if (tagStyle === 'filled') return { backgroundColor: color, color: '#fff' };
    if (tagStyle === 'outlined') return { borderColor: color, color, border: '1px solid' };
    return { color, backgroundColor: 'transparent' };
  };

  return (
    _jsxs('div', { style: { minHeight: '100vh', backgroundColor: bgColor, padding: '32px', fontFamily: 'system-ui, sans-serif' }, children: [
      /* ===== 🌐 全局配置区域（来自 project.config.schema.json，影响所有页面） ===== */
      _jsxs('div', { style: {
        maxWidth: '1100px', margin: '0 auto 36px',
        borderRadius: '16px', border: `2px solid ${primaryColor}44`,
        backgroundColor: globalBadgeBg, overflow: 'hidden',
        boxShadow: `0 4px 24px ${primaryColor}15`,
      }, children: [
        /* 标题栏 */
        _jsxs('div', { style: {
          padding: '14px 24px',
          background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
          display: 'flex', alignItems: 'center', gap: '10px',
        }, children: [
          _jsx('span', { style: { fontSize: '20px' }, children: "🌐"})
          , _jsx('span', { style: { color: '#fff', fontWeight: 700, fontSize: '16px' }, children: "全局配置"})
          , _jsx('span', { style: { color: '#ffffffaa', fontSize: '13px', fontWeight: 400 }, children: "— 定义于 project.config.schema.json，运行时注入所有页面"

          })
        ]})

        /* 全局配置字段展示 */
        , _jsxs('div', { style: { padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }, children: [
          /* brandName */
          _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' }, children: [
            _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [
              _jsx('span', { style: { fontSize: '11px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: "string · 文本"  })
              , _jsx('span', { style: { fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }, children: "全局"

              })
            ]})
            , _jsx('span', { style: { fontSize: '11px', color: mutedColor, fontWeight: 500 }, children: "brandName"})
            , _jsx('span', { style: { fontSize: '15px', fontWeight: 600, color: textColor }, children: brandName})
            , _jsx('span', { style: { fontSize: '11px', color: mutedColor }, children: "品牌名称 · 显示在页面顶部"  })
          ]})

          /* primaryColor */
          , _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' }, children: [
            _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [
              _jsx('span', { style: { fontSize: '11px', fontWeight: 700, color: '#ec4899', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: "color · 颜色"  })
              , _jsx('span', { style: { fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }, children: "全局"

              })
            ]})
            , _jsx('span', { style: { fontSize: '11px', color: mutedColor, fontWeight: 500 }, children: "primaryColor"})
            , _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [
              _jsx('span', { style: { width: '20px', height: '20px', borderRadius: '6px', backgroundColor: primaryColor, border: '2px solid ' + borderColor, display: 'inline-block' },} )
              , _jsx('span', { style: { fontSize: '14px', fontWeight: 600, color: textColor }, children: primaryColor})
            ]})
            , _jsx('span', { style: { fontSize: '11px', color: mutedColor }, children: "主题色 · 影响按钮和高亮颜色"  })
          ]})

          /* darkMode */
          , _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' }, children: [
            _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [
              _jsx('span', { style: { fontSize: '11px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: "boolean · 开关"  })
              , _jsx('span', { style: { fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }, children: "全局"

              })
            ]})
            , _jsx('span', { style: { fontSize: '11px', color: mutedColor, fontWeight: 500 }, children: "darkMode"})
            , _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [
              _jsx('span', { style: {
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '20px', borderRadius: '10px',
                backgroundColor: darkMode ? primaryColor : '#cbd5e1',
                transition: 'all 0.3s', position: 'relative',
              }, children: 
                _jsx('span', { style: {
                  position: 'absolute', width: '16px', height: '16px', borderRadius: '50%',
                  backgroundColor: '#fff', top: '2px',
                  left: darkMode ? '18px' : '2px', transition: 'all 0.3s',
                },} )
              })
              , _jsx('span', { style: { fontSize: '14px', fontWeight: 600, color: textColor }, children: 
                darkMode ? '深色模式' : '浅色模式'
              })
            ]})
            , _jsxs('span', { style: { fontSize: '11px', color: mutedColor }, children: ["深色模式 · 当前为"  , darkMode ? '深色' : '浅色', "主题"]})
          ]})

          /* companySlogan */
          , _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' }, children: [
            _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [
              _jsx('span', { style: { fontSize: '11px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: "string · 文本"  })
              , _jsx('span', { style: { fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }, children: "全局"

              })
            ]})
            , _jsx('span', { style: { fontSize: '11px', color: mutedColor, fontWeight: 500 }, children: "companySlogan"})
            , _jsx('span', { style: { fontSize: '15px', fontWeight: 600, color: textColor }, children: companySlogan})
            , _jsx('span', { style: { fontSize: '11px', color: mutedColor }, children: "公司标语 · 显示在页面底部"  })
          ]})
        ]})
      ]})

      /* ===== 📄 页面级配置区域 ===== */
      /* 页面标题 */
      , _jsxs('div', { style: { textAlign: 'center', marginBottom: '28px' }, children: [
        _jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '12px' }, children: [
          _jsx('span', { style: { fontSize: '14px', fontWeight: 600, color: textColor }, children: "📄 页面级配置" })
          , _jsx('span', { style: { fontSize: '10px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#22c55e18', color: '#22c55e', fontWeight: 600 }, children: "仅影响本页"

          })
        ]})
        , _jsx('h1', { style: { fontSize: '28px', fontWeight: 700, color: textColor, margin: '0 0 8px' }, children: pageTitle})
        , _jsx('p', { style: { fontSize: '14px', color: mutedColor, maxWidth: '600px', margin: '0 auto', lineHeight: '1.6' }, children: description})
      ]})

      /* Config type indicators - page level only */
      , _jsx('div', { style: { display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }, children: 
        [
          { label: 'string · 文本', color: '#3b82f6' },
          { label: 'number · 滑块', color: '#22c55e' },
          { label: 'boolean · 开关', color: '#f59e0b' },
          { label: 'enum · 下拉', color: '#ec4899' },
          { label: 'array · 数组', color: '#8b5cf6' },
        ].map((badge) => (
          _jsx('span', { style: { padding: '4px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: badge.color + '22', color: badge.color, border: `1px solid ${badge.color}44` }, children: 
            badge.label
          }, badge.label)
        ))
      })

      /* Cards Grid - controlled by page-level config: itemCount, category, showRating, tagStyle */
      , _jsx('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px', maxWidth: '1100px', margin: '0 auto 36px' }, children: 
        displayItems.map((item, index) => (
          _jsxs('div', {

            style: {
              backgroundColor: cardBg,
              borderRadius: '16px',
              border: `1px solid ${borderColor}`,
              padding: '24px',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
            },
            onMouseEnter: (e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = darkMode ? '0 12px 40px rgba(0,0,0,0.4)' : '0 12px 40px rgba(0,0,0,0.1)';
            },
            onMouseLeave: (e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            },
 children: [
            _jsx('div', { style: { fontSize: '36px', marginBottom: '12px' }, children: cat.icon})
            , _jsx('h3', { style: { fontSize: '18px', fontWeight: 600, color: textColor, margin: '0 0 6px' }, children: item.title})
            , _jsx('p', { style: { fontSize: '13px', color: mutedColor, margin: '0 0 14px', lineHeight: '1.5' }, children: item.desc})

            /* Tag - controlled by page-level config: tagStyle (enum) / category (enum) */
            , _jsx('span', { style: { display: 'inline-block', padding: tagStyle === 'filled' ? '3px 12px' : '3px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, ...getTagStyle(cat.color) }, children: 
              cat.label
            })

            /* Rating - controlled by page-level config: showRating (boolean toggle) */
            , showRating && (
              _jsxs('div', { style: { marginTop: '14px', display: 'flex', alignItems: 'center', gap: '6px' }, children: [
                _jsxs('span', { style: { color: '#f59e0b', fontSize: '14px' }, children: [
                  '★'.repeat(Math.floor(item.rating)), '☆'.repeat(5 - Math.floor(item.rating))
                ]})
                , _jsx('span', { style: { fontSize: '13px', color: mutedColor, fontWeight: 600 }, children: item.rating})
              ]})
            )

            /* Field name labels */
            , _jsxs('div', { style: { marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${borderColor}55`, display: 'flex', gap: '4px', flexWrap: 'wrap' }, children: [
              _jsx('span', { style: { fontSize: '9px', padding: '1px 6px', borderRadius: '3px', backgroundColor: '#ec489910', color: '#ec4899' }, children: "category"})
              , _jsx('span', { style: { fontSize: '9px', padding: '1px 6px', borderRadius: '3px', backgroundColor: '#f59e0b10', color: '#f59e0b' }, children: "showRating"})
              , _jsx('span', { style: { fontSize: '9px', padding: '1px 6px', borderRadius: '3px', backgroundColor: '#ec489910', color: '#ec4899' }, children: "tagStyle"})
            ]})
          ]}, index)
        ))
      })

      /* Data Stats Row - controlled by page-level config: dataItems (array), itemCount */
      , dataItems && dataItems.length > 0 && (
        _jsxs('div', { style: {
          maxWidth: '900px',
          margin: '0 auto 36px',
          backgroundColor: cardBg,
          borderRadius: '16px',
          border: `1px solid ${borderColor}`,
          padding: '24px 28px',
        }, children: [
          _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }, children: [
            _jsx('span', { style: { fontWeight: 600, fontSize: '15px', color: textColor }, children: "📊 统计数据" })
            , _jsx('span', { style: { fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#8b5cf618', color: '#8b5cf6', fontWeight: 600 }, children: "array 类型" })
            , _jsx('span', { style: { fontSize: '12px', color: mutedColor }, children: "由 dataItems 配置控制"  })
          ]})
          , _jsx('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${Math.min(dataItems.length, 4)}, 1fr)`, gap: '16px' }, children: 
            dataItems.slice(0, 4).map((item, index) => {
              const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899'];
              return (
                _jsxs('div', { style: { textAlign: 'center', padding: '16px', borderRadius: '12px', backgroundColor: darkMode ? '#0f172a' : '#f1f5f9' }, children: [
                  _jsx('div', { style: { fontSize: '28px', fontWeight: 700, color: colors[index], marginBottom: '4px' }, children: formatValue(item)})
                  , _jsx('div', { style: { fontSize: '13px', color: mutedColor }, children: item.label})
                ]}, index)
              );
            })
          })
        ]})
      )

      /* Footer - uses project config */
      , _jsx('div', { style: { textAlign: 'center', padding: '16px', borderTop: `1px solid ${borderColor}` }, children: 
        _jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', color: mutedColor }, children: [
          _jsx('span', { style: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: primaryColor, display: 'inline-block' },} )
          , _jsx('span', { children: brandName})
          , _jsx('span', { style: { color: borderColor }, children: "·"})
          , _jsx('span', { children: companySlogan})
          , _jsx('span', { style: { color: borderColor }, children: "·"})
          , _jsx('span', { style: { fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: primaryColor + '18', color: primaryColor, fontWeight: 600 }, children: "全局"})
        ]})
      })

      /* ===== 配置归属汇总 ===== */
      , _jsxs('div', { style: { maxWidth: '1100px', margin: '32px auto 0', padding: '20px 24px', backgroundColor: sectionBg, borderRadius: '12px', border: `1px dashed ${borderColor}` }, children: [
        _jsx('div', { style: { fontSize: '14px', fontWeight: 600, color: textColor, marginBottom: '12px' }, children: "📋 本页配置归属总览" })
        , _jsxs('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }, children: [
          _jsxs('div', { children: [
            _jsx('div', { style: { color: primaryColor, fontWeight: 600, marginBottom: '6px' }, children: "🌐 全局配置（影响所有页面）" })
            , _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', color: mutedColor }, children: [
              _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "brandName"}), " — 品牌名称"  ]})
              , _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "primaryColor"}), " — 主题色"  ]})
              , _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "darkMode"}), " — 深色模式"  ]})
              , _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "companySlogan"}), " — 公司标语"  ]})
            ]})
          ]})
          , _jsxs('div', { children: [
            _jsx('div', { style: { color: '#22c55e', fontWeight: 600, marginBottom: '6px' }, children: "📄 页面级配置（仅本页）" })
            , _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', color: mutedColor }, children: [
              _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "pageTitle"}), " — string · 页面标题"    ]})
              , _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "description"}), " — string · 描述文字"    ]})
              , _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "itemCount"}), " — number · 卡片数量（滑块）"    ]})
              , _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "showRating"}), " — boolean · 显示评分（开关）"    ]})
              , _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "category"}), " — enum · 内容分类（下拉）"    ]})
              , _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "tagStyle"}), " — enum · 标签样式（下拉）"    ]})
              , _jsxs('span', { children: [_jsx('code', { style: { color: textColor }, children: "dataItems"}), " — array · 统计数据（数组）"    ]})
            ]})
          ]})
        ]})
      ]})
    ]})
  );
};

export default ConfigDataPage;
