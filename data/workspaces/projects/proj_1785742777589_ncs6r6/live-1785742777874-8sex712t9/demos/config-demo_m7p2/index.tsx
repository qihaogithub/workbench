interface DemoProps {
  title?: string;
  description?: string;
  count?: number;
  level?: number;
  enabled?: boolean;
  bgColor?: string;
  accentColor?: string;
  coverImage?: string;
  gallery?: string[];
  mode?: string;
  tags?: string[];
  region?: string[];
  richtextContent?: string;
  layoutItem?: string;
  layoutPosition?: { x: number; y: number };
  modules?: Array<Record<string, unknown>>;
}

const TAG_LABELS: Record<string, string> = {
  react: 'React',
  typescript: 'TypeScript',
  tailwind: 'Tailwind',
};

const REGION_MAP: Record<string, string> = {
  zhejiang: '浙江',
  hangzhou: '杭州',
};

const MODULE_TYPES = [
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
  ['array+sortable', '可排序列表'],
  ['maxItems', '数量限制'],
  ['position', '坐标定位'],
] as const;

export default function ConfigDemo(props: DemoProps) {
  const {
    title = '配置项示例',
    description = '每个配置类型仅保留一个示例',
    count = 42,
    level = 3,
    enabled = true,
    bgColor = '#f0f4ff',
    accentColor = '#6366f1',
    coverImage = '',
    gallery = [],
    mode = 'card',
    tags = [],
    region = [],
    richtextContent = '',
    layoutItem = '',
    layoutPosition = { x: 120, y: 60 },
    modules = [],
  } = props as Record<string, unknown>;

  const safeTags = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  const safeRegion = Array.isArray(region) ? region : typeof region === 'string' ? region.split(',') : [];
  const safeGallery = Array.isArray(gallery) ? gallery : typeof gallery === 'string' ? gallery.split(',') : [];
  const safeModules = Array.isArray(modules) ? modules : [];

  const renderRegion = (r: string[]): string => {
    if (r.length === 0) return '未选择';
    return r.map((v) => REGION_MAP[v] || v).join(' / ');
  };

  /* ── Field Row ── */
  const Field = ({
    label,
    children,
    mono = false,
  }: {
    label: string;
    children: React.ReactNode;
    mono?: boolean;
  }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 truncate mr-3">{label}</span>
      <span className={`text-sm text-right text-gray-800 ${mono ? 'font-mono text-xs' : ''}`}>
        {children}
      </span>
    </div>
  );

  /* ── Card Group ── */
  const Group = ({
    icon,
    heading,
    children,
  }: {
    icon: string;
    heading: string;
    children: React.ReactNode;
  }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-gray-50"
        style={{ background: `linear-gradient(135deg, ${accentColor}08, ${accentColor}03)` }}
      >
        <span className="text-base">{icon}</span>
        <span className="text-sm font-semibold text-gray-700">{heading}</span>
      </div>
      <div className="px-4 divide-y divide-gray-50">{children}</div>
    </div>
  );

  /* ── Tag Chips ── */
  const TagChip = ({ value }: { value: string }) => (
    <span
      className="inline-block text-[11px] px-2.5 py-0.5 rounded-full text-white font-medium"
      style={{ backgroundColor: accentColor }}
    >
      {TAG_LABELS[value] || value}
    </span>
  );

  /* ── Mode Pills ── */
  const modeMap: Record<string, string> = { card: '卡片', list: '列表', grid: '网格' };

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: bgColor }}>
      {/* 封面图片 */}
      {coverImage && (
        <div className="w-full h-36 overflow-hidden">
          <img src={coverImage} alt="封面" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-3 py-4 space-y-3">
        {/* ── 基本信息 ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">📋</span>
            <span className="text-sm font-semibold text-gray-700">基本信息</span>
          </div>
          <Field label="标题 (string)">
            <span className="font-medium">{title}</span>
          </Field>
          <Field label="描述 (text)">
            <span className="text-xs leading-relaxed text-gray-600 max-w-[200px]">{description}</span>
          </Field>
          <Field label="数量 (number)">{count}</Field>
          <Field label="等级 (integer)">{level}</Field>
          <Field label="启用 (boolean)">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: enabled ? '#22c55e' : '#ef4444' }}
              />
              {enabled ? '已启用' : '已禁用'}
            </span>
          </Field>
        </div>

        {/* ── 样式与颜色 ── */}
        <Group icon="🎨" heading="样式与颜色">
          <Field label="背景色 (color)">
            <span className="inline-flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: bgColor }}
              />
              <span className="font-mono text-xs text-gray-500">{bgColor}</span>
            </span>
          </Field>
          <Field label="强调色 (color)">
            <span className="inline-flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: accentColor }}
              />
              <span className="font-mono text-xs text-gray-500">{accentColor}</span>
            </span>
          </Field>
          {safeGallery.length > 0 && (
            <Field label={`图片集 (${safeGallery.length}张)`}>
              <div className="flex gap-1.5 overflow-x-auto">
                {safeGallery.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`图片 ${i + 1}`}
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-gray-100"
                  />
                ))}
              </div>
            </Field>
          )}
        </Group>

        {/* ── 选择类型 ── */}
        <Group icon="🔘" heading="选择类型">
          <Field label="模式 (enum)">
            <span className="inline-flex gap-1">
              {(['card', 'list', 'grid'] as const).map((m) => (
                <span
                  key={m}
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors"
                  style={{
                    backgroundColor: mode === m ? accentColor : '#f1f5f9',
                    color: mode === m ? '#fff' : '#64748b',
                  }}
                >
                  {modeMap[m]}
                </span>
              ))}
            </span>
          </Field>

          <Field label="标签 (enum+multi)">
            {safeTags.length > 0 ? (
              <span className="flex flex-wrap gap-1 justify-end">
                {safeTags.map((t) => (
                  <TagChip key={t} value={t} />
                ))}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">未选择</span>
            )}
          </Field>

          <Field label="地区 (cascade)">
            <span className="text-gray-700">{renderRegion(safeRegion)}</span>
          </Field>
        </Group>

        {/* ── 富文本 ── */}
        {richtextContent && (
          <Group icon="📝" heading="富文本 (richtext)">
            <div className="py-2.5">
              <div
                className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed [&_strong]:font-bold [&_em]:italic [&_u]:underline"
                dangerouslySetInnerHTML={{ __html: richtextContent }}
              />
            </div>
          </Group>
        )}

        {/* ── 可排序列表 ── */}
        <Group icon="📋" heading="可排序列表 (array)">
          <div className="py-2.5 space-y-2">
            {safeModules.length > 0 ? (
              safeModules.map((mod, i) => {
                const m = mod as Record<string, unknown>;
                const type = m.type as string;
                if (type === 'text') {
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100"
                    >
                      <span className="text-gray-300 text-xs">⠿</span>
                      <span className="text-xs text-gray-700">{(m.content as string) || ''}</span>
                    </div>
                  );
                }
                if (type === 'progress') {
                  const value = (m.value as number) || 0;
                  return (
                    <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-gray-300 text-xs">⠿</span>
                        <span className="text-xs text-gray-600">{(m.label as string) || '进度'}</span>
                        <span className="ml-auto text-xs font-bold" style={{ color: accentColor }}>
                          {value}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden ml-5">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${value}%`, backgroundColor: accentColor }}
                        />
                      </div>
                    </div>
                  );
                }
                return null;
              })
            ) : (
              <div className="text-xs text-gray-300 italic text-center py-3">暂无列表项</div>
            )}
          </div>
        </Group>

        {/* ── 配置类型一览 ── */}
        <Group icon="📑" heading="配置类型一览">
          <div className="py-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5">
            {MODULE_TYPES.map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="font-mono text-gray-500">{type}</span>
                <span className="text-gray-300">-</span>
                <span className="text-gray-600">{label}</span>
              </div>
            ))}
          </div>
        </Group>

        {/* ── 布局设置 ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div
            className="flex items-center gap-2 px-4 py-3 border-b border-gray-50"
            style={{ background: `linear-gradient(135deg, ${accentColor}08, ${accentColor}03)` }}
          >
            <span className="text-base">📐</span>
            <span className="text-sm font-semibold text-gray-700">布局设置</span>
          </div>
          <div className="px-4 py-3">
            <div
              className="relative w-full rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden"
              style={{ height: 260 }}
            >
              {layoutItem ? (
                <img
                  data-pos-key="layoutItem"
                  src={layoutItem}
                  alt="布局元素"
                  className="absolute w-16 h-16 rounded-lg object-cover shadow-md border-2 border-white"
                  style={{
                    left: typeof layoutPosition?.x === 'number' ? layoutPosition.x : 120,
                    top: typeof layoutPosition?.y === 'number' ? layoutPosition.y : 60,
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
                  <span className="text-3xl mb-2">🖼️</span>
                  <span className="text-xs">在右侧面板添加图片并拖动定位</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
interface DemoProps {
  title?: string;
  description?: string;
  count?: number;
  level?: number;
  enabled?: boolean;
  bgColor?: string;
  accentColor?: string;
  coverImage?: string;
  gallery?: string[];
  mode?: string;
  tags?: string[];
  region?: string[];
  richtextContent?: string;
  layoutItem?: string;
  layoutPosition?: { x: number; y: number };
  modules?: Array<Record<string, unknown>>;
}

const TAG_LABELS: Record<string, string> = {
  react: 'React',
  typescript: 'TypeScript',
  tailwind: 'Tailwind',
};

const REGION_MAP: Record<string, string> = {
  zhejiang: '浙江',
  hangzhou: '杭州',
};

const MODULE_TYPES = [
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
  ['array+sortable', '可排序列表'],
  ['maxItems', '数量限制'],
  ['position', '坐标定位'],
] as const;

export default function ConfigDemo(props: DemoProps) {
  const {
    title = '配置项示例',
    description = '每个配置类型仅保留一个示例',
    count = 42,
    level = 3,
    enabled = true,
    bgColor = '#f0f4ff',
    accentColor = '#6366f1',
    coverImage = '',
    gallery = [],
    mode = 'card',
    tags = [],
    region = [],
    richtextContent = '',
    layoutItem = '',
    layoutPosition = { x: 120, y: 60 },
    modules = [],
  } = props as Record<string, unknown>;

  const safeTags = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  const safeRegion = Array.isArray(region) ? region : typeof region === 'string' ? region.split(',') : [];
  const safeGallery = Array.isArray(gallery) ? gallery : typeof gallery === 'string' ? gallery.split(',') : [];
  const safeModules = Array.isArray(modules) ? modules : [];

  const renderRegion = (r: string[]): string => {
    if (r.length === 0) return '未选择';
    return r.map((v) => REGION_MAP[v] || v).join(' / ');
  };

  /* ── Field Row ── */
  const Field = ({
    label,
    children,
    mono = false,
  }: {
    label: string;
    children: React.ReactNode;
    mono?: boolean;
  }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 truncate mr-3">{label}</span>
      <span className={`text-sm text-right text-gray-800 ${mono ? 'font-mono text-xs' : ''}`}>
        {children}
      </span>
    </div>
  );

  /* ── Card Group ── */
  const Group = ({
    icon,
    heading,
    children,
  }: {
    icon: string;
    heading: string;
    children: React.ReactNode;
  }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-gray-50"
        style={{ background: `linear-gradient(135deg, ${accentColor}08, ${accentColor}03)` }}
      >
        <span className="text-base">{icon}</span>
        <span className="text-sm font-semibold text-gray-700">{heading}</span>
      </div>
      <div className="px-4 divide-y divide-gray-50">{children}</div>
    </div>
  );

  /* ── Tag Chips ── */
  const TagChip = ({ value }: { value: string }) => (
    <span
      className="inline-block text-[11px] px-2.5 py-0.5 rounded-full text-white font-medium"
      style={{ backgroundColor: accentColor }}
    >
      {TAG_LABELS[value] || value}
    </span>
  );

  /* ── Mode Pills ── */
  const modeMap: Record<string, string> = { card: '卡片', list: '列表', grid: '网格' };

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: bgColor }}>
      {/* 封面图片 */}
      {coverImage && (
        <div className="w-full h-36 overflow-hidden">
          <img src={coverImage} alt="封面" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-3 py-4 space-y-3">
        {/* ── 基本信息 ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">📋</span>
            <span className="text-sm font-semibold text-gray-700">基本信息</span>
          </div>
          <Field label="标题 (string)">
            <span className="font-medium">{title}</span>
          </Field>
          <Field label="描述 (text)">
            <span className="text-xs leading-relaxed text-gray-600 max-w-[200px]">{description}</span>
          </Field>
          <Field label="数量 (number)">{count}</Field>
          <Field label="等级 (integer)">{level}</Field>
          <Field label="启用 (boolean)">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: enabled ? '#22c55e' : '#ef4444' }}
              />
              {enabled ? '已启用' : '已禁用'}
            </span>
          </Field>
        </div>

        {/* ── 样式与颜色 ── */}
        <Group icon="🎨" heading="样式与颜色">
          <Field label="背景色 (color)">
            <span className="inline-flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: bgColor }}
              />
              <span className="font-mono text-xs text-gray-500">{bgColor}</span>
            </span>
          </Field>
          <Field label="强调色 (color)">
            <span className="inline-flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: accentColor }}
              />
              <span className="font-mono text-xs text-gray-500">{accentColor}</span>
            </span>
          </Field>
          {safeGallery.length > 0 && (
            <Field label={`图片集 (${safeGallery.length}张)`}>
              <div className="flex gap-1.5 overflow-x-auto">
                {safeGallery.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`图片 ${i + 1}`}
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-gray-100"
                  />
                ))}
              </div>
            </Field>
          )}
        </Group>

        {/* ── 选择类型 ── */}
        <Group icon="🔘" heading="选择类型">
          <Field label="模式 (enum)">
            <span className="inline-flex gap-1">
              {(['card', 'list', 'grid'] as const).map((m) => (
                <span
                  key={m}
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors"
                  style={{
                    backgroundColor: mode === m ? accentColor : '#f1f5f9',
                    color: mode === m ? '#fff' : '#64748b',
                  }}
                >
                  {modeMap[m]}
                </span>
              ))}
            </span>
          </Field>

          <Field label="标签 (enum+multi)">
            {safeTags.length > 0 ? (
              <span className="flex flex-wrap gap-1 justify-end">
                {safeTags.map((t) => (
                  <TagChip key={t} value={t} />
                ))}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">未选择</span>
            )}
          </Field>

          <Field label="地区 (cascade)">
            <span className="text-gray-700">{renderRegion(safeRegion)}</span>
          </Field>
        </Group>

        {/* ── 富文本 ── */}
        {richtextContent && (
          <Group icon="📝" heading="富文本 (richtext)">
            <div className="py-2.5">
              <div
                className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed [&_strong]:font-bold [&_em]:italic [&_u]:underline"
                dangerouslySetInnerHTML={{ __html: richtextContent }}
              />
            </div>
          </Group>
        )}

        {/* ── 可排序列表 ── */}
        <Group icon="📋" heading="可排序列表 (array)">
          <div className="py-2.5 space-y-2">
            {safeModules.length > 0 ? (
              safeModules.map((mod, i) => {
                const m = mod as Record<string, unknown>;
                const type = m.type as string;
                if (type === 'text') {
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100"
                    >
                      <span className="text-gray-300 text-xs">⠿</span>
                      <span className="text-xs text-gray-700">{(m.content as string) || ''}</span>
                    </div>
                  );
                }
                if (type === 'progress') {
                  const value = (m.value as number) || 0;
                  return (
                    <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-gray-300 text-xs">⠿</span>
                        <span className="text-xs text-gray-600">{(m.label as string) || '进度'}</span>
                        <span className="ml-auto text-xs font-bold" style={{ color: accentColor }}>
                          {value}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden ml-5">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${value}%`, backgroundColor: accentColor }}
                        />
                      </div>
                    </div>
                  );
                }
                return null;
              })
            ) : (
              <div className="text-xs text-gray-300 italic text-center py-3">暂无列表项</div>
            )}
          </div>
        </Group>

        {/* ── 配置类型一览 ── */}
        <Group icon="📑" heading="配置类型一览">
          <div className="py-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5">
            {MODULE_TYPES.map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="font-mono text-gray-500">{type}</span>
                <span className="text-gray-300">-</span>
                <span className="text-gray-600">{label}</span>
              </div>
            ))}
          </div>
        </Group>

        {/* ── 布局设置 ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div
            className="flex items-center gap-2 px-4 py-3 border-b border-gray-50"
            style={{ background: `linear-gradient(135deg, ${accentColor}08, ${accentColor}03)` }}
          >
            <span className="text-base">📐</span>
            <span className="text-sm font-semibold text-gray-700">布局设置</span>
          </div>
          <div className="px-4 py-3">
            <div
              className="relative w-full rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden"
              style={{ height: 260 }}
            >
              {layoutItem ? (
                <img
                  data-pos-key="layoutItem"
                  src={layoutItem}
                  alt="布局元素"
                  className="absolute w-16 h-16 rounded-lg object-cover shadow-md border-2 border-white"
                  style={{
                    left: typeof layoutPosition?.x === 'number' ? layoutPosition.x : 120,
                    top: typeof layoutPosition?.y === 'number' ? layoutPosition.y : 60,
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
                  <span className="text-3xl mb-2">🖼️</span>
                  <span className="text-xs">在右侧面板添加图片并拖动定位</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
interface DemoProps {
  title?: string;
  description?: string;
  count?: number;
  level?: number;
  enabled?: boolean;
  bgColor?: string;
  accentColor?: string;
  coverImage?: string;
  gallery?: string[];
  mode?: string;
  tags?: string[];
  region?: string[];
  richtextContent?: string;
  layoutItem?: string;
  layoutPosition?: { x: number; y: number };
  modules?: Array<Record<string, unknown>>;
}

const TAG_LABELS: Record<string, string> = {
  react: 'React',
  typescript: 'TypeScript',
  tailwind: 'Tailwind',
};

const REGION_MAP: Record<string, string> = {
  zhejiang: '浙江',
  hangzhou: '杭州',
};

const MODULE_TYPES = [
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
  ['array+sortable', '可排序列表'],
  ['maxItems', '数量限制'],
  ['position', '坐标定位'],
] as const;

export default function ConfigDemo(props: DemoProps) {
  const {
    title = '配置项示例',
    description = '每个配置类型仅保留一个示例',
    count = 42,
    level = 3,
    enabled = true,
    bgColor = '#f0f4ff',
    accentColor = '#6366f1',
    coverImage = '',
    gallery = [],
    mode = 'card',
    tags = [],
    region = [],
    richtextContent = '',
    layoutItem = '',
    layoutPosition = { x: 120, y: 60 },
    modules = [],
  } = props as Record<string, unknown>;

  const safeTags = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  const safeRegion = Array.isArray(region) ? region : typeof region === 'string' ? region.split(',') : [];
  const safeGallery = Array.isArray(gallery) ? gallery : typeof gallery === 'string' ? gallery.split(',') : [];
  const safeModules = Array.isArray(modules) ? modules : [];

  const renderRegion = (r: string[]): string => {
    if (r.length === 0) return '未选择';
    return r.map((v) => REGION_MAP[v] || v).join(' / ');
  };

  /* ── Field Row ── */
  const Field = ({
    label,
    children,
    mono = false,
  }: {
    label: string;
    children: React.ReactNode;
    mono?: boolean;
  }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 truncate mr-3">{label}</span>
      <span className={`text-sm text-right text-gray-800 ${mono ? 'font-mono text-xs' : ''}`}>
        {children}
      </span>
    </div>
  );

  /* ── Card Group ── */
  const Group = ({
    icon,
    heading,
    children,
  }: {
    icon: string;
    heading: string;
    children: React.ReactNode;
  }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-gray-50"
        style={{ background: `linear-gradient(135deg, ${accentColor}08, ${accentColor}03)` }}
      >
        <span className="text-base">{icon}</span>
        <span className="text-sm font-semibold text-gray-700">{heading}</span>
      </div>
      <div className="px-4 divide-y divide-gray-50">{children}</div>
    </div>
  );

  /* ── Tag Chips ── */
  const TagChip = ({ value }: { value: string }) => (
    <span
      className="inline-block text-[11px] px-2.5 py-0.5 rounded-full text-white font-medium"
      style={{ backgroundColor: accentColor }}
    >
      {TAG_LABELS[value] || value}
    </span>
  );

  /* ── Mode Pills ── */
  const modeMap: Record<string, string> = { card: '卡片', list: '列表', grid: '网格' };

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: bgColor }}>
      {/* 封面图片 */}
      {coverImage && (
        <div className="w-full h-36 overflow-hidden">
          <img src={coverImage} alt="封面" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-3 py-4 space-y-3">
        {/* ── 基本信息 ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">📋</span>
            <span className="text-sm font-semibold text-gray-700">基本信息</span>
          </div>
          <Field label="标题 (string)">
            <span className="font-medium">{title}</span>
          </Field>
          <Field label="描述 (text)">
            <span className="text-xs leading-relaxed text-gray-600 max-w-[200px]">{description}</span>
          </Field>
          <Field label="数量 (number)">{count}</Field>
          <Field label="等级 (integer)">{level}</Field>
          <Field label="启用 (boolean)">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: enabled ? '#22c55e' : '#ef4444' }}
              />
              {enabled ? '已启用' : '已禁用'}
            </span>
          </Field>
        </div>

        {/* ── 样式与颜色 ── */}
        <Group icon="🎨" heading="样式与颜色">
          <Field label="背景色 (color)">
            <span className="inline-flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: bgColor }}
              />
              <span className="font-mono text-xs text-gray-500">{bgColor}</span>
            </span>
          </Field>
          <Field label="强调色 (color)">
            <span className="inline-flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: accentColor }}
              />
              <span className="font-mono text-xs text-gray-500">{accentColor}</span>
            </span>
          </Field>
          {safeGallery.length > 0 && (
            <Field label={`图片集 (${safeGallery.length}张)`}>
              <div className="flex gap-1.5 overflow-x-auto">
                {safeGallery.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`图片 ${i + 1}`}
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-gray-100"
                  />
                ))}
              </div>
            </Field>
          )}
        </Group>

        {/* ── 选择类型 ── */}
        <Group icon="🔘" heading="选择类型">
          <Field label="模式 (enum)">
            <span className="inline-flex gap-1">
              {(['card', 'list', 'grid'] as const).map((m) => (
                <span
                  key={m}
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors"
                  style={{
                    backgroundColor: mode === m ? accentColor : '#f1f5f9',
                    color: mode === m ? '#fff' : '#64748b',
                  }}
                >
                  {modeMap[m]}
                </span>
              ))}
            </span>
          </Field>

          <Field label="标签 (enum+multi)">
            {safeTags.length > 0 ? (
              <span className="flex flex-wrap gap-1 justify-end">
                {safeTags.map((t) => (
                  <TagChip key={t} value={t} />
                ))}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">未选择</span>
            )}
          </Field>

          <Field label="地区 (cascade)">
            <span className="text-gray-700">{renderRegion(safeRegion)}</span>
          </Field>
        </Group>

        {/* ── 富文本 ── */}
        {richtextContent && (
          <Group icon="📝" heading="富文本 (richtext)">
            <div className="py-2.5">
              <div
                className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed [&_strong]:font-bold [&_em]:italic [&_u]:underline"
                dangerouslySetInnerHTML={{ __html: richtextContent }}
              />
            </div>
          </Group>
        )}

        {/* ── 可排序列表 ── */}
        <Group icon="📋" heading="可排序列表 (array)">
          <div className="py-2.5 space-y-2">
            {safeModules.length > 0 ? (
              safeModules.map((mod, i) => {
                const m = mod as Record<string, unknown>;
                const type = m.type as string;
                if (type === 'text') {
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100"
                    >
                      <span className="text-gray-300 text-xs">⠿</span>
                      <span className="text-xs text-gray-700">{(m.content as string) || ''}</span>
                    </div>
                  );
                }
                if (type === 'progress') {
                  const value = (m.value as number) || 0;
                  return (
                    <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-gray-300 text-xs">⠿</span>
                        <span className="text-xs text-gray-600">{(m.label as string) || '进度'}</span>
                        <span className="ml-auto text-xs font-bold" style={{ color: accentColor }}>
                          {value}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden ml-5">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${value}%`, backgroundColor: accentColor }}
                        />
                      </div>
                    </div>
                  );
                }
                return null;
              })
            ) : (
              <div className="text-xs text-gray-300 italic text-center py-3">暂无列表项</div>
            )}
          </div>
        </Group>

        {/* ── 配置类型一览 ── */}
        <Group icon="📑" heading="配置类型一览">
          <div className="py-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5">
            {MODULE_TYPES.map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="font-mono text-gray-500">{type}</span>
                <span className="text-gray-300">-</span>
                <span className="text-gray-600">{label}</span>
              </div>
            ))}
          </div>
        </Group>

        {/* ── 布局设置 ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div
            className="flex items-center gap-2 px-4 py-3 border-b border-gray-50"
            style={{ background: `linear-gradient(135deg, ${accentColor}08, ${accentColor}03)` }}
          >
            <span className="text-base">📐</span>
            <span className="text-sm font-semibold text-gray-700">布局设置</span>
          </div>
          <div className="px-4 py-3">
            <div
              className="relative w-full rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden"
              style={{ height: 260 }}
            >
              {layoutItem ? (
                <img
                  data-pos-key="layoutItem"
                  src={layoutItem}
                  alt="布局元素"
                  className="absolute w-16 h-16 rounded-lg object-cover shadow-md border-2 border-white"
                  style={{
                    left: typeof layoutPosition?.x === 'number' ? layoutPosition.x : 120,
                    top: typeof layoutPosition?.y === 'number' ? layoutPosition.y : 60,
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
                  <span className="text-3xl mb-2">🖼️</span>
                  <span className="text-xs">在右侧面板添加图片并拖动定位</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
