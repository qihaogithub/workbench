import fs from 'node:fs/promises';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const OUT = '/Users/qh2/Documents/PGM/1·Work/workbench/docs/营销/workbench上线宣讲.pptx';
const PREVIEW = '/Users/qh2/Documents/PGM/1·Work/workbench/.tmp/frontend-slides/rendered';

const W = 1280, H = 720;
const C = {
  ink: '#0B1220', navy: '#101B35', blue: '#2F80ED', cyan: '#55D6BE', yellow: '#F4C95D',
  white: '#FFFFFF', mist: '#F4F7FB', slate: '#64748B', line: '#D9E2F0', soft: '#EAF1FA', red: '#FF6B6B',
};

async function writeBlob(path, blob) { await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer())); }

function box(slide, x, y, w, h, fill = 'none', line = 'none', radius = 'none') {
  return slide.shapes.add({ geometry: radius === 'round' ? 'roundRect' : 'rect', position: { left: x, top: y, width: w, height: h }, fill, line: { style: 'solid', fill: line, width: line === 'none' ? 0 : 1 }, borderRadius: radius === 'round' ? 'rounded-xl' : undefined });
}
function text(slide, s, x, y, w, h, style = {}) {
  const sh = slide.shapes.add({ geometry: 'textbox', position: { left: x, top: y, width: w, height: h }, fill: 'none', line: { style: 'solid', fill: 'none', width: 0 } });
  sh.text = s;
  sh.text.style = { fontFamily: 'Aptos', fontSize: 18, color: C.ink, margin: 0, ...style };
  return sh;
}
function circle(slide, x, y, d, fill, label, labelStyle = {}) {
  slide.shapes.add({ geometry: 'ellipse', position: { left: x, top: y, width: d, height: d }, fill, line: { style: 'solid', fill, width: 0 } });
  if (label) text(slide, label, x, y + d * 0.24, d, d * 0.45, { alignment: 'center', ...labelStyle });
}
function arrow(slide, s, x, y, w, h, color = C.blue, size = 22) { text(slide, s, x, y, w, h, { fontSize: size, bold: true, color, alignment: 'center' }); }
function chrome(slide, n, section = 'ALL HANDS / ONEFLOW') {
  text(slide, section, 64, 24, 260, 18, { fontSize: 11, bold: true, color: C.blue, letterSpacing: 1.2 });
  text(slide, String(n).padStart(2, '0'), 1180, 24, 36, 18, { fontSize: 11, bold: true, color: C.slate, alignment: 'right' });
}
function title(slide, t, sub = '', dark = false) {
  text(slide, t, 64, 72, 860, 78, { fontSize: 36, bold: true, color: dark ? C.white : C.ink, breakLine: false });
  if (sub) text(slide, sub, 66, 151, 820, 36, { fontSize: 17, color: dark ? '#B9C7DF' : C.slate });
}
function pill(slide, s, x, y, w, fill, color = C.ink) { box(slide, x, y, w, 30, fill, 'none', 'round'); text(slide, s, x, y + 7, w, 16, { fontSize: 12, bold: true, color, alignment: 'center' }); }

