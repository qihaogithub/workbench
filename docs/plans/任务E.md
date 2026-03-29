## 任务 E：集成联调与端到端测试
**目标**：将任务A-D的产出进行集成联调，完成端到端测试，确保系统整体可用。
**前置说明**：此任务需在任务A-D基本完成后开始，是项目交付前的最后环节。

### 1. 核心职责

#### 1.1 API 与前端联调
*   任务B 前端替换 Mock 数据为真实 API 调用
*   验证所有 API 端点的请求/响应格式符合契约
*   处理错误响应的 UI 展示（Toast、错误页面等）

#### 1.2 组件集成
*   任务D 复用任务C 的 `PreviewPanel` 和 `ConfigForm` 组件
*   任务B 的路由页面接入任务C 和任务D 的组件
*   验证组件间的数据流动正确

#### 1.3 端到端测试
*   编写 E2E 测试覆盖核心用户流程
*   验证草稿工作区的完整生命周期
*   测试并发编辑场景

### 2. 集成检查清单

#### 2.1 API 集成检查

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| GET /api/demos 返回正确格式 | 单元测试 | ⬜ |
| POST /api/demos 创建目录成功 | 手动测试 | ⬜ |
| DELETE /api/demos/[id] 删除成功 | 手动测试 | ⬜ |
| Session 创建/读取/合并/删除 | 集成测试 | ⬜ |
| 错误响应格式统一 | 单元测试 | ⬜ |
| 并发请求处理 | 压力测试 | ⬜ |

#### 2.2 组件集成检查

| 检查项 | 验证方法 | 状态 |
|--------|----------|------|
| PreviewPanel 接收 code 正确渲染 | 视觉测试 | ⬜ |
| PreviewPanel 接收 configData 实时更新 | 交互测试 | ⬜ |
| ConfigForm 根据 schema 生成表单 | 视觉测试 | ⬜ |
| ConfigForm onChange 回调正确触发 | 单元测试 | ⬜ |
| CodeEditor 解析/构建格式正确 | 单元测试 | ⬜ |
| 校验错误正确展示 | 视觉测试 | ⬜ |

#### 2.3 页面集成检查

| 页面 | 检查项 | 状态 |
|------|--------|------|
| 首页 `/` | Demo 列表正确展示 | ⬜ |
| 首页 `/` | 搜索过滤功能 | ⬜ |
| 首页 `/` | 新建 Demo 流程 | ⬜ |
| 首页 `/` | 删除 Demo 确认 | ⬜ |
| Demo 使用页 `/demo/[id]` | 预览+配置联动 | ⬜ |
| Demo 使用页 `/demo/[id]` | 编辑入口跳转 | ⬜ |
| AI 编辑工作台 `/demo/[id]/edit` | 三栏布局正确 | ⬜ |
| AI 编辑工作台 `/demo/[id]/edit` | Session 创建/保存/放弃 | ⬜ |

### 3. 端到端测试用例

#### 3.1 UI 设计师创建 Demo 流程

```typescript
describe('UI 设计师创建 Demo', () => {
  it('应完成从新建到保存的完整流程', async () => {
    // 1. 访问首页
    await page.goto('/');
    
    // 2. 点击新建 Demo
    await page.click('[data-testid="create-demo-btn"]');
    
    // 3. 输入 Demo 名称
    await page.fill('[data-testid="demo-name-input"]', '测试 Banner');
    await page.click('[data-testid="confirm-create-btn"]');
    
    // 4. 验证跳转到编辑页
    await expect(page).toHaveURL(/\/demo\/demo-\d+\/edit/);
    
    // 5. 粘贴 Figma 导出内容
    const editor = await page.locator('[data-testid="code-editor"]');
    await editor.fill(mockFigmaExport);
    
    // 6. 验证预览区更新
    await expect(page.locator('[data-testid="preview-panel"]')).toBeVisible();
    
    // 7. 点击保存
    await page.click('[data-testid="save-btn"]');
    
    // 8. 验证返回首页
    await expect(page).toHaveURL('/');
    
    // 9. 验证新 Demo 出现在列表
    await expect(page.locator('text=测试 Banner')).toBeVisible();
  });
});
```

#### 3.2 运营设计师使用 Demo 流程

