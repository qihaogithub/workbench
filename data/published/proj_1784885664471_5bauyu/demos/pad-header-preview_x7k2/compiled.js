import {jsxs as _jsxs, jsx as _jsx} from "/data/proj_1784885664471_5bauyu/preview-runtime/vendor/react-jsx-runtime.js";

// 各科目 Pad 前景 UI 图（2732×1488，主题色与手机页一一对应）
const SUBJECTS = [
  { key: 'reading', label: '阅读', top: '/data/proj_1784885664471_5bauyu/assets/images/e3fd7f4956143598c0076d31.png', ui: '/data/proj_1784885664471_5bauyu/assets/images/09572ecd4126176f1a550762.png' },
  { key: 'thinking', label: '思维', top: '/data/proj_1784885664471_5bauyu/assets/images/1a2fbeaf215a0d2ce380b0e9.png', ui: '/data/proj_1784885664471_5bauyu/assets/images/9253b92187f64e2ed71fc5c1.png' },
  { key: 'aesthetic', label: '美育', top: '/data/proj_1784885664471_5bauyu/assets/images/0761894e7d38949a661c200b.png', ui: '/data/proj_1784885664471_5bauyu/assets/images/8382251c0be8418a9bf73241.png' },
  { key: 'english', label: '英语', top: '/data/proj_1784885664471_5bauyu/assets/images/25b64dd82e4491e5ff705d1d.png', ui: '/data/proj_1784885664471_5bauyu/assets/images/7f5f316cd3504c35ad3997a5.png' },
  { key: 'writer', label: '小作家', top: '/data/proj_1784885664471_5bauyu/assets/images/3836c3e944f03a783daf9da6.png', ui: '/data/proj_1784885664471_5bauyu/assets/images/a9f16c042727fbe6262207f2.png' },
];

// 各科目 Pad 头图默认背景（2732×540，与项目配置默认一致，配置面板可覆盖）
const PAD_HEADER_DEFAULTS = {
  reading: '/data/proj_1784885664471_5bauyu/assets/images/b5afe1419c6984b1585705bb.png',
  thinking: '/data/proj_1784885664471_5bauyu/assets/images/a7290e75f6df696780a9c1a8.png',
  aesthetic: '/data/proj_1784885664471_5bauyu/assets/images/8f598407250ef17e89c7fe36.png',
  english: '/data/proj_1784885664471_5bauyu/assets/images/819ffcef955c65b9b0443a21.png',
  writer: '/data/proj_1784885664471_5bauyu/assets/images/f97d1816e32cc062a3bdcff7.png',
};

function cap(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function PadHeaderPreview(props) {
  const p = props ;
  const activeSubject = (p.activeSubject ) || 'reading';

  const current = SUBJECTS.find((s) => s.key === activeSubject) || SUBJECTS[0];
  const bg =
    (p[`padHeaderBg${cap(current.key)}`] ) ||
    PAD_HEADER_DEFAULTS[current.key] ||
    '';

  return (
    _jsxs('div', {
      className: "relative w-full overflow-hidden rounded-[20px] bg-white"    ,
      style: { aspectRatio: '1366 / 744' },
 children: [
      /* 第 1 层：头图背景（有上传头图时优先显示上传图，否则回退科目渐变层；全屏铺底延伸到选中元素底部） */
      bg ? (
        _jsx('img', {
          src: bg,
          alt: `${current.label}Pad头图背景`,
          className: "absolute inset-0 h-full w-full object-cover object-top"     ,
          style: { zIndex: 2 },}
        )
      ) : (
        _jsx('img', {
          src: current.top,
          alt: `${current.label}Pad上层`,
          className: "absolute inset-0 h-full w-full object-cover"    ,
          style: { zIndex: 1 },}
        )
      )

      /* 第 2 层：科目 UI 前景图（Pad 版，按科目切换） */
      , _jsx('img', {
        src: current.ui,
        alt: `${current.label}课程UI`,
        className: "absolute inset-0 h-full w-full object-cover"    ,
        style: { zIndex: 3 },}
      )
    ]})
  );
}
