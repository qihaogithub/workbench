interface DemoProps {}

// 各科目 Pad 素材（来自「头图背景预览_files」）
// bottom: Pad 底层图（2732×1488），top: Pad 上层图（2732×1488），顶部头图区域均为透明镂空
const SUBJECTS = [
  { key: 'reading', label: '阅读', bottom: '/api/images/img_2Y6cNADGIUTNyw', top: '/api/images/img_uJiIlQv0qfdkWQ' },
  { key: 'thinking', label: '思维', bottom: '/api/images/img_F_vOdbsBBPMsDg', top: '/api/images/img_gDTg2-XpKAnSVQ' },
  { key: 'aesthetic', label: '美育', bottom: '/api/images/img_XK1pvCdr88938Q', top: '/api/images/img_NZImhS-OZZo6JA' },
  { key: 'english', label: '英语', bottom: '/api/images/img_4FdS0bju2F1CQQ', top: '/api/images/img_CvRtuMj8MGw-TA' },
  { key: 'writer', label: '小作家', bottom: '/api/images/img_hqjzkcVjcCBDVw', top: '/api/images/img_EPIIE3m8EU5kDg' },
];

function cap(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function PadHeaderPreview(props: DemoProps) {
  const p = props as Record<string, unknown>;
  const subject = (p.activeSubject as string) || 'reading';

  const current = SUBJECTS.find((s) => s.key === subject) || SUBJECTS[0];
  const bg = (p[`padHeaderBg${cap(current.key)}`] as string) || '';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#f5f5f5] py-6">
      {/* Pad 容器 1366×744，缩放 0.72 以适配 1024 预览宽度；不加设备边框卡片 */}
      <div className="relative shrink-0" style={{ width: 983.5, height: 535.7 }}>
        <div
          className="absolute left-0 top-0 overflow-hidden"
          style={{ width: 1366, height: 744, transform: 'scale(0.72)', transformOrigin: 'top left' }}
        >
          {/* 第 1 层：Pad 底层图 */}
          <img
            src={current.bottom}
            alt={`${current.label}Pad底层`}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ zIndex: 1 }}
          />

          {/* 第 2 层：上传的 Pad 头图背景（2732×540，顶部 270px）；未配置时显示上传提示层 */}
          {bg ? (
            <img
              src={bg}
              alt={`${current.label}Pad头图背景`}
              className="absolute left-0 top-0 h-[270px] w-full object-cover"
              style={{ zIndex: 2 }}
            />
          ) : (
            <div
              className="absolute left-0 top-0 flex h-[270px] w-full flex-col items-center justify-center bg-black/40"
              style={{ zIndex: 4 }}
            >
              <span className="rounded-[20px] border-2 border-white px-5 py-2.5 text-sm text-white backdrop-blur-[5px]">
                上传头部背景
              </span>
            </div>
          )}

          {/* 第 3 层：Pad 上层图 */}
          <img
            src={current.top}
            alt={`${current.label}Pad上层`}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ zIndex: 3 }}
          />

        </div>
      </div>
    </div>
  );
}