```typescript
describe('运营设计师使用 Demo', () => {
  it('应完成配置和预览流程', async () => {
    // 1. 访问首页
    await page.goto('/');
    
    // 2. 点击某个 Demo 的"使用"按钮
    await page.click('[data-testid="demo-1-use-btn"]');
    
    // 3. 验证跳转到使用页
    await expect(page).toHaveURL('/demo/demo-1');
    
    // 4. 修改配置表单
    await page.fill('[data-testid="config-title-input"]', '新标题');
    
    // 5. 验证预览区实时更新
    const preview = await page.locator('[data-testid="preview-panel"]');
    await expect(preview.locator('text=新标题')).toBeVisible();
    
    // 6. 点击编辑入口
    await page.click('[data-testid="edit-btn"]');
    
    // 7. 验证跳转到编辑页
    await expect(page).toHaveURL('/demo/demo-1/edit');
  });
});
```

#### 3.3 草稿工作区生命周期测试

```typescript
describe('草稿工作区管理', () => {
  it('应正确处理 Session 的创建和放弃', async () => {
    // 1. 进入编辑页，验证 Session 创建
    await page.goto('/demo/demo-1/edit');
    const sessionId = await page.evaluate(() => 
      localStorage.getItem('currentSessionId')
    );
    expect(sessionId).toBeTruthy();
    
    // 2. 修改代码
    await page.fill('[data-testid="code-editor"]', modifiedCode);
    
    // 3. 点击放弃修改
    await page.click('[data-testid="discard-btn"]');
    
    // 4. 确认放弃
    await page.click('[data-testid="confirm-discard-btn"]');
    
    // 5. 验证返回首页
    await expect(page).toHaveURL('/');
    
    // 6. 再次进入编辑页，验证原内容未变
    await page.goto('/demo/demo-1/edit');
    const editorContent = await page.inputValue('[data-testid="code-editor"]');
    expect(editorContent).not.toContain('modified');
  });
  
  it('应正确处理 Session 的保存合并', async () => {
    // 1. 进入编辑页
    await page.goto('/demo/demo-1/edit');
    
    // 2. 修改代码
    await page.fill('[data-testid="code-editor"]', savedCode);
    
    // 3. 点击保存
    await page.click('[data-testid="save-btn"]');
    
    // 4. 验证返回首页
    await expect(page).toHaveURL('/');
    
    // 5. 再次进入使用页，验证修改生效
    await page.goto('/demo/demo-1');
    const preview = await page.locator('[data-testid="preview-panel"]');
    await expect(preview).toContainText('saved');
  });
});
```

### 4. 性能测试

| 测试项 | 指标 | 目标值 |
|--------|------|--------|
| 首页加载时间 | LCP | < 2s |
| Sandpack 首次渲染 | TTI | < 1s |
| 配置变更响应 | 延迟 | < 100ms |
| API 响应时间 | P95 | < 200ms |
| 并发 Session 创建 | 成功率 | 100% (10并发) |

### 5. 兼容性测试

| 测试项 | 范围 |
|--------|------|
| 浏览器兼容 | Chrome, Firefox, Safari, Edge 最新两个版本 |
| 响应式布局 | 1920px, 1440px, 1280px, 1024px |
| 深色/浅色主题 | 两种主题切换正常 |

### 6. 集成问题记录模板

```markdown
## 问题 #N

**发现时间**：YYYY-MM-DD
**发现阶段**：API联调 / 组件集成 / 页面集成 / E2E测试
**问题描述**：[详细描述问题现象]
**影响范围**：[影响的页面或功能]
**根本原因**：[问题根因分析]
**解决方案**：[如何修复]
**验证结果**：[修复后的验证情况]
```

### 7. DoD (完成标准)

*   所有 API 端点与前端正确对接，错误处理完善
*   任务C 组件被任务D 正确复用
*   所有页面路由跳转正常，布局正确
*   E2E 测试覆盖核心用户流程，全部通过
*   性能指标达到目标值
*   无 P0/P1 级别遗留问题

### 8. 交付物清单

| 交付物 | 说明 |
|--------|------|
| 集成测试报告 | 包含所有检查项的测试结果 |
| E2E 测试代码 | Playwright 测试脚本 |
| 性能测试报告 | Lighthouse 和自定义性能测试结果 |
| 问题修复记录 | 集成过程中发现和修复的问题清单 |
| 部署文档 | Docker 部署指南 |

---
