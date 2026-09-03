interface DemoProps {
  // 标题与描述
  title?: string;
  description?: string;
  enabled?: boolean;
  count?: number;
  price?: number;
  // 样式与颜色
  bgColor?: string;
  accentColor?: string;
  coverImage?: string;
  gallery?: string[];
  // 选择与富文本
  mode?: string;
  tags?: string[];
  region?: string[];
  richtextContent?: string;
  // 模块列表
  modules?: Array<Record<string, unknown>>;
  // 定位与条件
  badgeText?: string;
  badgePosition?: { x: number; y: number };
  showMode?: string;
  customText?: string;
  customImage?: string;
}

function renderModule(item: Record<string, unknown>, accentColor: string, index: number) {
  const type = item.type as string;

  switch (type) {
    case 'heading': {
      const label = (item.label as string) || '章节标题';
      const level = (item.level as number) || 2;
      const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      return (
        <Tag
          key={`mod-${index}`}
          className="text-lg font-bold mb-2"
          style={{ color: accentColor }}
        >
          {label}
        </Tag>
      );
    }
    case 'card': {
      const title = (item.title as string) || '卡片标题';
      const description = (item.description as string) || '';
      const icon = (item.icon as string) || '';
      return (
        <div
          key={`mod-${index}`}
          className="bg-white rounded-xl p-4 shadow-sm border"
          style={{ borderColor: `${accentColor}20` }}
        >
          <div className="flex items-start gap-3">
            {icon && <span className="text-2xl">{icon}</span>}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm mb-1">{title}</h4>
              {description && (
                <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
              )}
            </div>
          </div>
        </div>
      );
    }
    case 'imageBlock': {
      const src = (item.src as string) || '';
      const caption = (item.caption as string) || '';
      return (
        <div key={`mod-${index}`} className="rounded-xl overflow-hidden bg-gray-100">
          {src ? (
            <img src={src} alt={caption || '模块图片'} className="w-full h-32 object-cover" />
          ) : (
            <div className="w-full h-32 flex items-center justify-center text-gray-400 text-xs">
              暂无图片
            </div>
          )}
          {caption && <p className="text-xs text-gray-500 text-center py-1">{caption}</p>}
        </div>
      );
    }
    case 'progress': {
      const label = (item.label as string) || '进度';
      const value = (item.value as number) || 0;
      return (
        <div key={`mod-${index}`} className="bg-white rounded-xl p-4 shadow-sm border" style={{ borderColor: `${accentColor}20` }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-gray-600">{label}</span>
            <span className="text-xs font-bold" style={{ color: accentColor }}>{value}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${value}%`, backgroundColor: accentColor }}
            />
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

function renderRegion(region: string[] | undefined): string {
  if (!region || region.length === 0) return '未选择';
  const regionMap: Record<string, string> = {
    beijing: '北京',
    shanghai: '上海',
    zhejiang: '浙江',
    hangzhou: '杭州',
    ningbo: '宁波',
    guangdong: '广东',
    guangzhou: '广州',
    shenzhen: '深圳',
  };
  return region.map((v) => regionMap[v] || v).join(' / ');
}

const TAG_MAP: Record<string, { label: string; color: string }> = {
  react: { label: 'React', color: '#61dafb' },
  typescript: { label: 'TypeScript', color: '#3178c6' },
  tailwind: { label: 'Tailwind', color: '#06b6d4' },
  api: { label: 'API', color: '#f59e0b' },
  config: { label: '配置系统', color: '#8b5cf6' },
};

export default function ConfigDemo(props: DemoProps) {
  const {
    title = '配置项示例 Demo',
    description = '',
    enabled = true,
    count = 3,
    price = 0,
    bgColor = '#f0f4ff',
    accentColor = '#6366f1',
    coverImage = '',
    gallery = [],
    mode = 'card',
    tags = [],
    region = [],
    richtextContent = '',
    modules = [],
    badgeText = 'NEW',
    badgePosition = { x: 280, y: 20 },
    showMode = 'text',
    customText = '',
    customImage = '',
  } = props as Record<string, unknown>;

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ backgroundColor: bgColor }}
    >
      {/* 定位徽章 — 演示 type: position */}
      <div
        data-pos-key="badge"
        className="absolute z-10 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm"
        style={{
          left: typeof badgePosition?.x === 'number' ? badgePosition.x : 280,
          top: typeof badgePosition?.y === 'number' ? badgePosition.y : 20,
          backgroundColor: accentColor,
        }}
      >
        {badgeText || 'NEW'}
      </div>

      {/* 封面图片 */}
      {coverImage && (
        <div className="w-full h-40 overflow-hidden">
          <img src={coverImage} alt="封面" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-4 pt-4 pb-6 space-y-5">
        {/* ===== 标题与描述 ===== */}
        <div>
          <h1 className="text-xl font-bold text-gray-800">{title}</h1>
          {description && (
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
          )}
        </div>

        {/* 启用状态指示 */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: enabled ? '#22c55e' : '#ef4444' }}
          />
          <span className="text-gray-500">
            {enabled ? '已启用' : '已禁用'} · 数量: {count} · 价格: ¥{Number(price).toFixed(2)}
          </span>
        </div>

        {/* ===== 样式与颜色 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            样式与颜色
          </h2>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">强调色:</div>
            <div
              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: accentColor }}
            />
            <div
              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: bgColor }}
            />
            <div className="text-xs text-gray-400">背景色</div>
          </div>

          {/* 图片集 (imageList) */}
          {gallery.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1">图片集 ({gallery.length} 张)</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`图片 ${i + 1}`}
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                  />
                ))}
              </div>
            </div>
          )}
          {gallery.length === 0 && (
            <div className="text-xs text-gray-300 italic">图片集为空，请上传图片</div>
          )}
        </div>

        {/* ===== 选择与富文本 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            选择与富文本
          </h2>

          {/* 展示模式 (enum) */}
          <div>
            <div className="text-xs text-gray-400 mb-1">展示模式: {mode}</div>
            <div className="flex gap-1">
              {['card', 'list', 'grid'].map((m) => (
                <span
                  key={m}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: mode === m ? accentColor : '#e5e7eb',
                    color: mode === m ? '#fff' : '#6b7280',
                  }}
                >
                  {m === 'card' ? '卡片' : m === 'list' ? '列表' : '网格'}
                </span>
              ))}
            </div>
          </div>

          {/* 标签多选 (enum + multiple) */}
          {tags.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1">标签 ({tags.length} 个)</div>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => {
                  const info = TAG_MAP[tag] || { label: tag, color: '#9ca3af' };
                  return (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: info.color }}
                    >
                      {info.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 级联选择 (cascade) */}
          <div>
            <div className="text-xs text-gray-400 mb-1">地区 (cascade)</div>
            <div className="text-xs font-medium text-gray-700">
              {renderRegion(region as string[] | undefined)}
            </div>
          </div>

          {/* 富文本 (richtext) */}
          {richtextContent && (
            <div>
              <div className="text-xs text-gray-400 mb-1">富文本内容</div>
              <div
                className="text-xs text-gray-700 bg-white rounded-lg p-3 border leading-relaxed [&_strong]:font-bold [&_em]:italic [&_u]:underline"
                dangerouslySetInnerHTML={{ __html: richtextContent }}
              />
            </div>
          )}
        </div>

        {/* ===== 模块列表 (array + sortable + maxItems) ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            模块列表
          </h2>
          <div className="text-[10px] text-gray-400 -mt-1">
            可拖拽排序 · 进度模块最多 1 个
          </div>
          <div className="space-y-2">
            {Array.isArray(modules) && modules.length > 0 ? (
              modules.map((mod, i) => renderModule(mod as Record<string, unknown>, accentColor, i))
            ) : (
              <div className="text-xs text-gray-300 italic text-center py-4">
                暂无模块，请在配置面板中添加
              </div>
            )}
          </div>
        </div>

        {/* ===== 定位与条件表单 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            定位与条件表单
          </h2>
          <div className="text-xs text-gray-400">
            显示模式: <span className="font-medium text-gray-600">{showMode === 'text' ? '文本模式' : '图片模式'}</span>
          </div>

          {/* visibleWhen: showMode === 'text' 时显示 */}
          {showMode === 'text' && customText && (
            <div className="text-xs text-gray-600 bg-white rounded-lg p-3 border">
              {customText}
            </div>
          )}

          {/* visibleWhen: showMode === 'image' 时显示 */}
          {showMode === 'image' && customImage && (
            <img
              src={customImage}
              alt="自定义图片"
              className="w-full h-28 object-cover rounded-lg"
            />
          )}
          {showMode === 'image' && !customImage && (
            <div className="text-xs text-gray-300 italic">请上传图片</div>
          )}
        </div>

        {/* ===== 底部配置类型说明 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            配置类型一览
          </h2>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500">
            {[
              ['string', '文本'],
              ['number', '数字'],
              ['integer', '整数'],
              ['boolean', '布尔'],
              ['text', '长文本'],
              ['color', '颜色'],
              ['image', '图片'],
              ['imageList', '图片列表'],
              ['richtext', '富文本'],
              ['enum', '枚举单选'],
              ['enum+multiple', '枚举多选'],
              ['cascade', '级联选择'],
              ['array', '模块数组'],
              ['position', '坐标定位'],
              ['sortable', '拖拽排序'],
              ['maxItems', '数量限制'],
              ['visibleWhen', '条件表单'],
            ].map(([type, label]) => (
              <div key={type} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
                <span className="font-mono">{type}</span>
                <span className="text-gray-300">-</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}interface DemoProps {
  // 标题与描述
  title?: string;
  description?: string;
  enabled?: boolean;
  count?: number;
  price?: number;
  // 样式与颜色
  bgColor?: string;
  accentColor?: string;
  coverImage?: string;
  gallery?: string[];
  // 选择与富文本
  mode?: string;
  tags?: string[];
  region?: string[];
  richtextContent?: string;
  // 模块列表
  modules?: Array<Record<string, unknown>>;
  // 定位与条件
  badgeText?: string;
  badgePosition?: { x: number; y: number };
  showMode?: string;
  customText?: string;
  customImage?: string;
}

function renderModule(item: Record<string, unknown>, accentColor: string, index: number) {
  const type = item.type as string;

  switch (type) {
    case 'heading': {
      const label = (item.label as string) || '章节标题';
      const level = (item.level as number) || 2;
      const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      return (
        <Tag
          key={`mod-${index}`}
          className="text-lg font-bold mb-2"
          style={{ color: accentColor }}
        >
          {label}
        </Tag>
      );
    }
    case 'card': {
      const title = (item.title as string) || '卡片标题';
      const description = (item.description as string) || '';
      const icon = (item.icon as string) || '';
      return (
        <div
          key={`mod-${index}`}
          className="bg-white rounded-xl p-4 shadow-sm border"
          style={{ borderColor: `${accentColor}20` }}
        >
          <div className="flex items-start gap-3">
            {icon && <span className="text-2xl">{icon}</span>}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm mb-1">{title}</h4>
              {description && (
                <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
              )}
            </div>
          </div>
        </div>
      );
    }
    case 'imageBlock': {
      const src = (item.src as string) || '';
      const caption = (item.caption as string) || '';
      return (
        <div key={`mod-${index}`} className="rounded-xl overflow-hidden bg-gray-100">
          {src ? (
            <img src={src} alt={caption || '模块图片'} className="w-full h-32 object-cover" />
          ) : (
            <div className="w-full h-32 flex items-center justify-center text-gray-400 text-xs">
              暂无图片
            </div>
          )}
          {caption && <p className="text-xs text-gray-500 text-center py-1">{caption}</p>}
        </div>
      );
    }
    case 'progress': {
      const label = (item.label as string) || '进度';
      const value = (item.value as number) || 0;
      return (
        <div key={`mod-${index}`} className="bg-white rounded-xl p-4 shadow-sm border" style={{ borderColor: `${accentColor}20` }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-gray-600">{label}</span>
            <span className="text-xs font-bold" style={{ color: accentColor }}>{value}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${value}%`, backgroundColor: accentColor }}
            />
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

function renderRegion(region: string[] | undefined): string {
  if (!region || region.length === 0) return '未选择';
  const regionMap: Record<string, string> = {
    beijing: '北京',
    shanghai: '上海',
    zhejiang: '浙江',
    hangzhou: '杭州',
    ningbo: '宁波',
    guangdong: '广东',
    guangzhou: '广州',
    shenzhen: '深圳',
  };
  return region.map((v) => regionMap[v] || v).join(' / ');
}

const TAG_MAP: Record<string, { label: string; color: string }> = {
  react: { label: 'React', color: '#61dafb' },
  typescript: { label: 'TypeScript', color: '#3178c6' },
  tailwind: { label: 'Tailwind', color: '#06b6d4' },
  api: { label: 'API', color: '#f59e0b' },
  config: { label: '配置系统', color: '#8b5cf6' },
};

export default function ConfigDemo(props: DemoProps) {
  const {
    title = '配置项示例 Demo',
    description = '',
    enabled = true,
    count = 3,
    price = 0,
    bgColor = '#f0f4ff',
    accentColor = '#6366f1',
    coverImage = '',
    gallery = [],
    mode = 'card',
    tags = [],
    region = [],
    richtextContent = '',
    modules = [],
    badgeText = 'NEW',
    badgePosition = { x: 280, y: 20 },
    showMode = 'text',
    customText = '',
    customImage = '',
  } = props as Record<string, unknown>;

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ backgroundColor: bgColor }}
    >
      {/* 定位徽章 — 演示 type: position */}
      <div
        data-pos-key="badge"
        className="absolute z-10 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm"
        style={{
          left: typeof badgePosition?.x === 'number' ? badgePosition.x : 280,
          top: typeof badgePosition?.y === 'number' ? badgePosition.y : 20,
          backgroundColor: accentColor,
        }}
      >
        {badgeText || 'NEW'}
      </div>

      {/* 封面图片 */}
      {coverImage && (
        <div className="w-full h-40 overflow-hidden">
          <img src={coverImage} alt="封面" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-4 pt-4 pb-6 space-y-5">
        {/* ===== 标题与描述 ===== */}
        <div>
          <h1 className="text-xl font-bold text-gray-800">{title}</h1>
          {description && (
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
          )}
        </div>

        {/* 启用状态指示 */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: enabled ? '#22c55e' : '#ef4444' }}
          />
          <span className="text-gray-500">
            {enabled ? '已启用' : '已禁用'} · 数量: {count} · 价格: ¥{Number(price).toFixed(2)}
          </span>
        </div>

        {/* ===== 样式与颜色 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            样式与颜色
          </h2>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">强调色:</div>
            <div
              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: accentColor }}
            />
            <div
              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: bgColor }}
            />
            <div className="text-xs text-gray-400">背景色</div>
          </div>

          {/* 图片集 (imageList) */}
          {gallery.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1">图片集 ({gallery.length} 张)</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`图片 ${i + 1}`}
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                  />
                ))}
              </div>
            </div>
          )}
          {gallery.length === 0 && (
            <div className="text-xs text-gray-300 italic">图片集为空，请上传图片</div>
          )}
        </div>

        {/* ===== 选择与富文本 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            选择与富文本
          </h2>

          {/* 展示模式 (enum) */}
          <div>
            <div className="text-xs text-gray-400 mb-1">展示模式: {mode}</div>
            <div className="flex gap-1">
              {['card', 'list', 'grid'].map((m) => (
                <span
                  key={m}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: mode === m ? accentColor : '#e5e7eb',
                    color: mode === m ? '#fff' : '#6b7280',
                  }}
                >
                  {m === 'card' ? '卡片' : m === 'list' ? '列表' : '网格'}
                </span>
              ))}
            </div>
          </div>

          {/* 标签多选 (enum + multiple) */}
          {tags.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1">标签 ({tags.length} 个)</div>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => {
                  const info = TAG_MAP[tag] || { label: tag, color: '#9ca3af' };
                  return (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: info.color }}
                    >
                      {info.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 级联选择 (cascade) */}
          <div>
            <div className="text-xs text-gray-400 mb-1">地区 (cascade)</div>
            <div className="text-xs font-medium text-gray-700">
              {renderRegion(region as string[] | undefined)}
            </div>
          </div>

          {/* 富文本 (richtext) */}
          {richtextContent && (
            <div>
              <div className="text-xs text-gray-400 mb-1">富文本内容</div>
              <div
                className="text-xs text-gray-700 bg-white rounded-lg p-3 border leading-relaxed [&_strong]:font-bold [&_em]:italic [&_u]:underline"
                dangerouslySetInnerHTML={{ __html: richtextContent }}
              />
            </div>
          )}
        </div>

        {/* ===== 模块列表 (array + sortable + maxItems) ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            模块列表
          </h2>
          <div className="text-[10px] text-gray-400 -mt-1">
            可拖拽排序 · 进度模块最多 1 个
          </div>
          <div className="space-y-2">
            {Array.isArray(modules) && modules.length > 0 ? (
              modules.map((mod, i) => renderModule(mod as Record<string, unknown>, accentColor, i))
            ) : (
              <div className="text-xs text-gray-300 italic text-center py-4">
                暂无模块，请在配置面板中添加
              </div>
            )}
          </div>
        </div>

        {/* ===== 定位与条件表单 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            定位与条件表单
          </h2>
          <div className="text-xs text-gray-400">
            显示模式: <span className="font-medium text-gray-600">{showMode === 'text' ? '文本模式' : '图片模式'}</span>
          </div>

          {/* visibleWhen: showMode === 'text' 时显示 */}
          {showMode === 'text' && customText && (
            <div className="text-xs text-gray-600 bg-white rounded-lg p-3 border">
              {customText}
            </div>
          )}

          {/* visibleWhen: showMode === 'image' 时显示 */}
          {showMode === 'image' && customImage && (
            <img
              src={customImage}
              alt="自定义图片"
              className="w-full h-28 object-cover rounded-lg"
            />
          )}
          {showMode === 'image' && !customImage && (
            <div className="text-xs text-gray-300 italic">请上传图片</div>
          )}
        </div>

        {/* ===== 底部配置类型说明 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            配置类型一览
          </h2>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500">
            {[
              ['string', '文本'],
              ['number', '数字'],
              ['integer', '整数'],
              ['boolean', '布尔'],
              ['text', '长文本'],
              ['color', '颜色'],
              ['image', '图片'],
              ['imageList', '图片列表'],
              ['richtext', '富文本'],
              ['enum', '枚举单选'],
              ['enum+multiple', '枚举多选'],
              ['cascade', '级联选择'],
              ['array', '模块数组'],
              ['position', '坐标定位'],
              ['sortable', '拖拽排序'],
              ['maxItems', '数量限制'],
              ['visibleWhen', '条件表单'],
            ].map(([type, label]) => (
              <div key={type} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
                <span className="font-mono">{type}</span>
                <span className="text-gray-300">-</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}interface DemoProps {
  // 标题与描述
  title?: string;
  description?: string;
  enabled?: boolean;
  count?: number;
  price?: number;
  // 样式与颜色
  bgColor?: string;
  accentColor?: string;
  coverImage?: string;
  gallery?: string[];
  // 选择与富文本
  mode?: string;
  tags?: string[];
  region?: string[];
  richtextContent?: string;
  // 模块列表
  modules?: Array<Record<string, unknown>>;
  // 定位与条件
  badgeText?: string;
  badgePosition?: { x: number; y: number };
  showMode?: string;
  customText?: string;
  customImage?: string;
}

function renderModule(item: Record<string, unknown>, accentColor: string, index: number) {
  const type = item.type as string;

  switch (type) {
    case 'heading': {
      const label = (item.label as string) || '章节标题';
      const level = (item.level as number) || 2;
      const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      return (
        <Tag
          key={`mod-${index}`}
          className="text-lg font-bold mb-2"
          style={{ color: accentColor }}
        >
          {label}
        </Tag>
      );
    }
    case 'card': {
      const title = (item.title as string) || '卡片标题';
      const description = (item.description as string) || '';
      const icon = (item.icon as string) || '';
      return (
        <div
          key={`mod-${index}`}
          className="bg-white rounded-xl p-4 shadow-sm border"
          style={{ borderColor: `${accentColor}20` }}
        >
          <div className="flex items-start gap-3">
            {icon && <span className="text-2xl">{icon}</span>}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm mb-1">{title}</h4>
              {description && (
                <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
              )}
            </div>
          </div>
        </div>
      );
    }
    case 'imageBlock': {
      const src = (item.src as string) || '';
      const caption = (item.caption as string) || '';
      return (
        <div key={`mod-${index}`} className="rounded-xl overflow-hidden bg-gray-100">
          {src ? (
            <img src={src} alt={caption || '模块图片'} className="w-full h-32 object-cover" />
          ) : (
            <div className="w-full h-32 flex items-center justify-center text-gray-400 text-xs">
              暂无图片
            </div>
          )}
          {caption && <p className="text-xs text-gray-500 text-center py-1">{caption}</p>}
        </div>
      );
    }
    case 'progress': {
      const label = (item.label as string) || '进度';
      const value = (item.value as number) || 0;
      return (
        <div key={`mod-${index}`} className="bg-white rounded-xl p-4 shadow-sm border" style={{ borderColor: `${accentColor}20` }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-gray-600">{label}</span>
            <span className="text-xs font-bold" style={{ color: accentColor }}>{value}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${value}%`, backgroundColor: accentColor }}
            />
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

function renderRegion(region: string[] | undefined): string {
  if (!region || region.length === 0) return '未选择';
  const regionMap: Record<string, string> = {
    beijing: '北京',
    shanghai: '上海',
    zhejiang: '浙江',
    hangzhou: '杭州',
    ningbo: '宁波',
    guangdong: '广东',
    guangzhou: '广州',
    shenzhen: '深圳',
  };
  return region.map((v) => regionMap[v] || v).join(' / ');
}

const TAG_MAP: Record<string, { label: string; color: string }> = {
  react: { label: 'React', color: '#61dafb' },
  typescript: { label: 'TypeScript', color: '#3178c6' },
  tailwind: { label: 'Tailwind', color: '#06b6d4' },
  api: { label: 'API', color: '#f59e0b' },
  config: { label: '配置系统', color: '#8b5cf6' },
};

export default function ConfigDemo(props: DemoProps) {
  const {
    title = '配置项示例 Demo',
    description = '',
    enabled = true,
    count = 3,
    price = 0,
    bgColor = '#f0f4ff',
    accentColor = '#6366f1',
    coverImage = '',
    gallery = [],
    mode = 'card',
    tags = [],
    region = [],
    richtextContent = '',
    modules = [],
    badgeText = 'NEW',
    badgePosition = { x: 280, y: 20 },
    showMode = 'text',
    customText = '',
    customImage = '',
  } = props as Record<string, unknown>;

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ backgroundColor: bgColor }}
    >
      {/* 定位徽章 — 演示 type: position */}
      <div
        data-pos-key="badge"
        className="absolute z-10 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm"
        style={{
          left: typeof badgePosition?.x === 'number' ? badgePosition.x : 280,
          top: typeof badgePosition?.y === 'number' ? badgePosition.y : 20,
          backgroundColor: accentColor,
        }}
      >
        {badgeText || 'NEW'}
      </div>

      {/* 封面图片 */}
      {coverImage && (
        <div className="w-full h-40 overflow-hidden">
          <img src={coverImage} alt="封面" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-4 pt-4 pb-6 space-y-5">
        {/* ===== 标题与描述 ===== */}
        <div>
          <h1 className="text-xl font-bold text-gray-800">{title}</h1>
          {description && (
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
          )}
        </div>

        {/* 启用状态指示 */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: enabled ? '#22c55e' : '#ef4444' }}
          />
          <span className="text-gray-500">
            {enabled ? '已启用' : '已禁用'} · 数量: {count} · 价格: ¥{Number(price).toFixed(2)}
          </span>
        </div>

        {/* ===== 样式与颜色 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            样式与颜色
          </h2>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">强调色:</div>
            <div
              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: accentColor }}
            />
            <div
              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: bgColor }}
            />
            <div className="text-xs text-gray-400">背景色</div>
          </div>

          {/* 图片集 (imageList) */}
          {gallery.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1">图片集 ({gallery.length} 张)</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`图片 ${i + 1}`}
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                  />
                ))}
              </div>
            </div>
          )}
          {gallery.length === 0 && (
            <div className="text-xs text-gray-300 italic">图片集为空，请上传图片</div>
          )}
        </div>

        {/* ===== 选择与富文本 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            选择与富文本
          </h2>

          {/* 展示模式 (enum) */}
          <div>
            <div className="text-xs text-gray-400 mb-1">展示模式: {mode}</div>
            <div className="flex gap-1">
              {['card', 'list', 'grid'].map((m) => (
                <span
                  key={m}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: mode === m ? accentColor : '#e5e7eb',
                    color: mode === m ? '#fff' : '#6b7280',
                  }}
                >
                  {m === 'card' ? '卡片' : m === 'list' ? '列表' : '网格'}
                </span>
              ))}
            </div>
          </div>

          {/* 标签多选 (enum + multiple) */}
          {tags.length > 0 && (
            <div>
              <div className="text-xs text-gray-400 mb-1">标签 ({tags.length} 个)</div>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => {
                  const info = TAG_MAP[tag] || { label: tag, color: '#9ca3af' };
                  return (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: info.color }}
                    >
                      {info.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 级联选择 (cascade) */}
          <div>
            <div className="text-xs text-gray-400 mb-1">地区 (cascade)</div>
            <div className="text-xs font-medium text-gray-700">
              {renderRegion(region as string[] | undefined)}
            </div>
          </div>

          {/* 富文本 (richtext) */}
          {richtextContent && (
            <div>
              <div className="text-xs text-gray-400 mb-1">富文本内容</div>
              <div
                className="text-xs text-gray-700 bg-white rounded-lg p-3 border leading-relaxed [&_strong]:font-bold [&_em]:italic [&_u]:underline"
                dangerouslySetInnerHTML={{ __html: richtextContent }}
              />
            </div>
          )}
        </div>

        {/* ===== 模块列表 (array + sortable + maxItems) ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            模块列表
          </h2>
          <div className="text-[10px] text-gray-400 -mt-1">
            可拖拽排序 · 进度模块最多 1 个
          </div>
          <div className="space-y-2">
            {Array.isArray(modules) && modules.length > 0 ? (
              modules.map((mod, i) => renderModule(mod as Record<string, unknown>, accentColor, i))
            ) : (
              <div className="text-xs text-gray-300 italic text-center py-4">
                暂无模块，请在配置面板中添加
              </div>
            )}
          </div>
        </div>

        {/* ===== 定位与条件表单 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            定位与条件表单
          </h2>
          <div className="text-xs text-gray-400">
            显示模式: <span className="font-medium text-gray-600">{showMode === 'text' ? '文本模式' : '图片模式'}</span>
          </div>

          {/* visibleWhen: showMode === 'text' 时显示 */}
          {showMode === 'text' && customText && (
            <div className="text-xs text-gray-600 bg-white rounded-lg p-3 border">
              {customText}
            </div>
          )}

          {/* visibleWhen: showMode === 'image' 时显示 */}
          {showMode === 'image' && customImage && (
            <img
              src={customImage}
              alt="自定义图片"
              className="w-full h-28 object-cover rounded-lg"
            />
          )}
          {showMode === 'image' && !customImage && (
            <div className="text-xs text-gray-300 italic">请上传图片</div>
          )}
        </div>

        {/* ===== 底部配置类型说明 ===== */}
        <div className="bg-white/60 backdrop-blur rounded-xl p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            配置类型一览
          </h2>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500">
            {[
              ['string', '文本'],
              ['number', '数字'],
              ['integer', '整数'],
              ['boolean', '布尔'],
              ['text', '长文本'],
              ['color', '颜色'],
              ['image', '图片'],
              ['imageList', '图片列表'],
              ['richtext', '富文本'],
              ['enum', '枚举单选'],
              ['enum+multiple', '枚举多选'],
              ['cascade', '级联选择'],
              ['array', '模块数组'],
              ['position', '坐标定位'],
              ['sortable', '拖拽排序'],
              ['maxItems', '数量限制'],
              ['visibleWhen', '条件表单'],
            ].map(([type, label]) => (
              <div key={type} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
                <span className="font-mono">{type}</span>
                <span className="text-gray-300">-</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}