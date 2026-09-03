interface DemoProps {
  themeColor?: string;
}

// 各科目 Pad 素材（2732×1488）+ 科目 UI 图（与手机页映射一致）
const SUBJECTS = [
  { key: 'reading', label: '阅读', bottom: '/api/images/img_2Y6cNADGIUTNyw', top: '/api/images/img_uJiIlQv0qfdkWQ', ui: '/api/images/img_zqEm0PFAyqds3Q' },
  { key: 'thinking', label: '思维', bottom: '/api/images/img_F_vOdbsBBPMsDg', top: '/api/images/img_gDTg2-XpKAnSVQ', ui: '/api/images/img_Za_pljX94fLiog' },
  { key: 'aesthetic', label: '美育', bottom: '/api/images/img_XK1pvCdr88938Q', top: '/api/images/img_NZImhS-OZZo6JA', ui: '/api/images/img_hlc5wbP1e5b0Pg' },
  { key: 'english', label: '英语', bottom: '/api/images/img_4FdS0bju2F1CQQ', top: '/api/images/img_CvRtuMj8MGw-TA', ui: '/api/images/img_ooOzlSbai4C74A' },
  { key: 'writer', label: '小作家', bottom: '/api/images/img_hqjzkcVjcCBDVw', top: '/api/images/img_EPIIE3m8EU5kDg', ui: '/api/images/img__idWmfdsgepgkw' },
];

function cap(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function PadHeaderPreview(props: DemoProps) {
  const { themeColor = '' } = props;
  const p = props as Record<string, unknown>;
  const activeSubject = (p.activeSubject as string) || 'reading';

  const current = SUBJECTS.find((s) => s.key === activeSubject) || SUBJECTS[0];
  const bg = (p[`padHeaderBg${cap(current.key)}`] as string) || '';

  return (
    <div
      className="relative w-full overflow-hidden rounded-[20px] bg-white"
      style={{ aspectRatio: '1366 / 744' }}
    >
      {/* 第 1 层：Pad 底层图 */}
      <img
        src={current.bottom}
        alt={`${current.label}Pad底层`}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ zIndex: 1 }}
      />

      {/* 第 2 层：上传的 Pad 头图背景 */}
      {bg ? (
        <img
          src={bg}
          alt={`${current.label}Pad头图背景`}
          className="absolute left-0 top-0 w-full object-cover"
          style={{ zIndex: 2, aspectRatio: '1366 / 270' }}
        />
      ) : null}

      {/* 第 3 层：Pad 上层图 */}
      <img
        src={current.top}
        alt={`${current.label}Pad上层`}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ zIndex: 3 }}
      />

      {/* 第 4 层：科目 UI 图片层（按科目切换，与手机页映射一致） */}
      <img
        src={current.ui}
        alt={`${current.label}课程UI`}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ zIndex: 4 }}
      />
    </div>
  );
}
