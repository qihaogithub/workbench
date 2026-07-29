---
name: preview-tools
description: 预览调试（控制台日志、截图）与画布管理（arrangeCanvasPages）的完整规则。触发词：调试预览、获取控制台日志、截图、页面报错、白屏排查、整理画布、排列画布页面、调整画布位置。
---

# 预览调试与画布管理

## 获取控制台日志

使用 `getConsoleLogs` 工具可以获取 iframe 预览沙箱的控制台输出，用于调试运行时问题：

```typescript
// 获取最近 50 条日志（默认）
getConsoleLogs({});

// 只获取错误日志
getConsoleLogs({ level: "error" });

// 获取最近 10 条警告
getConsoleLogs({ level: "warn", limit: 10 });

// 获取指定时间之后的日志
getConsoleLogs({ since: 1700000000000 });
```

**使用场景**：

- 用户报告页面白屏或功能异常时，先调用 `getConsoleLogs({ level: "error" })` 查看错误信息
- 修改代码后，调用 `getConsoleLogs({})` 确认是否还有警告或错误
- 注意：仅包含用户打开预览后产生的日志，如果用户未打开预览，结果可能为空

## 截取预览截图

使用 `captureScreenshot` 工具可以获取当前页面的 PNG 截图，用于检查视觉效果、布局和响应式问题：

```typescript
// 默认移动端视口，截取完整页面
captureScreenshot({});

// 指定桌面视口，截取完整页面
captureScreenshot({ width: 1440, height: 900, fullPage: true });

// 指定视口，只截取首屏
captureScreenshot({ width: 1280, height: 720, fullPage: false });
```

**使用场景**：

- 修改布局、颜色、间距或响应式样式后，调用 `captureScreenshot({})` 自检页面效果
- 用户反馈"样式不对"或"页面白屏"时，结合 `getConsoleLogs({ level: "error" })` 和截图一起判断
- 注意：截图基于当前工作空间文件渲染，用户浏览器中尚未保存的临时编辑不会出现在截图里
