# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-test-project-flow.spec.ts >> 项目创建和代码编辑完整流程 >> 完整流程: 打开首页 -> 新建项目 -> 编辑代码 -> 保存
- Location: e2e-test-project-flow.spec.ts:162:7

# Error details

```
Error: 未找到代码编辑器
```

# Test source

```ts
  236 |         page.locator('textarea').first(),
  237 |       ];
  238 | 
  239 |       let nameInput = null;
  240 |       for (const selector of nameInputSelectors) {
  241 |         if (await selector.isVisible({ timeout: 3000 }).catch(() => false)) {
  242 |           nameInput = selector;
  243 |           logger.log(`找到输入框`);
  244 |           break;
  245 |         }
  246 |       }
  247 | 
  248 |       if (!nameInput) {
  249 |         // 尝试点击对话框主体让它获取焦点
  250 |         const dialog = page.locator('[role="dialog"], [class*="dialog"], [class*="modal"]').first();
  251 |         if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
  252 |           await dialog.click();
  253 |           await page.waitForTimeout(500);
  254 |         }
  255 |         // 再试一次
  256 |         nameInput = page.locator('input[type="text"], input, textarea').first();
  257 |       }
  258 | 
  259 |       await nameInput.fill(projectName);
  260 |       logger.log(`已填写项目名称: ${projectName}`);
  261 | 
  262 |       // 点击确认/创建按钮
  263 |       const confirmButton = page.getByRole('button', { name: /创建|确认|确定|create/i });
  264 |       await confirmButton.click();
  265 |       logger.success('已创建项目');
  266 | 
  267 |       await page.waitForTimeout(2000);
  268 | 
  269 |       // ========== 步骤 3: 打开项目编辑页 ==========
  270 |       logger.step('3', '等待并打开项目编辑页');
  271 | 
  272 |       // 等待项目创建完成并导航到编辑页
  273 |       await page.waitForLoadState('networkidle');
  274 |       await page.waitForTimeout(2000);
  275 | 
  276 |       // 尝试点击编辑按钮或直接导航到编辑页
  277 |       const editButton = page.getByRole('button', { name: /编辑|edit/i })
  278 |         .or(page.getByText(/编辑/i))
  279 |         .first();
  280 | 
  281 |       if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
  282 |         await editButton.click();
  283 |         logger.success('已点击编辑按钮');
  284 |       }
  285 | 
  286 |       await page.waitForTimeout(2000);
  287 | 
  288 |       // 截图保存编辑页状态
  289 |       await page.screenshot({ path: screenshot(`02-edit-page-${Date.now()}.png`) });
  290 |       logger.log('已保存编辑页截图');
  291 | 
  292 |       // ========== 步骤 4: 粘贴模板代码到代码编辑区 ==========
  293 |       logger.step('4', '将预设内容粘贴到代码编辑区');
  294 | 
  295 |       // 查找代码编辑器区域
  296 |       // 可能是 CodeMirror, Monaco, 或其他编辑器
  297 |       const editorSelectors = [
  298 |         '.cm-editor',
  299 |         '.cm-content',
  300 |         '[class*="editor"]',
  301 |         'textarea',
  302 |         'pre',
  303 |         '[contenteditable="true"]'
  304 |       ];
  305 | 
  306 |       let editorFound = false;
  307 |       for (const selector of editorSelectors) {
  308 |         const editor = page.locator(selector).first();
  309 |         if (await editor.isVisible({ timeout: 2000 }).catch(() => false)) {
  310 |           logger.log(`找到编辑器: ${selector}`);
  311 | 
  312 |           // 点击编辑器获取焦点
  313 |           await editor.click();
  314 |           await page.waitForTimeout(500);
  315 | 
  316 |           // 使用 Ctrl+A 全选，然后粘贴新内容
  317 |           await page.keyboard.press('Control+a');
  318 |           await page.waitForTimeout(200);
  319 | 
  320 |           // 将模板代码写入剪贴板并粘贴
  321 |           await page.evaluate((code: string) => {
  322 |             navigator.clipboard.writeText(code);
  323 |           }, TEMPLATE_CODE);
  324 | 
  325 |           await page.keyboard.press('Control+v');
  326 |           await page.waitForTimeout(500);
  327 | 
  328 |           editorFound = true;
  329 |           logger.success('已粘贴模板代码到编辑器');
  330 |           break;
  331 |         }
  332 |       }
  333 | 
  334 |       if (!editorFound) {
  335 |         logger.error('编辑器', new Error('未找到代码编辑器'));
> 336 |         throw new Error('未找到代码编辑器');
      |               ^ Error: 未找到代码编辑器
  337 |       }
  338 | 
  339 |       // 截图保存粘贴后的状态
  340 |       await page.screenshot({ path: screenshot(`03-code-pasted-${Date.now()}.png`) });
  341 |       logger.log('已保存粘贴代码后的截图');
  342 | 
  343 |       // ========== 步骤 5: 点击保存按钮 ==========
  344 |       logger.step('5', '点击保存按钮');
  345 | 
  346 |       // 查找保存按钮
  347 |       const saveButton = page.getByRole('button', { name: /保存|save/i })
  348 |         .or(page.getByText(/保存/))
  349 |         .or(page.locator('button').filter({ hasText: /保存/i }))
  350 |         .first();
  351 | 
  352 |       await saveButton.click();
  353 |       logger.success('已点击保存按钮');
  354 | 
  355 |       // 等待保存完成
  356 |       await page.waitForTimeout(2000);
  357 | 
  358 |       // 截图保存最终状态
  359 |       await page.screenshot({ path: screenshot(`04-saved-${Date.now()}.png`) });
  360 |       logger.log('已保存最终状态截图');
  361 | 
  362 |       // ========== 步骤 6: 删除项目 ==========
  363 |       logger.step('6', '删除项目');
  364 | 
  365 |       // 点击返回或找到项目列表
  366 |       const backButton = page.getByRole('button', { name: /返回|back/i })
  367 |         .or(page.getByText(/返回/))
  368 |         .or(page.locator('button').filter({ hasText: /返回/i }))
  369 |         .first();
  370 | 
  371 |       if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
  372 |         await backButton.click();
  373 |         logger.log('已点击返回按钮');
  374 |         await page.waitForTimeout(1000);
  375 |       }
  376 | 
  377 |       // 找到删除按钮（通常是更多操作菜单中的删除选项）
  378 |       const deleteButton = page.getByRole('button', { name: /删除|delete|remove/i })
  379 |         .or(page.getByText(/删除/))
  380 |         .or(page.locator('button').filter({ hasText: /删除/i }))
  381 |         .first();
  382 | 
  383 |       if (await deleteButton.isVisible({ timeout: 5000 }).catch(() => false)) {
  384 |         await deleteButton.click();
  385 |         logger.log('已点击删除按钮');
  386 |         await page.waitForTimeout(500);
  387 | 
  388 |         // 确认删除操作
  389 |         const confirmDeleteButton = page.getByRole('button', { name: /确认|确定|是|删除/i })
  390 |           .or(page.getByText(/确认删除|确定删除/i))
  391 |           .first();
  392 | 
  393 |         if (await confirmDeleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
  394 |           await confirmDeleteButton.click();
  395 |           logger.success('已确认删除项目');
  396 |         } else {
  397 |           // 有些UI可能是直接删除，无需二次确认
  398 |           logger.success('已执行删除操作');
  399 |         }
  400 | 
  401 |         await page.waitForTimeout(2000);
  402 |       } else {
  403 |         logger.log('未找到删除按钮，尝试通过右键菜单或更多操作删除');
  404 |         
  405 |         // 尝试右键点击项目卡片或行来获取上下文菜单
  406 |         const projectCard = page.locator('[class*="card"], [class*="item"], [role="listitem"]').first();
  407 |         if (await projectCard.isVisible({ timeout: 2000 }).catch(() => false)) {
  408 |           await projectCard.click({ button: 'right' });
  409 |           await page.waitForTimeout(500);
  410 |           
  411 |           const contextDeleteButton = page.getByText(/删除|delete/i).first();
  412 |           if (await contextDeleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
  413 |             await contextDeleteButton.click();
  414 |             logger.log('已通过右键菜单点击删除');
  415 |             await page.waitForTimeout(500);
  416 |             
  417 |             // 再次确认
  418 |             const finalConfirm = page.getByRole('button', { name: /确认|确定|是/i })
  419 |               .or(page.getByText(/确认删除|确定删除/i))
  420 |               .first();
  421 |             if (await finalConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
  422 |               await finalConfirm.click();
  423 |             }
  424 |           }
  425 |         }
  426 |       }
  427 | 
  428 |       // 截图保存删除后的状态
  429 |       await page.screenshot({ path: screenshot(`05-deleted-${Date.now()}.png`) });
  430 |       logger.log('已保存删除后的截图');
  431 | 
  432 |       // ========== 验证 ==========
  433 |       logger.log('========================================');
  434 |       logger.log('流程执行完成，验证结果:');
  435 |       logger.log(`- 项目名称: ${projectName}`);
  436 |       logger.log(`- 模板代码长度: ${TEMPLATE_CODE.length} 字符`);
```