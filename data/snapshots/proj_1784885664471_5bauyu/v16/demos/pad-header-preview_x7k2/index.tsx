interface DemoProps {
  themeColor?: string;
}

// 各科目 Pad 前景 UI 图（2732×1488，主题色与手机页一一对应）
const SUBJECTS = [
  { key: 'reading', label: '阅读', top: '/api/images/img_uJiIlQv0qfdkWQ', ui: '/api/images/img_hqjzkcVjcCBDVw' },
  { key: 'thinking', label: '思维', top: '/api/images/img_EPIIE3m8EU5kDg', ui: '/api/images/img_2Y6cNADGIUTNyw' },
  { key: 'aesthetic', label: '美育', top: '/api/images/img_CvRtuMj8MGw-TA', ui: '/api/images/img_XK1pvCdr88938Q' },
  { key: 'english', label: '英语', top: '/api/images/img_gDTg2-XpKAnSVQ', ui: '/api/images/img_F_vOdbsBBPMsDg' },
  { key: 'writer', label: '小作家', top: '/api/images/img_NZImhS-OZZo6JA', ui: '/api/images/img_4FdS0bju2F1CQQ' },
];

// 各科目 Pad 头图默认背景（2732×540，与项目配置默认一致，配置面板可覆盖）
const PAD_HEADER_DEFAULTS: Record<string, string> = {
  reading: '/api/images/img_Grm_4OiH8TOVeA',
  thinking: '/api/images/img_Y71ITlqIit3QlQ',
  aesthetic: '/api/images/img_ipY07JXZljYPGA',
  english: '/api/images/img__2iSzIC4yUFmvw',
  writer: '/api/images/img_deKzx8a6wOXVCQ',
};

function cap(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function PadHeaderPreview(props: DemoProps) {
  const { themeColor = '' } = props;
  const p = props as Record<string, unknown>;
  const activeSubject = (p.activeSubject as string) || 'reading';

  const current = SUBJECTS.find((s) => s.key === activeSubject) || SUBJECTS[0];
  const bg =
    (p[`padHeaderBg${cap(current.key)}`] as string) ||
    PAD_HEADER_DEFAULTS[current.key] ||
    '';

  return (
    <div
      className="relative w-full overflow-hidden rounded-[20px] bg-white"
      style={{ aspectRatio: '1366 / 744' }}
    >
      {/* 第 1 层：头图背景（有上传头图时优先显示上传图，否则回退科目渐变层；全屏铺底延伸到选中元素底部） */}
      {bg ? (
        <img
          src={bg}
          alt={`${current.label}Pad头图背景`}
          className="absolute inset-0 h-full w-full object-cover object-top"
          style={{ zIndex: 2 }}
        />
      ) : (
        <img
          src={current.top}
          alt={`${current.label}Pad上层`}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ zIndex: 1 }}
        />
      )}

      {/* 第 2 层：科目 UI 前景图（Pad 版，按科目切换） */}
      <img
        src={current.ui}
        alt={`${current.label}课程UI`}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ zIndex: 3 }}
      />
    </div>
  );
}
