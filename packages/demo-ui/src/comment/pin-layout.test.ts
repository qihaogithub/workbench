import { describe, it, expect } from "vitest";
import {
  computePrototypePinPosition,
  computePrototypePinRatio,
  computePrototypeScale,
} from "./pin-layout";

// 设计宽 375、缩放 0.5 → 盒宽 187.5；内容高 1200（可滚动）
const BASE = {
  offsetWidth: 375,
  scrollWidth: 375,
  scrollHeight: 1200,
  scrollLeft: 0,
  scrollTop: 0,
  rect: { left: 200, top: 100, width: 187.5, height: 600 },
  containerRect: { left: 0, top: 0, width: 0, height: 0 },
};

describe("computePrototypeScale", () => {
  it("用盒宽 / 布局宽求出缩放系数", () => {
    expect(computePrototypeScale(187.5, 375)).toBe(0.5);
  });

  it("盒宽或布局宽为 0 时回退为 1", () => {
    expect(computePrototypeScale(0, 375)).toBe(1);
    expect(computePrototypeScale(187.5, 0)).toBe(1);
  });
});

describe("computePrototypePinRatio / computePrototypePinPosition", () => {
  it("非滚动页：点击位置往返一致，且与旧行为一致", () => {
    // 内容高度 = 设计高（scrollHeight == 盒高 1200，scrollTop = 0），不发生内部滚动
    const nonScroll = { ...BASE, scrollTop: 0 };
    // 点击可见盒内 (x=300, y=400) → 相对盒内 (100, 300)，换算成内容坐标 (200, 600)
    const ratio = computePrototypePinRatio({
      ...nonScroll,
      clientX: 300,
      clientY: 400,
    });
    expect(ratio.xRatio).toBeCloseTo(200 / 375, 5);
    expect(ratio.yRatio).toBeCloseTo(600 / 1200, 5);
    // 渲染回原位
    const pos = computePrototypePinPosition({ ...nonScroll, pin: ratio });
    expect(pos.left).toBeCloseTo(300, 5);
    expect(pos.top).toBeCloseTo(400, 5);
    // 与旧公式（yRatio * 盒高）在非滚动场景一致
    expect(pos.top).toBeCloseTo(100 + ratio.yRatio * 600, 5);
  });

  it("滚动页：点击时按内容坐标存储，未滚动时渲染回点击位置", () => {
    const metrics = { ...BASE, scrollTop: 300 };
    const ratio = computePrototypePinRatio({
      ...metrics,
      clientX: 300,
      clientY: 400,
    });
    // 内容坐标：x=(300-200)/0.5=200 → 200/375；y=(300+(400-100)/0.5)=900 → 900/1200
    expect(ratio.xRatio).toBeCloseTo(200 / 375, 5);
    expect(ratio.yRatio).toBeCloseTo(900 / 1200, 5);
    // 同滚动位置渲染回点击处
    const pos = computePrototypePinPosition({ ...metrics, pin: ratio });
    expect(pos.left).toBeCloseTo(300, 5);
    expect(pos.top).toBeCloseTo(400, 5);
  });

  it("滚动页：继续滚动后 pin 跟随元素移动", () => {
    const created = {
      ...BASE,
      scrollTop: 300,
    };
    const ratio = computePrototypePinRatio({
      ...created,
      clientX: 300,
      clientY: 400,
    });
    // 元素在内容 y=900；滚到 600 后视口内变为 900-600=300 → 屏幕 100+300*0.5=250
    const scrolled = computePrototypePinPosition({
      ...BASE,
      scrollTop: 600,
      pin: ratio,
    });
    expect(scrolled.top).toBeCloseTo(250, 5);
    // 未修复时（按盒高比例）会固定在 550，与元素 250 产生偏差
  });

  it("横向滚动也跟随 scrollLeft", () => {
    const ratio = computePrototypePinRatio({
      ...BASE,
      clientX: 300,
      clientY: 400,
      scrollWidth: 800,
    });
    const pos = computePrototypePinPosition({
      ...BASE,
      scrollWidth: 800,
      scrollLeft: 100,
      pin: ratio,
    });
    // x=(300-200)/0.5=200 → 200/800；滚 100 后视口 200-100=100 → 200+100*0.5=250
    expect(pos.left).toBeCloseTo(250, 5);
  });

  it("比例越界时钳制到 0~1", () => {
    const ratio = computePrototypePinRatio({
      ...BASE,
      clientX: 100000,
      clientY: -100000,
    });
    expect(ratio.xRatio).toBe(1);
    expect(ratio.yRatio).toBe(0);
  });
});