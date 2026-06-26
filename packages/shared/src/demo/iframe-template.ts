export interface IframeTemplateOptions {
  cssImports?: string[];
  compiledCode?: string;
  configData?: Record<string, unknown>;
  cdnBaseUrl?: string;
  supportUrlMode?: boolean;
  baseOrigin?: string;
}

const DEFAULT_CDN_BASE = "https://esm.sh";

const consoleInterceptScript = `
(function() {
  const _orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };
  function _serialize(args) {
    return Array.from(args).map(a => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'object') {
        try { return JSON.stringify(a, null, 2); }
        catch { return String(a); }
      }
      return String(a);
    }).join(' ');
  }
  ['log','warn','error','info','debug'].forEach(lv => {
    console[lv] = function() {
      _orig[lv].apply(console, arguments);
      window.parent.postMessage({
        type: 'CONSOLE_LOG',
        payload: { level: lv, args: _serialize(arguments), timestamp: Date.now() }
      }, '*');
    };
  });
})();
`;

const visualEditScript = `
(function() {
  var state = { enabled: false, selectedNodeId: null, annotations: [] };
  var hoverBox = null;
  var selectedBox = null;
  var label = null;
  var annotationLayer = null;
  var commentBubble = null;
  var commentInput = null;
  var commentNode = null;
  var commentElement = null;
  var commentTextElement = null;
  var stylePanel = null;
  var styleToggleButton = null;
  var styleControlInputs = {};
  var styleDraft = {};
  var styleOriginalValues = {};
  var textOriginalValue = null;
  var textDraftValue = null;
  var suppressStyleRestoreOnHide = false;
  var editingAnnotationId = null;
  var lastHoverId = null;

  function ensureLayer() {
    if (!hoverBox) {
      hoverBox = document.createElement('div');
      hoverBox.setAttribute('data-visual-overlay', 'hover');
      hoverBox.style.cssText = 'position:fixed;display:none;pointer-events:none;border:1px solid #38bdf8;background:rgba(56,189,248,0.08);z-index:2147483000;';
      document.body.appendChild(hoverBox);
    }
    if (!selectedBox) {
      selectedBox = document.createElement('div');
      selectedBox.setAttribute('data-visual-overlay', 'selected');
      selectedBox.style.cssText = 'position:fixed;display:none;pointer-events:none;border:2px solid #2563eb;background:rgba(37,99,235,0.08);z-index:2147483001;';
      document.body.appendChild(selectedBox);
    }
    if (!label) {
      label = document.createElement('div');
      label.setAttribute('data-visual-overlay', 'label');
      label.style.cssText = 'position:fixed;display:none;pointer-events:none;background:#2563eb;color:white;font:12px/1.2 system-ui,sans-serif;padding:3px 6px;border-radius:4px;z-index:2147483002;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      document.body.appendChild(label);
    }
    if (!annotationLayer) {
      annotationLayer = document.createElement('div');
      annotationLayer.setAttribute('data-visual-overlay', 'annotations');
      annotationLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483003;';
      document.body.appendChild(annotationLayer);
    }
    if (!commentBubble) {
      commentBubble = document.createElement('div');
      commentBubble.setAttribute('data-visual-overlay', 'comment');
      commentBubble.style.cssText = 'position:fixed;display:none;flex-direction:column;width:min(520px,calc(100vw - 24px));max-height:min(420px,calc(100vh - 24px));overflow:hidden;border-radius:24px;background:rgba(38,38,38,.98);box-shadow:0 18px 45px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);z-index:2147483004;color:#f5f5f5;font-family:system-ui,sans-serif;';
      var topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;';
      styleToggleButton = document.createElement('button');
      styleToggleButton.type = 'button';
      styleToggleButton.innerHTML = '<span style="position:relative;display:block;width:16px;height:16px"><span style="position:absolute;left:1px;right:1px;top:3px;height:2px;border-radius:2px;background:currentColor"></span><span style="position:absolute;left:1px;right:1px;top:7px;height:2px;border-radius:2px;background:currentColor"></span><span style="position:absolute;left:1px;right:1px;top:11px;height:2px;border-radius:2px;background:currentColor"></span><span style="position:absolute;left:4px;top:1px;width:4px;height:4px;border-radius:99px;background:#262626;border:1px solid currentColor"></span><span style="position:absolute;right:4px;top:5px;width:4px;height:4px;border-radius:99px;background:#262626;border:1px solid currentColor"></span><span style="position:absolute;left:6px;top:9px;width:4px;height:4px;border-radius:99px;background:#262626;border:1px solid currentColor"></span></span>';
      styleToggleButton.title = '展开样式编辑';
      styleToggleButton.style.cssText = 'width:30px;height:30px;border-radius:999px;border:0;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 auto;';
      styleToggleButton.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        toggleStylePanel();
      });
      commentInput = document.createElement('input');
      commentInput.type = 'text';
      commentInput.placeholder = '描述这些更改...';
      commentInput.style.cssText = 'min-width:0;flex:1;background:transparent;border:0;outline:0;color:#fff;font:14px/1.4 system-ui,sans-serif;';
      var addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.textContent = '+';
      addButton.title = '添加批注';
      addButton.style.cssText = 'width:30px;height:30px;border-radius:999px;border:0;background:#fff;color:#111827;font:22px/1 system-ui,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 auto;';
      addButton.addEventListener('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        submitComment();
      });
      commentInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitComment();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          hideCommentBubble();
        }
      });
      commentInput.addEventListener('blur', function() {
        setTimeout(function() {
          if (!commentBubble || commentBubble.style.display === 'none') return;
          if (!editingAnnotationId || !commentInput || commentInput.value.trim()) return;
          if (document.activeElement && isOverlay(document.activeElement)) return;
          dismissCommentBubble({ deleteEmptyAnnotation: true });
        }, 0);
      });
      stylePanel = document.createElement('div');
      stylePanel.style.cssText = 'display:none;border-top:1px solid rgba(255,255,255,.08);padding:0 12px 12px;overflow:auto;';
      topRow.appendChild(styleToggleButton);
      topRow.appendChild(commentInput);
      topRow.appendChild(addButton);
      commentBubble.appendChild(topRow);
      commentBubble.appendChild(stylePanel);
      document.body.appendChild(commentBubble);
    }
  }

  function isOverlay(el) {
    return !!(el && el.closest && el.closest('[data-visual-overlay]'));
  }

  function isEditableElement(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (isOverlay(el)) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return true;
  }

  function getDomPath(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (!parent) break;
      var index = 1;
      var prev = node.previousElementSibling;
      while (prev) {
        if (prev.tagName === node.tagName) index++;
        prev = prev.previousElementSibling;
      }
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      node = parent;
    }
    return parts.join('>');
  }

  function getElementByPath(path) {
    if (!path) return null;
    try {
      var selector = path.split('>').join(' > ');
      return document.body.querySelector(':scope > ' + selector);
    } catch (_err) {
      return null;
    }
  }

  function getNodeInfo(el) {
    var rect = el.getBoundingClientRect();
    var domPath = getDomPath(el);
    var text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text.length > 180) text = text.slice(0, 177) + '...';
    var className = '';
    if (el instanceof HTMLElement && el.className) {
      className = typeof el.className === 'string' ? el.className : String(el.className);
    }
    var caps = ['annotate'];
    if (text && el.children.length === 0) caps.push('text');
    if (className) caps.push('className');
    caps.push('structure');
    var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    return {
      nodeId: el.getAttribute('data-visual-node-id') || domPath,
      tagName: el.tagName.toLowerCase(),
      componentName: el.getAttribute('data-component-name') || el.tagName.toLowerCase(),
      className: className || undefined,
      textContent: text || undefined,
      domPath: domPath,
      parentPath: el.parentElement ? getDomPath(el.parentElement) : undefined,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      attrs: {
        src: el.getAttribute('src') || undefined,
        currentSrc: el instanceof HTMLImageElement ? (el.currentSrc || el.src || undefined) : undefined,
        alt: el.getAttribute('alt') || undefined,
        href: el.getAttribute('href') || undefined,
        role: el.getAttribute('role') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined
      },
      computedStyle: style ? {
        color: style.color || undefined,
        backgroundColor: style.backgroundColor || undefined,
        borderColor: style.borderColor || undefined
      } : undefined,
      sourceFile: el.getAttribute('data-source-file') || undefined,
      sourceStart: Number(el.getAttribute('data-source-start')) || undefined,
      sourceEnd: Number(el.getAttribute('data-source-end')) || undefined,
      sourceLine: Number(el.getAttribute('data-source-line')) || undefined,
      sourceColumn: Number(el.getAttribute('data-source-column')) || undefined,
      editCapabilities: caps
    };
  }

  function drawBox(box, node) {
    ensureLayer();
    if (!box || !node) return;
    box.style.display = 'block';
    box.style.left = node.rect.x + 'px';
    box.style.top = node.rect.y + 'px';
    box.style.width = node.rect.width + 'px';
    box.style.height = node.rect.height + 'px';
  }

  function drawLabel(node) {
    ensureLayer();
    if (!label || !node) return;
    label.style.display = 'block';
    label.style.left = Math.max(4, node.rect.x) + 'px';
    label.style.top = Math.max(4, node.rect.y - 24) + 'px';
    label.textContent = '<' + node.tagName + '>' + (node.className ? ' .' + node.className.split(/\\s+/).slice(0, 2).join('.') : '');
  }

  function getElementForNode(node) {
    if (!node) return null;
    var el = getElementByPath(node.domPath);
    if (!el && node.nodeId) {
      try {
        el = document.querySelector('[data-visual-node-id="' + node.nodeId.replace(/"/g, '\\\\"') + '"]');
      } catch (_err) {
        el = null;
      }
    }
    return el;
  }

  function getOwnText(el) {
    if (!el) return '';
    var text = '';
    Array.prototype.forEach.call(el.childNodes || [], function(node) {
      if (node.nodeType === 3) text += node.nodeValue || '';
    });
    return text.replace(/\\s+/g, ' ').trim();
  }

  function findTextEditElement(el) {
    if (!el) return null;
    var own = getOwnText(el);
    if (own) return el;
    var candidates = Array.prototype.slice.call(el.querySelectorAll('*')).filter(function(item) {
      var text = getOwnText(item);
      if (!text) return false;
      var rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (candidates.length === 0) return null;
    candidates.sort(function(a, b) {
      var textA = getOwnText(a);
      var textB = getOwnText(b);
      return textA.length - textB.length;
    });
    return candidates[0];
  }

  function isTextStyleProperty(property) {
    return property === 'color' ||
      property === 'fontFamily' ||
      property === 'fontSize' ||
      property === 'fontWeight' ||
      property === 'lineHeight' ||
      property === 'textAlign';
  }

  function getStyleTarget(property) {
    return isTextStyleProperty(property) && commentTextElement
      ? commentTextElement
      : commentElement;
  }

  function normalizeStyleValue(property, value) {
    var trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if ((property === 'fontSize' ||
      property === 'width' ||
      property === 'height' ||
      property === 'padding' ||
      property === 'margin' ||
      property === 'gap' ||
      property === 'borderRadius' ||
      property === 'lineHeight') && /^\\d+(\\.\\d+)?$/.test(trimmed)) return trimmed + 'px';
    return trimmed;
  }

  function colorToHex(value) {
    var text = String(value || '');
    var start = text.indexOf('(');
    var end = text.indexOf(')');
    if (start === -1 || end === -1 || end <= start) return '#000000';
    var parts = text.slice(start + 1, end).split(',').slice(0, 3);
    if (parts.length < 3) return '#000000';
    return '#' + parts.map(function(part) {
      return Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0');
    }).join('');
  }

  function updateStyleDraft(property, labelText, value) {
    var target = getStyleTarget(property);
    if (!target) return;
    var draftKey = (target === commentTextElement ? 'text:' : 'box:') + property;
    if (styleOriginalValues[draftKey] === undefined) {
      styleOriginalValues[draftKey] = {
        element: target,
        property: property,
        value: target.style[property] || ''
      };
    }
    var normalized = normalizeStyleValue(property, value);
    if (!normalized) {
      target.style[property] = '';
      delete styleDraft[draftKey];
    } else {
      target.style[property] = normalized;
      styleDraft[draftKey] = {
        property: property,
        label: labelText,
        value: normalized,
        previousValue: styleOriginalValues[draftKey].value || undefined
      };
    }
    if (commentElement) {
      var nextNode = getNodeInfo(commentElement);
      commentNode = nextNode;
      state.selectedNodeId = nextNode.domPath;
      drawBox(selectedBox, nextNode);
    }
  }

  function makeStyleInput(property, labelText, value, options) {
    var row = document.createElement('label');
    row.style.cssText = 'display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;align-items:center;min-height:44px;color:#d4d4d4;font:14px/1.2 system-ui,sans-serif;';
    var labelNode = document.createElement('span');
    labelNode.textContent = labelText;
    row.appendChild(labelNode);

    var input;
    if (options && options.select) {
      input = document.createElement('select');
      var hasValue = options.select.some(function(option) {
        return option.value === value;
      });
      if (value && !hasValue) {
        var currentOption = document.createElement('option');
        currentOption.value = value;
        currentOption.textContent = value;
        input.appendChild(currentOption);
      }
      options.select.forEach(function(option) {
        var optionNode = document.createElement('option');
        optionNode.value = option.value;
        optionNode.textContent = option.label;
        input.appendChild(optionNode);
      });
    } else if (options && options.type === 'color') {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:grid;grid-template-columns:34px minmax(0,1fr);gap:8px;align-items:center;';
      var colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = colorToHex(value);
      colorInput.style.cssText = 'width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:transparent;padding:2px;cursor:pointer;';
      input = document.createElement('input');
      input.type = 'text';
      input.value = value || '';
      input.style.cssText = 'min-width:0;width:100%;height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.16);color:#e5e5e5;padding:0 12px;outline:0;font:13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;';
      colorInput.addEventListener('input', function() {
        input.value = colorInput.value;
        updateStyleDraft(property, labelText, input.value);
      });
      input.addEventListener('input', function() {
        updateStyleDraft(property, labelText, input.value);
      });
      input.addEventListener('change', function() {
        colorInput.value = colorToHex(input.value);
        updateStyleDraft(property, labelText, input.value);
      });
      styleControlInputs[property] = input;
      wrap.appendChild(colorInput);
      wrap.appendChild(input);
      row.appendChild(wrap);
      return row;
    } else {
      input = document.createElement('input');
      input.type = options && options.type ? options.type : 'text';
      if (options && options.step) input.step = options.step;
      if (options && options.min) input.min = options.min;
      if (options && options.max) input.max = options.max;
    }
    input.value = value || '';
    input.style.cssText = 'min-width:0;width:100%;height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.16);color:#e5e5e5;padding:0 12px;outline:0;font:13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;';
    input.addEventListener('input', function() {
      updateStyleDraft(property, labelText, input.value);
    });
    input.addEventListener('change', function() {
      updateStyleDraft(property, labelText, input.value);
    });
    styleControlInputs[property] = input;
    row.appendChild(input);
    return row;
  }

  function makeSectionTitle(text) {
    var title = document.createElement('div');
    title.textContent = text;
    title.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08);color:#fff;font:600 13px/1 system-ui,sans-serif;';
    return title;
  }

  function makeTextContentInput() {
    if (!commentTextElement) return null;
    var row = document.createElement('label');
    row.style.cssText = 'display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;align-items:center;min-height:44px;color:#d4d4d4;font:14px/1.2 system-ui,sans-serif;';
    var labelNode = document.createElement('span');
    labelNode.textContent = '文本内容';
    var input = document.createElement('input');
    input.type = 'text';
    input.value = getOwnText(commentTextElement) || commentTextElement.textContent || '';
    input.style.cssText = 'min-width:0;width:100%;height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.16);color:#e5e5e5;padding:0 12px;outline:0;font:13px/1.2 system-ui,sans-serif;';
    input.addEventListener('input', function() {
      if (textOriginalValue === null) textOriginalValue = commentTextElement.textContent || '';
      textDraftValue = input.value;
      commentTextElement.textContent = input.value;
      if (commentElement) {
        var nextNode = getNodeInfo(commentElement);
        commentNode = nextNode;
        drawBox(selectedBox, nextNode);
      }
    });
    row.appendChild(labelNode);
    row.appendChild(input);
    return row;
  }

  function renderStylePanel() {
    if (!stylePanel || !commentElement || !commentNode) return;
    stylePanel.innerHTML = '';
    styleControlInputs = {};
    var boxComputed = window.getComputedStyle(commentElement);
    var textComputed = window.getComputedStyle(commentTextElement || commentElement);
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;height:42px;color:#fff;font:600 14px/1 system-ui,sans-serif;';
    var tag = document.createElement('span');
    var textLabel = commentTextElement ? ' · 文本 "' + (getOwnText(commentTextElement) || commentTextElement.textContent || '').slice(0, 12) + '"' : '';
    tag.textContent = (commentNode.tagName || 'element') + textLabel;
    var drag = document.createElement('span');
    drag.textContent = '⋮⋮';
    drag.style.cssText = 'color:#8a8a8a;font:18px/1 system-ui,sans-serif;letter-spacing:1px;';
    header.appendChild(tag);
    header.appendChild(drag);
    stylePanel.appendChild(header);
    var textInput = makeTextContentInput();
    if (textInput) {
      stylePanel.appendChild(makeSectionTitle('文本'));
      stylePanel.appendChild(textInput);
    }
    stylePanel.appendChild(makeStyleInput('color', '文本颜色', textComputed.color, { type: 'color' }));
    stylePanel.appendChild(makeStyleInput('fontFamily', '字体', textComputed.fontFamily, {
      select: [
        { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', label: '系统默认' },
        { value: '"PingFang SC", "Microsoft YaHei", sans-serif', label: '中文黑体' },
        { value: 'Arial, sans-serif', label: 'Arial' },
        { value: 'Inter, sans-serif', label: 'Inter' },
        { value: 'Georgia, serif', label: 'Georgia' },
        { value: 'ui-monospace, SFMono-Regular, Menlo, monospace', label: '等宽字体' }
      ]
    }));
    stylePanel.appendChild(makeStyleInput('fontSize', '字号', parseFloat(textComputed.fontSize) || '', { type: 'number', min: '1', step: '1' }));
    stylePanel.appendChild(makeStyleInput('fontWeight', '字重', textComputed.fontWeight, {
      select: [
        { value: '300', label: '300' },
        { value: '400', label: '400' },
        { value: '500', label: '500' },
        { value: '600', label: '600' },
        { value: '700', label: '700' },
        { value: '800', label: '800' }
      ]
    }));
    stylePanel.appendChild(makeStyleInput('lineHeight', '行高', textComputed.lineHeight, { type: 'number', min: '1', step: '1' }));
    stylePanel.appendChild(makeStyleInput('textAlign', '文字对齐', textComputed.textAlign, {
      select: [
        { value: 'left', label: '左对齐' },
        { value: 'center', label: '居中' },
        { value: 'right', label: '右对齐' },
        { value: 'justify', label: '两端对齐' }
      ]
    }));
    stylePanel.appendChild(makeSectionTitle('外观'));
    stylePanel.appendChild(makeStyleInput('backgroundColor', '背景', boxComputed.backgroundColor, { type: 'color' }));
    stylePanel.appendChild(makeStyleInput('opacity', 'Opacity', boxComputed.opacity, { type: 'number', min: '0', max: '1', step: '0.05' }));
    stylePanel.appendChild(makeStyleInput('borderRadius', '圆角', boxComputed.borderRadius));
    stylePanel.appendChild(makeSectionTitle('尺寸与间距'));
    stylePanel.appendChild(makeStyleInput('width', '宽度', boxComputed.width, { type: 'number', min: '0', step: '1' }));
    stylePanel.appendChild(makeStyleInput('height', '高度', boxComputed.height, { type: 'number', min: '0', step: '1' }));
    stylePanel.appendChild(makeStyleInput('padding', '内边距', boxComputed.padding));
    stylePanel.appendChild(makeStyleInput('margin', '外边距', boxComputed.margin));
    stylePanel.appendChild(makeSectionTitle('布局'));
    stylePanel.appendChild(makeStyleInput('display', '布局方式', boxComputed.display, {
      select: [
        { value: 'block', label: 'Block' },
        { value: 'inline-block', label: 'Inline block' },
        { value: 'flex', label: 'Flex' },
        { value: 'inline-flex', label: 'Inline flex' },
        { value: 'grid', label: 'Grid' }
      ]
    }));
    stylePanel.appendChild(makeStyleInput('justifyContent', '主轴对齐', boxComputed.justifyContent, {
      select: [
        { value: 'flex-start', label: '起始' },
        { value: 'center', label: '居中' },
        { value: 'flex-end', label: '末尾' },
        { value: 'space-between', label: '两端' },
        { value: 'space-around', label: '环绕' }
      ]
    }));
    stylePanel.appendChild(makeStyleInput('alignItems', '交叉轴对齐', boxComputed.alignItems, {
      select: [
        { value: 'stretch', label: '拉伸' },
        { value: 'flex-start', label: '起始' },
        { value: 'center', label: '居中' },
        { value: 'flex-end', label: '末尾' },
        { value: 'baseline', label: '基线' }
      ]
    }));
    stylePanel.appendChild(makeStyleInput('gap', '间距', boxComputed.gap));
    var footer = document.createElement('div');
    footer.style.cssText = 'position:sticky;bottom:0;display:flex;justify-content:space-between;align-items:center;gap:10px;margin:10px -12px -12px;padding:10px 12px;background:linear-gradient(to top,rgba(38,38,38,.98),rgba(38,38,38,.92));border-top:1px solid rgba(255,255,255,.08);';
    var cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = '取消';
    cancelButton.style.cssText = 'height:34px;border-radius:999px;border:0;background:rgba(255,255,255,.08);color:#fff;padding:0 14px;font:14px/1 system-ui,sans-serif;cursor:pointer;';
    cancelButton.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      cancelStyleEdit();
    });
    var confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.textContent = '✓';
    confirmButton.title = '确认样式修改';
    confirmButton.style.cssText = 'width:36px;height:36px;border-radius:999px;border:0;background:#a3a3a3;color:#111827;font:18px/1 system-ui,sans-serif;cursor:pointer;';
    confirmButton.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      confirmStyleEdit();
    });
    footer.appendChild(cancelButton);
    footer.appendChild(confirmButton);
    stylePanel.appendChild(footer);
  }

  function toggleStylePanel() {
    if (!stylePanel || !styleToggleButton) return;
    var willOpen = stylePanel.style.display === 'none';
    stylePanel.style.display = willOpen ? 'block' : 'none';
    styleToggleButton.style.background = willOpen ? '#2563eb' : 'rgba(255,255,255,.08)';
    styleToggleButton.title = willOpen ? '收起样式编辑' : '展开样式编辑';
    if (willOpen) renderStylePanel();
    if (commentNode) positionCommentBubble(commentNode, willOpen);
  }

  function getStyleChanges() {
    var changes = Object.keys(styleDraft).map(function(key) {
      return styleDraft[key];
    });
    if (textDraftValue !== null && textDraftValue !== textOriginalValue) {
      changes.unshift({
        property: 'textContent',
        label: '文本内容',
        value: textDraftValue,
        previousValue: textOriginalValue || undefined
      });
    }
    return changes;
  }

  function restoreStyleDraft() {
    if (commentTextElement && textOriginalValue !== null) {
      commentTextElement.textContent = textOriginalValue;
    }
    if (!commentElement) return;
    Object.keys(styleOriginalValues).forEach(function(property) {
      var original = styleOriginalValues[property];
      if (original && original.element) {
        original.element.style[original.property] = original.value || '';
      }
    });
    if (commentNode) {
      var nextNode = getNodeInfo(commentElement);
      commentNode = nextNode;
      drawBox(selectedBox, nextNode);
    }
  }

  function resetStylePanelState() {
    styleDraft = {};
    styleOriginalValues = {};
    textOriginalValue = null;
    textDraftValue = null;
    suppressStyleRestoreOnHide = false;
    if (stylePanel) stylePanel.style.display = 'none';
    if (styleToggleButton) {
      styleToggleButton.style.background = 'rgba(255,255,255,.08)';
      styleToggleButton.title = '展开样式编辑';
    }
  }

  function cancelStyleEdit() {
    restoreStyleDraft();
    resetStylePanelState();
    if (commentNode) positionCommentBubble(commentNode, false);
    if (commentInput) commentInput.focus();
  }

  function confirmStyleEdit() {
    submitComment({ keepStyles: true });
  }

  function clearHover() {
    if (hoverBox) hoverBox.style.display = 'none';
    if (label) label.style.display = 'none';
    lastHoverId = null;
    window.parent.postMessage({ type: 'VISUAL_HOVER', node: null }, '*');
  }

  function hideCommentBubble() {
    if (!suppressStyleRestoreOnHide) {
      restoreStyleDraft();
    }
    commentNode = null;
    commentElement = null;
    commentTextElement = null;
    editingAnnotationId = null;
    if (commentInput) commentInput.value = '';
    resetStylePanelState();
    if (commentBubble) commentBubble.style.display = 'none';
  }

  function deleteEditingAnnotationIfEmpty() {
    if (!editingAnnotationId || !commentNode || !commentInput) return false;
    if (commentInput.value.trim()) return false;
    if (getStyleChanges().length > 0) return false;
    window.parent.postMessage({ type: 'VISUAL_ANNOTATION_CREATE', node: commentNode, text: '', annotationId: editingAnnotationId }, '*');
    return true;
  }

  function dismissCommentBubble(options) {
    if (options && options.deleteEmptyAnnotation) {
      deleteEditingAnnotationIfEmpty();
    }
    hideCommentBubble();
  }

  function submitComment(options) {
    if (!commentNode || !commentInput) return;
    var styleChanges = getStyleChanges();
    var text = commentInput.value.trim();
    if (!text && styleChanges.length === 0) {
      deleteEditingAnnotationIfEmpty();
      hideCommentBubble();
      return;
    }
    if ((options && options.keepStyles) || styleChanges.length > 0) {
      suppressStyleRestoreOnHide = true;
    }
    window.parent.postMessage({
      type: 'VISUAL_ANNOTATION_CREATE',
      node: commentNode,
      text: text,
      annotationId: editingAnnotationId || undefined,
      styleChanges: styleChanges
    }, '*');
    hideCommentBubble();
  }

  function positionCommentBubble(node, expanded) {
    if (!commentBubble || !node) return;
    var bubbleWidth = Math.min(520, Math.max(260, window.innerWidth - 24));
    var estimatedHeight = expanded ? Math.min(420, window.innerHeight - 24) : 56;
    var left = Math.max(12, Math.min(window.innerWidth - bubbleWidth - 12, node.rect.x + node.rect.width / 2 - bubbleWidth / 2));
    var below = node.rect.y + node.rect.height + 12;
    var top = below + estimatedHeight < window.innerHeight ? below : Math.max(12, node.rect.y - estimatedHeight - 12);
    commentBubble.style.left = left + 'px';
    commentBubble.style.top = top + 'px';
    commentBubble.style.width = bubbleWidth + 'px';
  }

  function showCommentBubble(node, initialText, annotationId) {
    ensureLayer();
    if (!commentBubble || !commentInput || !node) return;
    commentNode = node;
    commentElement = getElementForNode(node);
    commentTextElement = findTextEditElement(commentElement);
    editingAnnotationId = annotationId || null;
    styleDraft = {};
    styleOriginalValues = {};
    textOriginalValue = null;
    textDraftValue = null;
    suppressStyleRestoreOnHide = false;
    commentInput.value = initialText || '';
    if (stylePanel) stylePanel.style.display = 'none';
    if (styleToggleButton) {
      styleToggleButton.style.background = 'rgba(255,255,255,.08)';
      styleToggleButton.title = '展开样式编辑';
    }
    positionCommentBubble(node, false);
    commentBubble.style.display = 'flex';
    setTimeout(function() { commentInput && commentInput.focus(); }, 0);
  }

  function redrawSelection() {
    ensureLayer();
    if (!state.selectedNodeId) {
      if (selectedBox) selectedBox.style.display = 'none';
      return;
    }
    var selected = getElementByPath(state.selectedNodeId);
    if (!selected) selected = document.querySelector('[data-visual-node-id="' + state.selectedNodeId.replace(/"/g, '\\\\"') + '"]');
    if (!selected || !isEditableElement(selected)) {
      if (selectedBox) selectedBox.style.display = 'none';
      return;
    }
    drawBox(selectedBox, getNodeInfo(selected));
  }

  function renderAnnotations() {
    ensureLayer();
    if (!annotationLayer) return;
    annotationLayer.innerHTML = '';
    (state.annotations || []).forEach(function(annotation) {
      if (annotation.resolved) return;
      var el = getElementByPath(annotation.domPath);
      if (!el) return;
      var rect = el.getBoundingClientRect();
      var pin = document.createElement('button');
      pin.type = 'button';
      pin.title = annotation.text || '批注';
      pin.textContent = '●';
      pin.style.cssText = 'position:absolute;pointer-events:auto;width:24px;height:24px;border-radius:999px;border:3px solid white;background:#f59e0b;color:#f59e0b;box-shadow:0 2px 8px rgba(15,23,42,.25);font-size:0;cursor:pointer;left:' + Math.max(2, rect.right - 12) + 'px;top:' + Math.max(2, rect.top - 12) + 'px;';
      function openAnnotation(event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        var node = getNodeInfo(el);
        showCommentBubble(node, annotation.text || '', annotation.id);
        window.parent.postMessage({ type: 'VISUAL_SELECT', node: node }, '*');
      }
      pin.addEventListener('pointerdown', openAnnotation, true);
      pin.addEventListener('click', openAnnotation, true);
      annotationLayer.appendChild(pin);
    });
  }

  function setState(next) {
    state = {
      enabled: !!next.enabled,
      annotationMode: !!next.annotationMode,
      selectedNodeId: next.selectedNodeId || null,
      annotations: Array.isArray(next.annotations) ? next.annotations : []
    };
    ensureLayer();
    if (!state.enabled) {
      clearHover();
      hideCommentBubble();
      if (selectedBox) selectedBox.style.display = 'none';
    }
    redrawSelection();
    renderAnnotations();
  }

  function closestEditable(target) {
    var el = target && target.nodeType === 1 ? target : target && target.parentElement;
    while (el && el !== document.body) {
      if (isEditableElement(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function resolveAnnotationTarget(el) {
    if (!el) return el;
    if (findTextEditElement(el)) return el;
    var node = el.parentElement;
    while (node && node !== document.body) {
      if (isEditableElement(node) && findTextEditElement(node)) return node;
      node = node.parentElement;
    }
    return el;
  }

  document.addEventListener('mousemove', function(event) {
    if (!state.enabled) return;
    var el = closestEditable(event.target);
    if (state.annotationMode) el = resolveAnnotationTarget(el);
    if (!el) {
      clearHover();
      return;
    }
    var node = getNodeInfo(el);
    if (node.nodeId === lastHoverId) return;
    lastHoverId = node.nodeId;
    drawBox(hoverBox, node);
    drawLabel(node);
    window.parent.postMessage({ type: 'VISUAL_HOVER', node: node }, '*');
  }, true);

  document.addEventListener('click', function(event) {
    if (!state.enabled) return;
    if (isOverlay(event.target)) return;
    if (commentBubble && commentBubble.style.display !== 'none') {
      dismissCommentBubble({ deleteEmptyAnnotation: true });
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    var el = closestEditable(event.target);
    event.preventDefault();
    event.stopPropagation();
    if (!el) {
      window.parent.postMessage({ type: 'VISUAL_SELECT', node: null }, '*');
      return;
    }
    var node = getNodeInfo(el);
    state.selectedNodeId = node.domPath;
    drawBox(selectedBox, node);
    if (state.annotationMode) {
      showCommentBubble(node);
      window.parent.postMessage({ type: 'VISUAL_SELECT', node: node }, '*');
      return;
    }
    window.parent.postMessage({ type: 'VISUAL_SELECT', node: node }, '*');
  }, true);

  window.addEventListener('blur', function() {
    if (!commentBubble || commentBubble.style.display === 'none') return;
    if (!editingAnnotationId || !commentInput || commentInput.value.trim()) return;
    setTimeout(function() {
      if (document.hasFocus()) return;
      dismissCommentBubble({ deleteEmptyAnnotation: true });
    }, 0);
  });

  document.addEventListener('dblclick', function(event) {
    if (!state.enabled) return;
    if (isOverlay(event.target)) return;
    var el = closestEditable(event.target);
    if (!el) return;
    var before = (el.innerText || el.textContent || '').trim();
    if (!before || el.children.length > 0) return;
    event.preventDefault();
    event.stopPropagation();
    var after = window.prompt('编辑文本', before);
    if (after == null || after === before) return;
    el.textContent = after;
    window.parent.postMessage({ type: 'VISUAL_INLINE_EDIT', payload: { node: getNodeInfo(el), before: before, after: after } }, '*');
  }, true);

  window.__VISUAL_EDIT__ = { setState: setState, redrawSelection: redrawSelection, renderAnnotations: renderAnnotations };
})();
`;

