import {jsxs as _jsxs, jsx as _jsx} from "/data/proj_1784885664471_5bauyu/preview-runtime/vendor/react-jsx-runtime.js";

// 各科目手机 UI 图（来自「头图背景预览_files」素材，750×1624）
const SUBJECTS = [
  { key: 'reading', label: '阅读', ui: '/data/proj_1784885664471_5bauyu/assets/images/fae5f2f7aa34cbafda4dfb2d.png' },
  { key: 'thinking', label: '思维', ui: '/data/proj_1784885664471_5bauyu/assets/images/2f15f3af52311050e1e3fce0.png' },
  { key: 'aesthetic', label: '美育', ui: '/data/proj_1784885664471_5bauyu/assets/images/284052584bc7db4366d36a5c.png' },
  { key: 'english', label: '英语', ui: '/data/proj_1784885664471_5bauyu/assets/images/599174b5007690c289cdde1d.png' },
  { key: 'writer', label: '小作家', ui: '/data/proj_1784885664471_5bauyu/assets/images/a5f19b5ab480cb6b695edbc0.png' },
];

// 各科目手机头图默认背景（750×540，与项目配置默认一致，配置面板可覆盖）
const HEADER_DEFAULTS = {
  reading: '/data/proj_1784885664471_5bauyu/assets/images/dffe5901b6f1a8b2346391df.png',
  thinking: '/data/proj_1784885664471_5bauyu/assets/images/c730d8a3005a8870a5b443ba.png',
  aesthetic: '/data/proj_1784885664471_5bauyu/assets/images/63fdee7805cfb8918e1e71b6.png',
  english: '/data/proj_1784885664471_5bauyu/assets/images/df671bfa55be442520563abc.png',
  writer: '/data/proj_1784885664471_5bauyu/assets/images/c8b90413e4094aef700109a5.png',
};

function cap(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function MobileHeaderPreview(props) {
  const p = props ;
  const subject = (p.activeSubject ) || 'reading';

  const current = SUBJECTS.find((s) => s.key === subject) || SUBJECTS[0];
  const bg =
    (p[`headerBg${cap(current.key)}`] ) ||
    HEADER_DEFAULTS[current.key] ||
    '';

  return (
    _jsxs('div', {
      className: "relative overflow-hidden bg-white"  ,
      style: { width: 375, height: 812 },
 children: [
      /* 第 1 层：上传的头图背景（750×540，宽度撑满页面宽度，高度按原比例 270px，顶部对齐，透过 UI 图顶部镂空显示） */
      bg ? (
        _jsx('img', {
          src: bg,
          alt: `${current.label}手机头图背景`,
          className: "absolute left-0 top-0 w-full object-cover object-top"     ,
          style: { zIndex: 1, height: 270 },}
        )
      ) : null

      /* 第 2 层：手机 UI 图（整屏，顶部头图区域为透明镂空） */
      , _jsx('img', {
        src: current.ui,
        alt: `${current.label}手机UI`,
        className: "absolute inset-0 h-full w-full object-cover"    ,
        style: { zIndex: 2 },}
      )
    ]})
  );
}