function slide1(p) {
  const s = p.slides.add(); s.background.fill = C.navy; chrome(s, 1, 'ONEFLOW / LAUNCH');
  text(s, '每个活动，都不该从零开始', 64, 126, 720, 116, { fontSize: 52, bold: true, color: C.white });
  text(s, 'OneFlow 是面向运营活动的 AI 协作平台。', 68, 260, 520, 34, { fontSize: 22, color: '#C7D5EA' });
  pill(s, '目标 → 原型 → 配置 → 预览 → 上线 → 复用', 68, 330, 430, C.cyan, C.navy);
  const items = [['重复', '每次重新整理方案与原型', C.red], ['分散', '规范和经验散落各处', C.yellow], ['等待', '跨角色不断补上下文', C.blue]];
  items.forEach(([a,b,col], i) => { const x = 760 + (i % 1) * 0, y = 142 + i * 118; circle(s, 790, y, 50, col, String(i+1), { fontSize: 20, bold: true, color: C.navy }); text(s, a, 858, y - 2, 160, 28, { fontSize: 24, bold: true, color: C.white }); text(s, b, 858, y + 32, 300, 42, { fontSize: 15, color: '#B9C7DF' }); });
  box(s, 730, 520, 430, 2, C.blue); text(s, '把活动从“临时拼接”变成“连续交付”', 730, 548, 430, 32, { fontSize: 20, bold: true, color: C.white });
  return s;
}
function slide2(p) {
  const s = p.slides.add(); s.background.fill = C.mist; chrome(s, 2); title(s, '不用安装编程工具，也能参与 AI 创作和协作', 'OneFlow 不只是新增工具，而是一种新的协作方式。');
  box(s, 64, 230, 500, 330, '#FFFFFF', C.line, 'round'); box(s, 716, 230, 500, 330, C.navy, C.navy, 'round');
  text(s, '过去：上下文分散', 96, 264, 320, 34, { fontSize: 23, bold: true, color: C.ink });
  [['文档', 104, 348], ['对话', 232, 410], ['文件', 360, 350], ['个人工具', 180, 485]].forEach(([l,x,y]) => { pill(s, l, x, y, 110, C.soft, C.slate); });
  arrow(s, '→', 586, 356, 100, 60, C.blue, 42);
  text(s, '现在：一个 OneFlow 项目', 748, 264, 390, 34, { fontSize: 23, bold: true, color: C.white });
  const labels = ['目标', '对话', '页面', '配置', '资源', '预览'];
  labels.forEach((l,i) => { const x = 760 + (i%3)*132, y = 350 + Math.floor(i/3)*72; pill(s, l, x, y, 104, i===5 ? C.cyan : '#243458', i===5 ? C.navy : C.white); });
  text(s, '同一份项目上下文，让不同角色在线协作。', 748, 514, 410, 38, { fontSize: 17, color: '#B9C7DF' });
  return s;
}
function slide3(p) {
  const s = p.slides.add(); s.background.fill = C.white; chrome(s, 3); title(s, '从临时拼接，变成连续交付', 'AI 承接可规则化的执行，人保留判断、标准和例外。');
  text(s, '过去', 74, 230, 120, 30, { fontSize: 22, bold: true, color: C.red });
  text(s, '提出目标', 168, 288, 120, 24, { fontSize: 16, bold: true }); arrow(s, '→', 286, 283, 55, 30, C.slate, 22); text(s, '人工整理', 350, 288, 120, 24, { fontSize: 16, bold: true }); arrow(s, '→', 468, 283, 55, 30, C.slate, 22); text(s, '反复确认', 532, 288, 120, 24, { fontSize: 16, bold: true }); arrow(s, '→', 650, 283, 55, 30, C.slate, 22); text(s, '开发重解', 714, 288, 120, 24, { fontSize: 16, bold: true }); arrow(s, '→', 832, 283, 55, 30, C.slate, 22); text(s, '上线', 896, 288, 90, 24, { fontSize: 16, bold: true });
  text(s, '沟通 / 等待 / 返工', 168, 350, 320, 26, { fontSize: 18, bold: true, color: C.red });
  box(s, 64, 398, 1152, 2, C.line);
  text(s, '现在', 74, 430, 120, 30, { fontSize: 22, bold: true, color: C.blue });
  const flow = ['输入目标', 'AI 整合知识', '可交互原型', '配置与资源', '在线预览', '精准接入', '复盘沉淀'];
  flow.forEach((l,i) => { const x = 160 + i*145; circle(s, x, 486, 42, i===6 ? C.cyan : C.blue, String(i+1), { fontSize: 16, bold: true, color: i===6 ? C.navy : C.white }); text(s, l, x-30, 544, 104, 36, { fontSize: 14, bold: true, alignment: 'center' }); if (i<flow.length-1) arrow(s, '→', x+45, 495, 65, 24, C.blue, 20); });
  return s;
}
function slide4(p) {
  const s = p.slides.add(); s.background.fill = C.navy; chrome(s, 4); title(s, '不是替代谁，而是减少重复工作', '每个角色都继续做判断，只是少一点搬运、对齐和返工。', true);
  const roles = [['策划', '方案更快可讨论', C.cyan], ['产品', '规则沉淀可复用', C.yellow], ['设计', '资源在真实页面验证', C.blue], ['开发', '直接读取完整上下文', C.red]];
  roles.forEach(([r,b,col],i) => { const x = 72 + i*286; circle(s, x, 266, 60, col, r, { fontSize: 17, bold: true, color: C.navy }); text(s, b, x, 352, 210, 50, { fontSize: 19, bold: true, color: C.white }); text(s, ['输入目标与限制', '定义能力与验收', '制作并校验资源', '评估与接入'][i], x, 420, 210, 36, { fontSize: 15, color: '#B9C7DF' }); if (i<3) arrow(s, '→', x+220, 286, 56, 30, '#6279A3', 24); });
  box(s, 72, 540, 1120, 2, '#33466D'); text(s, '共同变化：人负责判断和标准，AI 负责执行、整合和自助答疑。', 72, 566, 1120, 36, { fontSize: 21, bold: true, color: C.cyan });
  return s;
}
function slide5(p) {
  const s = p.slides.add(); s.background.fill = C.mist; chrome(s, 5); title(s, '一个可交互原型，成为团队共同语言', '聊天记录会结束，原型会继续承载目标、规则、资源和开发上下文。');
  box(s, 380, 232, 520, 310, C.navy, C.navy, 'round');
  text(s, 'ONEFLOW', 416, 262, 180, 24, { fontSize: 12, bold: true, color: C.cyan, letterSpacing: 1.4 });
  text(s, '活动原型', 416, 306, 300, 44, { fontSize: 32, bold: true, color: C.white });
  text(s, '页面 · 文案 · 状态 · 配置 · 资源 · 预览', 416, 364, 380, 30, { fontSize: 16, color: '#C7D5EA' });
  box(s, 416, 432, 430, 50, '#243458', 'none', 'round'); text(s, '一次生成页面与上下文，减少跨文档同步', 438, 448, 388, 20, { fontSize: 15, bold: true, color: C.white });
  const tags = [['策划', 120, 278], ['产品', 170, 472], ['设计', 934, 276], ['运营', 996, 440], ['开发', 892, 560]];
  tags.forEach(([l,x,y],i) => { pill(s, l, x, y, 100, i%2 ? C.yellow : C.cyan, C.navy); arrow(s, i<2 ? '↗' : '↙', x<300 ? x+102 : x-54, y+3, 46, 24, C.blue, 22); });
  return s;
}
function slide6(p) {
  const s = p.slides.add(); s.background.fill = C.white; chrome(s, 6); title(s, '上传资源，就能看到它在真实页面中的效果', '设计交付不止于素材文件，而是直接验证素材在页面中的可用性。');
  const steps = [['01', '看配置', '确认尺寸、格式与状态'], ['02', '读规范', '读取项目内的资源规则'], ['03', '传资源', '图片 / 动效 / 音效'], ['04', '看预览', '实时看到页面效果'], ['05', '再验收', '调整并确认可用']];
  steps.forEach(([n,a,b],i) => { const x = 64 + i*232; box(s, x, 258, 198, 220, i===3 ? C.navy : C.mist, i===3 ? C.navy : C.line, 'round'); circle(s, x+24, 286, 38, i===3 ? C.cyan : C.blue, n, { fontSize: 12, bold: true, color: i===3 ? C.navy : C.white }); text(s, a, x+24, 348, 140, 32, { fontSize: 22, bold: true, color: i===3 ? C.white : C.ink }); text(s, b, x+24, 394, 150, 52, { fontSize: 14, color: i===3 ? '#C7D5EA' : C.slate }); if (i<4) arrow(s, '→', x+196, 348, 36, 30, C.blue, 22); });
  pill(s, '资源 + 页面 + 规范 = 一次验证', 420, 548, 440, C.cyan, C.navy);
  return s;
}
function slide7(p) {
  const s = p.slides.add(); s.background.fill = C.navy; chrome(s, 7); title(s, 'AI 不只回答问题，还参与完成活动', '它有依据地执行、整合和答疑，人负责最终判断。', true);
  const layers = [['01', '执行', '生成方案、原型、配置清单和资源清单', C.blue], ['02', '整合', '结合产品能力、视觉规范、历史经验和开发边界', C.cyan], ['03', '自助答疑', '回答能不能做、怎么配置、资源怎么准备、如何接入', C.yellow]];
  layers.forEach(([n,a,b,col],i) => { const y = 238 + i*112; box(s, 104, y, 920, 80, '#18284A', '#2C416B', 'round'); circle(s, 126, y+18, 42, col, n, { fontSize: 13, bold: true, color: C.navy }); text(s, a, 194, y+19, 160, 30, { fontSize: 23, bold: true, color: C.white }); text(s, b, 370, y+22, 612, 32, { fontSize: 16, color: '#C7D5EA' }); });
  text(s, '人：判断 / 标准 / 例外', 104, 610, 300, 28, { fontSize: 18, bold: true, color: C.cyan }); text(s, 'AI：执行 / 整合 / 自助答疑', 800, 610, 320, 28, { fontSize: 18, bold: true, color: C.yellow, alignment: 'right' });
  return s;
}
function slide8(p) {
  const s = p.slides.add(); s.background.fill = C.mist; chrome(s, 8); title(s, '从活动目标，到上线复盘，一条链路完成', '一次活动不仅完成交付，还会为下一次活动留下可复用资产。');
  const flow = ['模板与知识', '活动目标', 'AI 方案', '交互原型', '配置与资源', '在线预览', '开发接入', '验收上线', '经验回流'];
  flow.forEach((l,i) => { const x = 74 + (i%5)*236, y = 250 + Math.floor(i/5)*152; box(s, x, y, 188, 62, i===8 ? C.cyan : C.white, i===8 ? C.cyan : C.line, 'round'); text(s, l, x, y+20, 188, 24, { fontSize: 16, bold: true, color: i===8 ? C.navy : C.ink, alignment: 'center' }); if (i<flow.length-1) { const nx=74+((i+1)%5)*236, ny=250+Math.floor((i+1)/5)*152; if (i%5<4) arrow(s, '→', x+190, y+17, 42, 24, C.blue, 20); else arrow(s, '↓', x+82, y+68, 30, 48, C.blue, 22); } });
  text(s, '下一次活动，从“模板与知识”继续开始。', 330, 612, 620, 30, { fontSize: 20, bold: true, color: C.blue, alignment: 'center' });
  return s;
}
function slide9(p) {
  const s = p.slides.add(); s.background.fill = C.white; chrome(s, 9); title(s, '先用一个真实活动，验证完整闭环', '本次全员宣讲只讲清边界；逐项操作教程放到后续培训。');
  box(s, 64, 238, 500, 292, C.navy, C.navy, 'round'); text(s, '当前可用能力', 96, 270, 260, 30, { fontSize: 23, bold: true, color: C.white });
  ['活动模板与项目规范', 'AI 原型与配置清单', '资源上传与实时预览', '在线协作与开发接入'].forEach((l,i)=>{ circle(s, 100, 334+i*42, 16, C.cyan, '', {}); text(s, l, 132, 330+i*42, 360, 24, { fontSize: 16, color: '#C7D5EA' }); });
  box(s, 716, 238, 500, 292, C.mist, C.line, 'round'); text(s, '试点选择标准', 748, 270, 260, 30, { fontSize: 23, bold: true, color: C.ink });
  ['真实业务，范围可控', '多角色参与，有明确上线时间', '有复用价值，能沉淀经验'].forEach((l,i)=>{ circle(s, 752, 334+i*48, 16, C.blue, String(i+1), { fontSize: 10, bold: true, color: C.white }); text(s, l, 784, 330+i*48, 370, 24, { fontSize: 16, color: C.ink }); });
  pill(s, '验收：原型可用 · 沟通减少 · 能完成上线', 290, 582, 700, C.yellow, C.navy);
  return s;
}
function slide10(p) {
  const s = p.slides.add(); s.background.fill = C.navy; chrome(s, 10, 'ONEFLOW / NEXT');
  text(s, '选择一个真实活动，跑完第一条 OneFlow 工作流', 64, 108, 920, 110, { fontSize: 44, bold: true, color: C.white });
  text(s, '先跑通一个闭环，再把有效方法扩展到更多活动。', 68, 236, 700, 34, { fontSize: 21, color: '#C7D5EA' });
  const actions = [['01', '确定试点', '活动 + 负责人'], ['02', '补齐上下文', '策划 / 产品 / 设计 / 开发'], ['03', '完成闭环', '原型 · 预览 · 评审 · 复盘'], ['04', '沉淀复用', '模板 · 规范 · 经验']];
  actions.forEach(([n,a,b],i)=>{ const x=72+i*280; circle(s,x,384,50,i===3?C.yellow:C.cyan,n,{fontSize:15,bold:true,color:C.navy}); text(s,a,x,462,220,30,{fontSize:21,bold:true,color:C.white}); text(s,b,x,502,220,40,{fontSize:15,color:'#B9C7DF'}); if(i<3) arrow(s,'→',x+220,397,52,26,'#6881AE',22); });
  box(s, 72, 612, 1120, 2, '#33466D'); text(s, '今天就开始：把下一场活动放进 OneFlow。', 72, 636, 720, 28, { fontSize: 20, bold: true, color: C.cyan }); text(s, '入口 / 联系人 / 时间：待补充', 920, 638, 272, 24, { fontSize: 14, color: '#9EB0CE', alignment: 'right' });
  return s;
}

async function main() {
  await fs.mkdir(PREVIEW, { recursive: true });
  const p = Presentation.create({ slideSize: { width: W, height: H } });
  [slide1,slide2,slide3,slide4,slide5,slide6,slide7,slide8,slide9,slide10].forEach(fn => fn(p));
  for (const [i, s] of p.slides.items.entries()) { const png = await p.export({ slide: s, format: 'png', scale: 1 }); await writeBlob(`${PREVIEW}/slide-${String(i+1).padStart(2,'0')}.png`, png); }
  const montage = await p.export({ format: 'webp', montage: true, scale: 1 }); await writeBlob(`${PREVIEW}/montage.webp`, montage);
  const pptx = await PresentationFile.exportPptx(p); await pptx.save(OUT);
  console.log(`saved ${OUT}`);
}
main().catch(err => { console.error(err); process.exitCode = 1; });