function generateCssLinks(cssImports: string[], cdnBase: string): string {
  if (!cssImports.length) return "";
  return cssImports
    .map((url) => {
      const href = url.startsWith("http") ? url : `${cdnBase}/${url}`;
      return `    <link rel="stylesheet" href="${href}" data-dynamic-css="true">`;
    })
    .join("\n");
}

export function generateIframeHtml(
  options: IframeTemplateOptions = {},
): string {
  const {
    cssImports = [],
    compiledCode,
    configData,
    cdnBaseUrl,
    supportUrlMode = true,
    baseOrigin,
  } = options;
  const cdnBase = cdnBaseUrl || DEFAULT_CDN_BASE;

  const cssLinks = generateCssLinks(cssImports, cdnBase);
  const initialCode = compiledCode ? JSON.stringify(compiledCode) : "null";
  const initialConfig = JSON.stringify(configData || {});

  const loadModuleFn = `
    function reportRuntimeError(payload) {
      const safePayload = payload || {};
      try {
        document.documentElement.setAttribute('data-preview-runtime-error', JSON.stringify({
          stage: safePayload.stage || 'runtime',
          error: safePayload.error || '组件运行时发生错误',
          stack: safePayload.stack,
          source: safePayload.source,
          line: safePayload.line,
          timestamp: Date.now()
        }));
      } catch (_err) {}
      window.parent.postMessage({ type: 'RUNTIME_ERROR', ...safePayload }, '*');
    }

    function loadModuleFromCode(code, thisVersion) {
      const blob = new Blob([code], { type: 'application/javascript' });
      const moduleUrl = URL.createObjectURL(blob);
      import(moduleUrl)
        .then((module) => {
          if (thisVersion !== updateVersion) return;
          currentComponent = module.default || null;
          renderComponent();
          URL.revokeObjectURL(moduleUrl);
          if (module.default) {
            window.parent.postMessage({ type: 'LOADED' }, '*');
          } else {
            reportRuntimeError({ stage: 'component_export', error: '模块没有默认导出（export default）' });
          }
        })
        .catch((err) => {
          if (thisVersion !== updateVersion) return;
          reportRuntimeError({ stage: 'dependency_import', error: err.message, stack: err.stack });
        });
    }`;

  const updateCodeHandler = supportUrlMode
    ? `
      if (type === 'UPDATE_CODE') {
        currentConfig = newConfigData || {};
        window.__DEMO_PROPS__ = currentConfig;
        updateAppRuntime(appState, routeParams);
        updateCssLinks(newCssImports || []);

        const thisVersion = ++updateVersion;

        if (isUrl) {
          fetch(code)
            .then(res => {
              if (!res.ok) throw new Error('加载预编译代码失败: ' + res.status);
              return res.text();
            })
            .then(jsCode => {
              if (thisVersion !== updateVersion) return;
              loadModuleFromCode(jsCode, thisVersion);
            })
            .catch((err) => {
              if (thisVersion !== updateVersion) return;
              reportRuntimeError({ stage: 'dependency_import', error: err.message });
            });
        } else {
          loadModuleFromCode(code, thisVersion);
        }
      }`
    : `
      if (type === 'UPDATE_CODE') {
        currentConfig = newConfigData || {};
        window.__DEMO_PROPS__ = currentConfig;
        updateAppRuntime(appState, routeParams);
        updateCssLinks(newCssImports || []);

        const thisVersion = ++updateVersion;

        const blob = new Blob([code], { type: 'application/javascript' });
        const moduleUrl = URL.createObjectURL(blob);

        import(moduleUrl)
          .then((module) => {
            if (thisVersion !== updateVersion) return;
            currentComponent = module.default || null;
            renderComponent();
            URL.revokeObjectURL(moduleUrl);
            if (module.default) {
              window.parent.postMessage({ type: 'LOADED' }, '*');
            } else {
              reportRuntimeError({ stage: 'component_export', error: '模块没有默认导出（export default）' });
            }
          })
          .catch((err) => {
            if (thisVersion !== updateVersion) return;
            reportRuntimeError({ stage: 'dependency_import', error: err.message, stack: err.stack });
          });
      }`;

  const baseTag = baseOrigin ? `<base href="${baseOrigin}/">` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${baseTag}
  <link rel="preconnect" href="${cdnBase}" crossorigin>
  <link rel="dns-prefetch" href="${cdnBase}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; background-color: #ffffff; }
    #root { min-height: 100vh; }
  </style>
${cssLinks}
  <script type="importmap">
  {
    "imports": {
      "react": "${cdnBase}/react@18.3.1",
      "react-dom": "${cdnBase}/react-dom@18.3.1/client",
      "react/jsx-runtime": "${cdnBase}/react@18.3.1/jsx-runtime",
      "react/jsx-dev-runtime": "${cdnBase}/react@18.3.1/jsx-dev-runtime"
    }
  }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/tailwindcss-cdn@3.4.10/tailwindcss.min.js"></script>
</head>
<body>
  <div id="root"></div>

  <script type="module">
    ${consoleInterceptScript}
    ${visualEditScript}

    import React from '${cdnBase}/react@18.3.1';
    import ReactDOM from '${cdnBase}/react-dom@18.3.1/client';

    let currentRoot = null;
    let currentConfig = ${initialConfig};
    let currentAppState = {};
    let currentRouteParams = {};
    let currentComponent = null;
    let updateVersion = 0;
    let isSleeping = false;

    window.__DEMO_PROPS__ = currentConfig;
    window.__APP_STATE__ = currentAppState;
    window.__ROUTE_PARAMS__ = currentRouteParams;

    function updateAppRuntime(appState, routeParams) {
      currentAppState = appState && typeof appState === 'object' && !Array.isArray(appState) ? appState : {};
      currentRouteParams = routeParams && typeof routeParams === 'object' && !Array.isArray(routeParams) ? routeParams : {};
      window.__APP_STATE__ = currentAppState;
      window.__ROUTE_PARAMS__ = currentRouteParams;
      window.dispatchEvent(new CustomEvent('PREVIEW_APP_RUNTIME_UPDATE', {
        detail: { appState: currentAppState, routeParams: currentRouteParams }
      }));
    }

    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
      }

      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }

      componentDidCatch(error, errorInfo) {
        reportRuntimeError({ stage: 'render', error: error.message, stack: error.stack });
      }

      render() {
        if (this.state.hasError) {
          return React.createElement('div', {
            style: {
              minHeight: '100vh',
              padding: '16px',
              background: '#f8fafc',
              fontFamily: 'system-ui, sans-serif'
            }
          },
            React.createElement('div', {
              style: {
                minHeight: '160px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                fontSize: '14px'
              }
            }, '预览生成中')
          );
        }
        return this.props.children;
      }
    }

    function renderComponent() {
      if (!currentComponent) return;
      const container = document.getElementById('root');
      if (!container) return;
      if (!currentRoot) {
        currentRoot = ReactDOM.createRoot(container);
      }
      currentRoot.render(
        React.createElement(ErrorBoundary, null,
          React.createElement(currentComponent, currentConfig)
        )
      );
    }

    function updateCssLinks(cssUrls) {
      document.querySelectorAll('link[data-dynamic-css]').forEach(el => el.remove());
      cssUrls.forEach(url => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url.startsWith('http') ? url : '${cdnBase}/' + url;
        link.setAttribute('data-dynamic-css', 'true');
        document.head.appendChild(link);
      });
    }

    ${loadModuleFn}

    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;

      const { type, code, configData: newConfigData, cssImports: newCssImports, appState, routeParams${supportUrlMode ? ", isUrl" : ""} } = event.data;

      if (type === 'SLEEP') {
        isSleeping = true;
        return;
      }

      if (type === 'WAKE') {
        isSleeping = false;
        requestAnimationFrame(function() {
          window.parent.postMessage({ type: 'RESIZE', height: document.body.getBoundingClientRect().height }, '*');
        });
        return;
      }

      ${updateCodeHandler}

      if (type === 'UPDATE_CONFIG') {
        currentConfig = newConfigData || {};
        window.__DEMO_PROPS__ = currentConfig;
        updateAppRuntime(appState, routeParams);
        if (currentComponent) {
          renderComponent();
        }
      }

      if (type === 'COLLECT_POSITIONABLE_SIZES') {
        if (isSleeping) return;
        // 使用 requestAnimationFrame 等待 React 渲染完成后再测量 DOM
        requestAnimationFrame(function() {
          try {
            var posElements = document.querySelectorAll('[data-pos-key]');
            var sizes = {};
            // 检查是否有未加载完成的图片
            var pendingImages = [];
            for (var i = 0; i < posElements.length; i++) {
              var el = posElements[i];
              var key = el.getAttribute('data-pos-key');
              if (key) {
                // 如果元素本身就是 img 或包含 img，检查加载状态
                var imgs = el.tagName === 'IMG' ? [el] : el.querySelectorAll('img');
                for (var j = 0; j < imgs.length; j++) {
                  if (!imgs[j].complete) {
                    pendingImages.push(imgs[j]);
                  }
                }
              }
            }
            function measureAndReport() {
              var posElements2 = document.querySelectorAll('[data-pos-key]');
              var sizes2 = {};
              for (var k = 0; k < posElements2.length; k++) {
                var el2 = posElements2[k];
                var key2 = el2.getAttribute('data-pos-key');
                if (key2) {
                  var rect = el2.getBoundingClientRect();
                  sizes2[key2] = { width: Math.round(rect.width), height: Math.round(rect.height) };
                }
              }
              window.parent.postMessage({ type: 'POSITIONABLE_SIZES_RESULT', sizes: sizes2 }, '*');
            }
            if (pendingImages.length > 0) {
              // 等待所有图片加载完成后再测量
              var reported = false;
              var loaded = 0;
              function safeReport() {
                if (reported) return;
                reported = true;
                measureAndReport();
              }
              pendingImages.forEach(function(img) {
                img.addEventListener('load', function() {
                  loaded++;
                  if (loaded === pendingImages.length) safeReport();
                });
                img.addEventListener('error', function() {
                  loaded++;
                  if (loaded === pendingImages.length) safeReport();
                });
              });
              // 超时兜底：500ms 后强制测量
              setTimeout(safeReport, 500);
            } else {
              measureAndReport();
            }
          } catch (err) {
            window.parent.postMessage({ type: 'POSITIONABLE_SIZES_RESULT', sizes: {} }, '*');
          }
        });
      }

      if (type === 'COLLECT_THUMBNAIL_LAYOUT') {
        if (isSleeping) return;
        try {
          (function() {
            function getCleanText(el) {
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
                return el.value || el.placeholder || '';
              }
              return (el.textContent || '').replace(/\\s+/g, ' ').trim();
            }

            function isUsefulRawElement(el) {
              if (el.rect.width <= 0 || el.rect.height <= 0) return false;
              if (el.style.display === 'none') return false;
              if (el.style.visibility === 'hidden') return false;
              if (Number(el.style.opacity) === 0) return false;
              var area = el.rect.width * el.rect.height;
              if (area < 24 * 24) return false;
              var hasText = !!(el.text && el.text.trim());
              var hasImage = !!el.attrs.src || el.style.backgroundImage !== 'none';
              var bg = el.style.backgroundColor;
              var hasBackground = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
              var hasShadow = el.style.boxShadow && el.style.boxShadow !== 'none';
              var hasBorder = el.style.border && el.style.border !== '0px none rgb(0, 0, 0)';
              return hasText || hasImage || hasBackground || hasShadow || hasBorder;
            }

            var viewport = { width: window.innerWidth, height: window.innerHeight };
            var elements = [];
            var all = document.querySelectorAll('*');
            for (var i = 0; i < all.length; i++) {
              var el = all[i];
              var rect = el.getBoundingClientRect();
              var style = window.getComputedStyle(el);
              var snapshot = {
                tag: el.tagName.toLowerCase(),
                text: getCleanText(el),
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                style: {
                  display: style.display,
                  visibility: style.visibility,
                  opacity: style.opacity,
                  backgroundColor: style.backgroundColor,
                  color: style.color,
                  fontSize: style.fontSize,
                  fontWeight: style.fontWeight,
                  borderRadius: style.borderRadius,
                  boxShadow: style.boxShadow,
                  border: style.border,
                  position: style.position,
                  zIndex: style.zIndex,
                  backgroundImage: style.backgroundImage
                },
                attrs: {
                  role: el.getAttribute('role'),
                  ariaLabel: el.getAttribute('aria-label'),
                  src: el instanceof HTMLImageElement ? (el.currentSrc || el.src) : undefined,
                  className: el instanceof HTMLElement ? (el.className ? el.className.toString() : undefined) : undefined
                }
              };
              if (isUsefulRawElement(snapshot)) {
                elements.push(snapshot);
              }
            }

            window.parent.postMessage({ type: 'THUMBNAIL_LAYOUT_RESULT', payload: { viewport: viewport, elements: elements } }, '*');
          })();
        } catch (err) {
          window.parent.postMessage({ type: 'THUMBNAIL_LAYOUT_ERROR', error: err.message }, '*');
        }
      }

      if (type === 'UPDATE_VISUAL_EDIT_STATE') {
        if (window.__VISUAL_EDIT__) {
          window.__VISUAL_EDIT__.setState(event.data || {});
        }
      }

      if (type === 'COLLECT_VISUAL_NODE_TREE') {
        if (isSleeping) return;
        try {
          var nodes = [];
          var allVisualNodes = document.body.querySelectorAll('*');
          for (var vn = 0; vn < allVisualNodes.length; vn++) {
            var candidate = allVisualNodes[vn];
            if (candidate && candidate.getBoundingClientRect) {
              var r = candidate.getBoundingClientRect();
              if (r.width > 0 && r.height > 0 && candidate !== document.body && candidate !== document.documentElement) {
                nodes.push({
                  tagName: candidate.tagName.toLowerCase(),
                  textContent: (candidate.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
                  className: candidate instanceof HTMLElement ? candidate.className.toString() : undefined
                });
              }
            }
          }
          window.parent.postMessage({ type: 'VISUAL_NODE_TREE_RESULT', nodes: nodes }, '*');
        } catch (err) {
          window.parent.postMessage({ type: 'VISUAL_NODE_TREE_RESULT', nodes: [] }, '*');
        }
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      if (isSleeping) return;
      for (const entry of entries) {
        const height = entry.contentRect.height;
        window.parent.postMessage({ type: 'RESIZE', height }, '*');
      }
    });
    resizeObserver.observe(document.body);

    window.addEventListener('error', (event) => {
      reportRuntimeError({
        stage: 'runtime',
        error: event.message,
        source: event.filename,
        line: event.lineno
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      reportRuntimeError({
        stage: 'runtime',
        error: event.reason?.message || String(event.reason)
      });
    });

    window.parent.postMessage({ type: 'READY' }, '*');

    const initialCode = ${initialCode};
    if (initialCode) {
      window.__DEMO_PROPS__ = currentConfig;
      const blob = new Blob([initialCode], { type: 'application/javascript' });
      const moduleUrl = URL.createObjectURL(blob);
      import(moduleUrl)
        .then((module) => {
          currentComponent = module.default;
          renderComponent();
          URL.revokeObjectURL(moduleUrl);
          window.parent.postMessage({ type: 'COMPONENT_READY' }, '*');
        })
        .catch((err) => {
          reportRuntimeError({ stage: 'dependency_import', error: err.message });
        });
    }
  </script>
</body>
</html>`;
}

export function buildIframeHtml(cssImports?: string[]): string {
  return generateIframeHtml({ cssImports });
}
