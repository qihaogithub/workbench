interface DemoProps {}

// 各科目手机 UI 图（来自「头图背景预览_files」素材，750×1624）
const SUBJECTS = [
  { key: 'reading', label: '阅读', ui: '/api/images/img_zqEm0PFAyqds3Q' },
  { key: 'thinking', label: '思维', ui: '/api/images/img_Za_pljX94fLiog' },
  { key: 'aesthetic', label: '美育', ui: '/api/images/img_hlc5wbP1e5b0Pg' },
  { key: 'english', label: '英语', ui: '/api/images/img_ooOzlSbai4C74A' },
  { key: 'writer', label: '小作家', ui: '/api/images/img__idWmfdsgepgkw' },
];

function cap(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function MobileHeaderPreview(props: DemoProps) {
  const p = props as Record<string, unknown>;
  const subject = (p.activeSubject as string) || 'reading';

  const current = SUBJECTS.find((s) => s.key === subject) || SUBJECTS[0];
  const bg = (p[`headerBg${cap(current.key)}`] as string) || '';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f5f5f5] py-5">
      {/* 手机容器 375×812：直接承载三层图片，不加设备边框卡片 */}
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ width: 375, height: 812 }}
      >
        {/* 第 1 层：上传的头图背景（750×540，顶部 270px）；未配置时显示上传提示层 */}
        {bg ? (
          <img
            src={bg}
            alt={`${current.label}手机头图背景`}
            className="absolute left-0 top-0 h-[270px] w-full object-cover"
            style={{ zIndex: 1 }}
          />
        ) : (
          <div
            className="absolute left-0 top-0 flex h-[270px] w-full flex-col items-center justify-center bg-black/40"
            style={{ zIndex: 3 }}
          >
            <span className="rounded-[20px] border-2 border-white px-5 py-2.5 text-sm text-white backdrop-blur-[5px]">
              上传头部背景
            </span>
          </div>
        )}

        {/* 第 2 层：手机 UI 图（整屏，顶部头图区域为透明镂空） */}
        <img
          src={current.ui}
          alt={`${current.label}手机UI`}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ zIndex: 2 }}
        />
      </div>

    </div>
  );
}
