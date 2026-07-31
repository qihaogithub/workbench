export interface IframeTemplateOptions {
  cssImports?: string[];
  compiledCode?: string;
  compiledCodeUrl?: string;
  configData?: Record<string, unknown>;
  cdnBaseUrl?: string;
  runtimeBaseUrl?: string;
  useCdnRuntime?: boolean;
  supportUrlMode?: boolean;
  baseOrigin?: string;
}

const DEFAULT_CDN_BASE = "https://esm.sh";
const DEFAULT_RUNTIME_IMPORTS: Record<string, string> = {
  react: "/preview-runtime/vendor/react.js",
  "react-dom": "/preview-runtime/vendor/react-dom.js",
  "react-dom/client": "/preview-runtime/vendor/react-dom-client.js",
  "react/jsx-runtime": "/preview-runtime/vendor/react-jsx-runtime.js",
  "react/jsx-dev-runtime": "/preview-runtime/vendor/react-jsx-dev-runtime.js",
  "lucide-react": "/preview-runtime/vendor/lucide-react.js",
  "framer-motion": "/preview-runtime/vendor/framer-motion.js",
  "svgaplayerweb": "/preview-runtime/vendor/svgaplayerweb.js",
  "@preview/sdk": "/preview-runtime/vendor/preview-sdk.js",
};

const PREVIEW_RUNTIME_PATH_PREFIX = "/preview-runtime";

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

export const visualEditScript = `
(function() {
  var state = { enabled: false, hoverNodeId: null, selectedNodeId: null, hiddenNodeIds: [], annotations: [], propertyChanges: [] };
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
  var hiddenNodeOriginalDisplays = {};
  var lastHoverId = null;
  var appliedPropertyOriginals = {};
  var selectionCycleSignature = '';
  var selectionCycleIndex = -1;
  var visualOverlayRedrawFrame = null;

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
      selectedBox.style.cssText = 'position:fixed;display:none;pointer-events:none;border:2px solid #2563eb;background:rgba(37,99,235,0.08);box-shadow:0 0 0 4px rgba(37,99,235,0.15);z-index:2147483001;';
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

  function normalizeEditableTarget(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.ownerSVGElement) {
      return el.closest && el.closest('svg') ? el.closest('svg') : el.ownerSVGElement;
    }
    return el;
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
    var ownText = getOwnText(el);
    var aggregateText = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    var text = el.children.length === 0 ? aggregateText : ownText;
    if (text.length > 180) text = text.slice(0, 177) + '...';
    var className = '';
    if (el instanceof HTMLElement && el.className) {
      className = typeof el.className === 'string' ? el.className : String(el.className);
    }
    var caps = ['annotate', 'style'];
    if (text && el.children.length === 0) caps.push('text');
    if (el instanceof HTMLImageElement || el.getAttribute('src')) caps.push('image');
    if (el instanceof HTMLAnchorElement || el.getAttribute('href')) caps.push('link');
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
        backgroundImage: style.backgroundImage || undefined,
        borderColor: style.borderColor || undefined,
        borderWidth: style.borderWidth || undefined,
        borderStyle: style.borderStyle || undefined,
        borderRadius: style.borderRadius || undefined,
        borderTopLeftRadius: style.borderTopLeftRadius || undefined,
        borderTopRightRadius: style.borderTopRightRadius || undefined,
        borderBottomRightRadius: style.borderBottomRightRadius || undefined,
        borderBottomLeftRadius: style.borderBottomLeftRadius || undefined,
        boxShadow: style.boxShadow || undefined,
        boxSizing: style.boxSizing || undefined,
        filter: style.filter || undefined,
        overflow: style.overflow || undefined,
        opacity: style.opacity || undefined,
        fontFamily: style.fontFamily || undefined,
        fontSize: style.fontSize || undefined,
        fontWeight: style.fontWeight || undefined,
        lineHeight: style.lineHeight || undefined,
        letterSpacing: style.letterSpacing || undefined,
        textAlign: style.textAlign || undefined,
        width: style.width || undefined,
        height: style.height || undefined,
        padding: style.padding || undefined,
        paddingTop: style.paddingTop || undefined,
        paddingRight: style.paddingRight || undefined,
        paddingBottom: style.paddingBottom || undefined,
        paddingLeft: style.paddingLeft || undefined,
        margin: style.margin || undefined,
        marginTop: style.marginTop || undefined,
        marginRight: style.marginRight || undefined,
        marginBottom: style.marginBottom || undefined,
        marginLeft: style.marginLeft || undefined,
        display: style.display || undefined,
        flexDirection: style.flexDirection || undefined,
        justifyContent: style.justifyContent || undefined,
        alignItems: style.alignItems || undefined,
        gap: style.gap || undefined
      } : undefined,
      sourceFile: el.getAttribute('data-source-file') || undefined,
      sourceStart: Number(el.getAttribute('data-source-start')) || undefined,
      sourceEnd: Number(el.getAttribute('data-source-end')) || undefined,
      sourceLine: Number(el.getAttribute('data-source-line')) || undefined,
      sourceColumn: Number(el.getAttribute('data-source-column')) || undefined,
      editCapabilities: caps
    };
  }

  function drawBox(kind, node) {
    ensureLayer();
    if (!node) return;
    var box = kind === 'hover' ? hoverBox : selectedBox;
    if (!box) return;
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

  function getElementForChange(change) {
    if (!change) return null;
    return getElementForNode({
      domPath: change.domPath,
      nodeId: change.nodeId
    });
  }

  function getChangeKey(change) {
    return [change.domPath || change.nodeId || '', change.kind || 'style', change.property || ''].join('::');
  }

  function restoreAppliedPropertyChanges() {
    Object.keys(appliedPropertyOriginals).forEach(function(key) {
      var original = appliedPropertyOriginals[key];
      if (!original || !original.element) return;
      if (original.kind === 'text') {
        original.element.textContent = original.value || '';
      } else if (original.kind === 'attribute') {
        if (original.value == null) original.element.removeAttribute(original.property);
        else original.element.setAttribute(original.property, original.value);
      } else {
        original.element.style[original.property] = original.value || '';
      }
    });
    appliedPropertyOriginals = {};
  }

  function restoreHiddenNodes() {
    Object.keys(hiddenNodeOriginalDisplays).forEach(function(key) {
      var original = hiddenNodeOriginalDisplays[key];
      if (!original || !original.element) return;
      original.element.style.display = original.display || '';
      original.element.removeAttribute('data-visual-hidden');
    });
    hiddenNodeOriginalDisplays = {};
  }

  function applyHiddenNodes() {
    restoreHiddenNodes();
    (state.hiddenNodeIds || []).forEach(function(nodeId) {
      if (!nodeId) return;
      var el = getElementByPath(nodeId);
      if (!el) {
        try {
          el = document.querySelector('[data-visual-node-id="' + String(nodeId).replace(/"/g, '\\\\"') + '"]');
        } catch (_err) {
          el = null;
        }
      }
      if (!el) return;
      hiddenNodeOriginalDisplays[nodeId] = {
        element: el,
        display: el.style.display || ''
      };
      el.setAttribute('data-visual-hidden', 'true');
      el.style.setProperty('display', 'none', 'important');
    });
  }

  function applyPropertyChanges() {
    restoreAppliedPropertyChanges();
    (state.propertyChanges || []).forEach(function(change) {
      var el = getElementForChange(change);
      if (!el || !change || typeof change.property !== 'string') return;
      var key = getChangeKey(change);
      if (change.kind === 'text') {
        appliedPropertyOriginals[key] = {
          kind: 'text',
          element: el,
          property: change.property,
          value: el.textContent || ''
        };
        el.textContent = change.value || '';
        return;
      }
      if (change.kind === 'attribute') {
        var attrName = change.property;
        appliedPropertyOriginals[key] = {
          kind: 'attribute',
          element: el,
          property: attrName,
          value: el.getAttribute(attrName)
        };
        if (change.value == null || change.value === '') el.removeAttribute(attrName);
        else el.setAttribute(attrName, change.value);
        return;
      }
      appliedPropertyOriginals[key] = {
        kind: 'style',
        element: el,
        property: change.property,
        value: el.style[change.property] || ''
      };
      el.style[change.property] = normalizeStyleValue(change.property, change.value);
    });
    redrawSelection();
    redrawHoverFromState();
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
      property === 'letterSpacing' ||
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
      property === 'paddingTop' ||
      property === 'paddingRight' ||
      property === 'paddingBottom' ||
      property === 'paddingLeft' ||
      property === 'padding' ||
      property === 'marginTop' ||
      property === 'marginRight' ||
      property === 'marginBottom' ||
      property === 'marginLeft' ||
      property === 'margin' ||
      property === 'gap' ||
      property === 'borderWidth' ||
      property === 'borderRadius' ||
      property === 'borderTopLeftRadius' ||
      property === 'borderTopRightRadius' ||
      property === 'borderBottomRightRadius' ||
      property === 'borderBottomLeftRadius' ||
      property === 'letterSpacing' ||
      property === 'lineHeight') && /^\\d+(\\.\\d+)?$/.test(trimmed)) return trimmed + 'px';
    if (property === 'opacity' && /^\\d+(\\.\\d+)?%?$/.test(trimmed)) {
      var numeric = Number(trimmed.replace('%', ''));
      if (numeric > 1) return String(Math.max(0, Math.min(100, numeric)) / 100);
      return String(Math.max(0, Math.min(1, numeric)));
    }
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
      drawBox('selected', nextNode);
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
        drawBox('selected', nextNode);
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
      drawBox('selected', nextNode);
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
    lastHoverId = null;
    updateLabel();
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
      updateLabel();
      return;
    }
    var selected = getElementByPath(state.selectedNodeId);
    if (!selected) selected = document.querySelector('[data-visual-node-id="' + state.selectedNodeId.replace(/"/g, '\\\\"') + '"]');
    if (!selected || !isEditableElement(selected)) {
      if (selectedBox) selectedBox.style.display = 'none';
      updateLabel();
      return;
    }
    drawBox('selected', getNodeInfo(selected));
    updateLabel();
  }

  function updateLabel() {
    ensureLayer();
    if (!state.enabled) {
      if (label) label.style.display = 'none';
      return;
    }
    var hoverNodeId = state.hoverNodeId || lastHoverId;
    if (hoverNodeId) {
      var hovered = getElementByPath(hoverNodeId);
      if (!hovered) {
        try {
          hovered = document.querySelector('[data-visual-node-id="' + hoverNodeId.replace(/"/g, '\\\\"') + '"]');
        } catch (_err) {
          hovered = null;
        }
      }
      if (hovered && isEditableElement(hovered)) {
        drawLabel(getNodeInfo(hovered));
        return;
      }
    }
    if (state.selectedNodeId) {
      var selected = getElementByPath(state.selectedNodeId);
      if (!selected) selected = document.querySelector('[data-visual-node-id="' + state.selectedNodeId.replace(/"/g, '\\\\"') + '"]');
      if (selected && isEditableElement(selected)) {
        drawLabel(getNodeInfo(selected));
        return;
      }
    }
    if (label) label.style.display = 'none';
  }

  function redrawHoverFromState() {
    ensureLayer();
    var hoverNodeId = state.hoverNodeId || lastHoverId;
    if (!hoverNodeId) {
      if (hoverBox) hoverBox.style.display = 'none';
      updateLabel();
      return;
    }
    var hovered = getElementByPath(hoverNodeId);
    if (!hovered) {
      try {
        hovered = document.querySelector('[data-visual-node-id="' + hoverNodeId.replace(/"/g, '\\\\"') + '"]');
      } catch (_err) {
        hovered = null;
      }
    }
    if (!hovered || !isEditableElement(hovered)) {
      if (hoverBox) hoverBox.style.display = 'none';
      updateLabel();
      return;
    }
    var node = getNodeInfo(hovered);
    drawBox('hover', node);
    updateLabel();
  }

  function scheduleVisualOverlayRedraw() {
    if (!state.enabled || visualOverlayRedrawFrame != null) return;
    visualOverlayRedrawFrame = requestAnimationFrame(function() {
      visualOverlayRedrawFrame = null;
      redrawSelection();
      redrawHoverFromState();
      renderAnnotations();
      if (commentBubble && commentBubble.style.display !== 'none' && commentNode) {
        positionCommentBubble(commentNode, false);
      }
    });
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
      hoverNodeId: next.hoverNodeId || null,
      selectedNodeId: next.selectedNodeId || null,
      hiddenNodeIds: Array.isArray(next.hiddenNodeIds) ? next.hiddenNodeIds : [],
      propertyChanges: Array.isArray(next.propertyChanges) ? next.propertyChanges : [],
      annotations: Array.isArray(next.annotations) ? next.annotations : []
    };
    ensureLayer();
    if (!state.enabled) {
      clearHover();
      hideCommentBubble();
      if (selectedBox) selectedBox.style.display = 'none';
    }
    applyPropertyChanges();
    applyHiddenNodes();
    redrawSelection();
    redrawHoverFromState();
    renderAnnotations();
  }

  function closestEditable(target) {
    var raw = target && target.nodeType === 1 ? target : target && target.parentElement;
    var el = normalizeEditableTarget(raw);
    while (el && el !== document.body) {
      if (isEditableElement(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function collectElementStack(clientX, clientY, fallbackEl) {
    var elements = [];
    if (document.elementsFromPoint) {
      elements = document.elementsFromPoint(clientX, clientY);
    }
    if ((!elements || elements.length === 0) && fallbackEl) {
      var node = fallbackEl;
      while (node && node !== document.body) {
        elements.push(node);
        node = node.parentElement;
      }
    }
    var seen = {};
    var editable = [];
    (elements || []).forEach(function(item) {
      var normalized = normalizeEditableTarget(item);
      if (!normalized || !isEditableElement(normalized)) return;
      var path = getDomPath(normalized);
      if (!path || seen[path]) return;
      seen[path] = true;
      editable.push(getNodeInfo(normalized));
    });
    return editable.reverse();
  }

  function chooseNodeFromStack(stack, event) {
    if (!stack || stack.length === 0) return null;
    var signature = stack.map(function(item) { return item.domPath; }).join('|');
    var shouldCycle = !!(event && (event.metaKey || event.ctrlKey));
    if (shouldCycle && selectionCycleSignature === signature) {
      selectionCycleIndex = (selectionCycleIndex - 1 + stack.length) % stack.length;
    } else {
      selectionCycleSignature = signature;
      selectionCycleIndex = stack.length - 1;
    }
    if (!shouldCycle) selectionCycleSignature = '';
    return stack[selectionCycleIndex] || stack[stack.length - 1];
  }

  function moveSelectedNodeToStackEnd(stack, selected) {
    if (!selected) return stack || [];
    return (stack || []).filter(function(item) {
      return item.domPath !== selected.domPath;
    }).concat([selected]);
  }

  function collectAncestorNodeStack(element) {
    var stack = [];
    var current = element;
    while (current && current !== document.body) {
      if (isEditableElement(current)) stack.unshift(getNodeInfo(current));
      current = current.parentElement;
    }
    return stack;
  }

  function reportKeyboardSelection(element) {
    if (!element || !isEditableElement(element)) return false;
    var node = getNodeInfo(element);
    var stack = collectAncestorNodeStack(element);
    state.selectedNodeId = node.domPath;
    drawBox('selected', node);
    window.parent.postMessage({ type: 'VISUAL_SELECT', node: node, nodeStack: stack }, '*');
    return true;
  }

  function buildVisualNodeTree(rootEl, options) {
    var maxNodes = options && options.maxNodes ? options.maxNodes : 220;
    var count = 0;

    function walk(el) {
      if (!el || !isEditableElement(el) || count >= maxNodes) return null;
      count += 1;
      var info = getNodeInfo(el);
      var children = [];
      var child = el.firstElementChild;
      while (child && count < maxNodes) {
        var childTree = walk(child);
        if (childTree) children.push(childTree);
        child = child.nextElementSibling;
      }
      info.children = children;
      return info;
    }

    return walk(rootEl);
  }

  function collectVisualNodeTree(rootEl, options) {
    var roots = [];
    var maxNodes = options && options.maxNodes ? options.maxNodes : 260;
    var count = 0;

    function walk(el) {
      if (!el || count >= maxNodes) return null;
      if (!isEditableElement(el)) return null;
      count += 1;
      var info = getNodeInfo(el);
      var children = [];
      var child = el.firstElementChild;
      while (child && count < maxNodes) {
        var childTree = walk(child);
        if (childTree) children.push(childTree);
        child = child.nextElementSibling;
      }
      info.children = children;
      return info;
    }

    var root = rootEl || document.body;
    var child = root.firstElementChild;
    while (child && count < maxNodes) {
      var tree = walk(child);
      if (tree) roots.push(tree);
      child = child.nextElementSibling;
    }
    return roots;
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

  document.addEventListener('pointerover', function(event) {
    if (!state.enabled) return;
    var el = closestEditable(event.target);
    if (state.annotationMode) el = resolveAnnotationTarget(el);
    if (!el) {
      clearHover();
      return;
    }
    var hoverId = el.getAttribute('data-visual-node-id') || getDomPath(el);
    if (hoverId === lastHoverId) return;
    lastHoverId = hoverId;
    var node = getNodeInfo(el);
    drawBox('hover', node);
    updateLabel();
  }, true);

  document.addEventListener('pointerout', function(event) {
    if (!state.enabled) return;
    if (event.relatedTarget && document.documentElement.contains(event.relatedTarget)) return;
    clearHover();
  }, true);

  document.addEventListener('keydown', function(event) {
    if (!state.enabled || state.annotationMode) return;
    var eventTarget = event.target;
    if (eventTarget && eventTarget.closest && eventTarget.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      state.selectedNodeId = null;
      if (selectedBox) selectedBox.style.display = 'none';
      updateLabel();
      window.parent.postMessage({ type: 'VISUAL_SELECT', node: null, nodeStack: [] }, '*');
      return;
    }
    if (!state.selectedNodeId) return;
    var selected = getElementByPath(state.selectedNodeId);
    if (!selected) return;
    var next = null;
    if (event.key === 'Enter') {
      next = event.shiftKey ? selected.parentElement : selected.firstElementChild;
    } else if (event.key === 'Tab') {
      next = event.shiftKey ? selected.previousElementSibling : selected.nextElementSibling;
    } else {
      return;
    }
    next = normalizeEditableTarget(next);
    if (!next || !reportKeyboardSelection(next)) return;
    event.preventDefault();
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
      state.selectedNodeId = null;
      if (selectedBox) selectedBox.style.display = 'none';
      updateLabel();
      window.parent.postMessage({ type: 'VISUAL_SELECT', node: null, nodeStack: [] }, '*');
      return;
    }
    var stack = collectElementStack(event.clientX, event.clientY, el);
    var node = chooseNodeFromStack(stack, event) || getNodeInfo(el);
    stack = moveSelectedNodeToStackEnd(stack, node);
    state.selectedNodeId = node.domPath;
    drawBox('selected', node);
    updateLabel();
    if (state.annotationMode) {
      showCommentBubble(node);
      window.parent.postMessage({ type: 'VISUAL_SELECT', node: node, nodeStack: stack }, '*');
      return;
    }
    window.parent.postMessage({ type: 'VISUAL_SELECT', node: node, nodeStack: stack }, '*');
  }, true);

  document.addEventListener('contextmenu', function(event) {
    if (!state.enabled || state.annotationMode) return;
    if (isOverlay(event.target)) return;
    var el = closestEditable(event.target);
    event.preventDefault();
    event.stopPropagation();
    if (!el) {
      state.selectedNodeId = null;
      if (selectedBox) selectedBox.style.display = 'none';
      updateLabel();
      window.parent.postMessage({
        type: 'VISUAL_SELECT',
        node: null,
        nodeStack: [],
        openLayerPicker: true,
        contextMenuPoint: { x: event.clientX, y: event.clientY }
      }, '*');
      return;
    }
    var stack = collectElementStack(event.clientX, event.clientY, el);
    var node = stack.length > 0 ? stack[stack.length - 1] : getNodeInfo(el);
    stack = moveSelectedNodeToStackEnd(stack, node);
    state.selectedNodeId = node.domPath;
    drawBox('selected', node);
    updateLabel();
    window.parent.postMessage({
      type: 'VISUAL_SELECT',
      node: node,
      nodeStack: stack,
      nodeTree: buildVisualNodeTree(el, { maxNodes: 160 }),
      openLayerPicker: true,
      contextMenuPoint: { x: event.clientX, y: event.clientY }
    }, '*');
  }, true);

  window.addEventListener('blur', function() {
    if (!commentBubble || commentBubble.style.display === 'none') return;
    if (!editingAnnotationId || !commentInput || commentInput.value.trim()) return;
    setTimeout(function() {
      if (document.hasFocus()) return;
      dismissCommentBubble({ deleteEmptyAnnotation: true });
    }, 0);
  });

  document.addEventListener('scroll', scheduleVisualOverlayRedraw, true);
  window.addEventListener('resize', scheduleVisualOverlayRedraw);
  if (typeof ResizeObserver !== 'undefined') {
    var visualResizeObserver = new ResizeObserver(scheduleVisualOverlayRedraw);
    visualResizeObserver.observe(document.body);
  }

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

  window.__VISUAL_EDIT__ = {
    setState: setState,
    redrawSelection: redrawSelection,
    renderAnnotations: renderAnnotations,
    applyPropertyChanges: applyPropertyChanges,
    collectVisualNodeTree: function() {
      return collectVisualNodeTree(document.body, { maxNodes: 260 });
    },
    getNodeInfo: getNodeInfo,
    getDomPath: getDomPath,
    resolveElementByPath: getElementByPath
  };
})();
`;

/**
 * 评论模式运行时脚本
 *
 * 独立于视觉编辑（visualEditScript），不依赖 state.enabled，
 * 因此浏览端（未开启视觉编辑）也能使用评论功能。
 *
 * 父→子消息：
 *   ENTER_COMMENT_MODE / EXIT_COMMENT_MODE：开关评论模式（十字光标 + 悬停高亮）
 *   LOCATE_ELEMENT：按 domPath 查询元素当前位置，回 ELEMENT_LOCATION_RESULT
 * 子→父消息：
 *   COMMENT_CLICK：评论模式下点击，携带坐标 + 该位置最内层元素的 VisualNodeInfo
 *   COMMENT_VIEW_STATE：当前滚动/文档尺寸（常驻上报，用于 pin 跟随定位）
 *   ELEMENT_LOCATION_RESULT：LOCATE_ELEMENT 的查询结果
 */
export const commentModeScript = `
(function() {
  var commentMode = false;
  var hoverOutline = null;
  var lastHoverEl = null;
  var viewStateTimer = null;

  function getDocSize() {
    return {
      docWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth),
      docHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight)
    };
  }

  function postViewState() {
    var size = getDocSize();
    window.parent.postMessage({
      type: 'COMMENT_VIEW_STATE',
      scrollX: window.scrollX || window.pageXOffset || 0,
      scrollY: window.scrollY || window.pageYOffset || 0,
      docWidth: size.docWidth,
      docHeight: size.docHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    }, '*');
  }

  function scheduleViewState() {
    if (viewStateTimer) return;
    viewStateTimer = setTimeout(function() {
      viewStateTimer = null;
      postViewState();
    }, 80);
  }

  window.addEventListener('scroll', scheduleViewState, true);
  window.addEventListener('resize', scheduleViewState);

  function isCommentOverlay(el) {
    return !!(el && el.getAttribute && el.getAttribute('data-comment-overlay'));
  }

  function ensureOutline() {
    if (hoverOutline) return hoverOutline;
    hoverOutline = document.createElement('div');
    hoverOutline.setAttribute('data-comment-overlay', 'true');
    var s = hoverOutline.style;
    s.position = 'fixed';
    s.pointerEvents = 'none';
    s.border = '2px solid rgba(59,130,246,0.85)';
    s.background = 'rgba(59,130,246,0.08)';
    s.borderRadius = '3px';
    s.zIndex = '2147483646';
    s.display = 'none';
    s.boxSizing = 'border-box';
    s.transition = 'all 0.08s ease-out';
    document.documentElement.appendChild(hoverOutline);
    return hoverOutline;
  }

  function clearOutline() {
    if (hoverOutline) hoverOutline.style.display = 'none';
    lastHoverEl = null;
  }

  function pickElement(el) {
    var node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      if (!isCommentOverlay(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function setCursor(on) {
    try {
      document.documentElement.style.cursor = on ? 'crosshair' : '';
      document.body.style.cursor = on ? 'crosshair' : '';
    } catch (_e) {}
  }

  function enterCommentMode() {
    commentMode = true;
    setCursor(true);
    postViewState();
  }

  function exitCommentMode() {
    commentMode = false;
    setCursor(false);
    clearOutline();
  }

  document.addEventListener('pointermove', function(event) {
    if (!commentMode) return;
    var el = pickElement(document.elementFromPoint(event.clientX, event.clientY));
    if (!el) { clearOutline(); return; }
    if (el === lastHoverEl) return;
    lastHoverEl = el;
    var rect = el.getBoundingClientRect();
    var outline = ensureOutline();
    outline.style.display = 'block';
    outline.style.left = rect.x + 'px';
    outline.style.top = rect.y + 'px';
    outline.style.width = rect.width + 'px';
    outline.style.height = rect.height + 'px';
  }, true);

  document.addEventListener('click', function(event) {
    if (!commentMode) return;
    if (isCommentOverlay(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    var el = pickElement(event.target);
    var node = null;
    var outerHtml = undefined;
    if (el) {
      if (window.__VISUAL_EDIT__ && window.__VISUAL_EDIT__.getNodeInfo) {
        try { node = window.__VISUAL_EDIT__.getNodeInfo(el); } catch (_e) { node = null; }
      }
      try { if (el.outerHTML) outerHtml = el.outerHTML.slice(0, 300); } catch (_e) {}
    }
    window.parent.postMessage({
      type: 'COMMENT_CLICK',
      x: event.clientX,
      y: event.clientY,
      scrollX: window.scrollX || window.pageXOffset || 0,
      scrollY: window.scrollY || window.pageYOffset || 0,
      docWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth),
      docHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      node: node,
      outerHtml: outerHtml
    }, '*');
  }, true);

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var data = event.data || {};
    if (data.type === 'ENTER_COMMENT_MODE') { enterCommentMode(); return; }
    if (data.type === 'EXIT_COMMENT_MODE') { exitCommentMode(); return; }
    if (data.type === 'LOCATE_ELEMENT') {
      var domPath = data.domPath;
      var result = { type: 'ELEMENT_LOCATION_RESULT', requestId: data.requestId, domPath: domPath || null, found: false, rect: null };
      if (domPath && window.__VISUAL_EDIT__ && window.__VISUAL_EDIT__.resolveElementByPath) {
        try {
          var el = window.__VISUAL_EDIT__.resolveElementByPath(domPath);
          if (el) {
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0) {
              result.found = true;
              result.rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }
          }
        } catch (_e) {}
      }
      window.parent.postMessage(result, '*');
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', postViewState);
  } else {
    postViewState();
  }
  window.addEventListener('load', postViewState);
})();
`;

/**
 * 位置编辑模式脚本（iframe 内执行）。
 *
 * 独立于视觉编辑（visualEditScript）和评论模式（commentModeScript），
 * 提供在预览内直接拖拽元素调整位置的所见即所得体验。
 *
 * 父→子消息：
 *   ENTER_POSITION_EDIT { items, positions }：激活位置编辑模式
 *   EXIT_POSITION_EDIT：退出位置编辑模式
 * 子→父消息：
 *   POSITION_CHANGE { key, x, y }：拖拽完成后报告新坐标
 *   POSITION_EDIT_READY：编辑模式已激活（用于初始位置同步）
 */
export const positionEditScript = `
(function() {
  var editing = false;
  var editItems = [];
  var editPositions = {};
  var dimming = true;
  var dragTarget = null;
  var dragStartX = 0;
  var dragStartY = 0;
  var dragOrigLeft = 0;
  var dragOrigTop = 0;
  var containerEl = null;

  function getContainer() {
    if (containerEl) return containerEl;
    var root = document.getElementById('root');
    if (root && root.firstElementChild) {
      containerEl = root.firstElementChild;
    } else {
      containerEl = document.body;
    }
    return containerEl;
  }

  function injectPosKey(items, positions) {
    var root = document.getElementById('root');
    if (!root) { console.warn('[pos-edit] injectPosKey: #root not found'); return; }
    var container = getContainer();
    var containerRect = container.getBoundingClientRect();
    var all = root.querySelectorAll('*');
    var assigned = {};
    var absoluteCount = 0;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.hasAttribute('data-pos-key')) continue;
      var cs = window.getComputedStyle(el);
      if (cs.position !== 'absolute') continue;
      absoluteCount++;
      var rect = el.getBoundingClientRect();
      var elLeft = Math.round(rect.left - containerRect.left);
      var elTop = Math.round(rect.top - containerRect.top);
      for (var j = 0; j < items.length; j++) {
        var key = items[j];
        if (assigned[key]) continue;
        var pos = positions[key] || { x: 0, y: 0 };
        if (Math.abs(elLeft - pos.x) <= 3 && Math.abs(elTop - pos.y) <= 3) {
          el.setAttribute('data-pos-key', key);
          assigned[key] = true;
          console.log('[pos-edit] injectPosKey: matched', key, 'at', elLeft, elTop, '(expected', pos.x, pos.y, ')');
          break;
        }
      }
    }
    var matched = Object.keys(assigned);
    var unmatched = [];
    for (var k = 0; k < items.length; k++) {
      if (!assigned[items[k]]) unmatched.push(items[k]);
    }
    console.log('[pos-edit] injectPosKey: scanned', absoluteCount, 'absolute elements, matched', matched.length + '/' + items.length, matched);
    if (unmatched.length > 0) {
      console.warn('[pos-edit] injectPosKey: unmatched keys:', unmatched, 'container rect:', containerRect.width + 'x' + containerRect.height);
      // 尝试放宽匹配：打印所有 absolute 元素的位置
      for (var m = 0; m < all.length; m++) {
        var mel = all[m];
        if (mel.hasAttribute('data-pos-key')) continue;
        var mcs = window.getComputedStyle(mel);
        if (mcs.position !== 'absolute') continue;
        var mrect = mel.getBoundingClientRect();
        console.log('[pos-edit] absolute element:', mel.tagName, 'rect:', Math.round(mrect.left - containerRect.left), Math.round(mrect.top - containerRect.top), Math.round(mrect.width), Math.round(mrect.height));
      }
    }
  }

  function cleanupPosKey(items) {
    for (var i = 0; i < items.length; i++) {
      var els = document.querySelectorAll('[data-pos-key="' + items[i] + '"]');
      for (var j = 0; j < els.length; j++) {
        els[j].removeAttribute('data-pos-key');
        els[j].style.cursor = '';
      }
    }
  }

  function setDimCSS(on) {
    if (on) {
      document.body.classList.add('position-editing');
      document.body.classList.add('position-editing-dimming');
      applyElementDimming();
    } else {
      document.body.classList.remove('position-editing');
      document.body.classList.remove('position-editing-dimming');
      clearElementDimming();
    }
  }

  function applyElementDimming() {
    clearElementDimming();
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.id === 'root') continue;
      if (el.hasAttribute('data-pos-key')) continue;
      if (el.querySelector('[data-pos-key]')) continue;
      el.style.setProperty('opacity', '0.3', 'important');
      el.classList.add('pos-dimmed');
    }
  }

  function clearElementDimming() {
    var dimmed = document.body.querySelectorAll('.pos-dimmed');
    for (var i = 0; i < dimmed.length; i++) {
      dimmed[i].style.removeProperty('opacity');
      dimmed[i].classList.remove('pos-dimmed');
    }
  }

  function setGrabCursors(on) {
    var els = document.querySelectorAll('[data-pos-key]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-pos-key');
      if (!key || editItems.indexOf(key) === -1) continue;
      el.style.cursor = on ? 'grab' : '';
    }
  }

  function applyPosition(key, x, y) {
    var el = document.querySelector('[data-pos-key="' + key + '"]');
    if (!el) return;
    var container = getContainer();
    var containerRect = container.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();
    // 清除现有 transform，基于 DOM 原始位置（style.left/top）计算偏移
    el.style.transform = '';
    var currentLeft = elRect.left - containerRect.left;
    var currentTop = elRect.top - containerRect.top;
    var offsetX = x - currentLeft;
    var offsetY = y - currentTop;
    if (offsetX !== 0 || offsetY !== 0) {
      el.style.transform = 'translate(' + offsetX + 'px, ' + offsetY + 'px)';
    }
  }

  function exit() {
    editing = false;
    setGrabCursors(false);
    setDimCSS(false);
    cleanupPosKey(editItems);
    window.parent.postMessage({ type: 'POSITION_EDIT_READY', active: false }, '*');
  }

  function enter(items, positions) {
    editItems = items;
    editPositions = positions;
    injectPosKey(items, positions);
    editing = true;
    setGrabCursors(true);
    if (dimming) {
      setDimCSS(true);
    }
    window.parent.postMessage({ type: 'POSITION_EDIT_READY', active: true }, '*');
  }

  document.addEventListener('pointerdown', function(event) {
    if (!editing) return;
    var hit = getTopMostPosKeyElement(event.clientX, event.clientY);
    if (!hit) return;
    event.preventDefault();
    dragTarget = hit.el;
    dragTarget.setPointerCapture(event.pointerId);
    dragTarget.style.cursor = 'grabbing';
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    var rect = dragTarget.getBoundingClientRect();
    dragOrigLeft = rect.left - getContainer().getBoundingClientRect().left;
    dragOrigTop = rect.top - getContainer().getBoundingClientRect().top;
    dragTarget.style.transform = dragTarget.style.transform || '';
    var children = dragTarget.querySelectorAll('*');
    for (var c = 0; c < children.length; c++) {
      children[c].style.pointerEvents = 'none';
    }
    dragTarget.setAttribute('data-pos-dragging', 'true');
  }, true);

  document.addEventListener('pointermove', function(event) {
    if (!editing || !dragTarget) return;
    var deltaX = event.clientX - dragStartX;
    var deltaY = event.clientY - dragStartY;
    var targetRect = dragTarget.getBoundingClientRect();
    var result = constrainToContainer(targetRect, deltaX, deltaY);
    var offsetX = result.constrainedLeft - dragOrigLeft;
    var offsetY = result.constrainedTop - dragOrigTop;
    dragTarget.style.transform = 'translate(' + offsetX + 'px, ' + offsetY + 'px)';
  }, true);

  document.addEventListener('pointerup', function(event) {
    if (!dragTarget) return;
    var key = dragTarget.getAttribute('data-pos-key');
    var children = dragTarget.querySelectorAll('*');
    for (var c = 0; c < children.length; c++) {
      children[c].style.pointerEvents = '';
    }
    dragTarget.style.cursor = 'grab';
    dragTarget.removeAttribute('data-pos-dragging');

    var transform = dragTarget.style.transform || '';
    var match = transform.match(/translate\\(([-\\d.]+)px,\\s*([-\\d.]+)px\\)/);
    var finalX = dragOrigLeft;
    var finalY = dragOrigTop;
    if (match) {
      finalX += parseFloat(match[1]);
      finalY += parseFloat(match[2]);
    }
    finalX = Math.round(Math.max(0, finalX));
    finalY = Math.round(Math.max(0, finalY));

    dragTarget.style.transform = '';
    dragTarget = null;

    window.parent.postMessage({
      type: 'POSITION_CHANGE',
      key: key,
      x: finalX,
      y: finalY
    }, '*');
  }, true);

  document.addEventListener('pointercancel', function() {
    if (dragTarget) {
      var children = dragTarget.querySelectorAll('*');
      for (var c = 0; c < children.length; c++) {
        children[c].style.pointerEvents = '';
      }
      dragTarget.style.cursor = 'grab';
      dragTarget.style.transform = '';
      dragTarget.removeAttribute('data-pos-dragging');
      dragTarget = null;
    }
  }, true);

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var data = event.data || {};
    if (data.type === 'ENTER_POSITION_EDIT') {
      data.items && data.positions && enter(data.items, data.positions);
      return;
    }
    if (data.type === 'EXIT_POSITION_EDIT') {
      exit();
      return;
    }
    if (data.type === 'TOGGLE_POSITION_DIMMING') {
      dimming = !!data.enabled;
      if (editing) setDimCSS(dimming);
      return;
    }
    if (data.type === 'APPLY_POSITIONS') {
      var posMap = data.positions || {};
      for (var k in posMap) {
        if (posMap.hasOwnProperty(k)) {
          applyPosition(k, posMap[k].x, posMap[k].y);
        }
      }
      return;
    }
  });

  function constrainToContainer(targetRect, deltaX, deltaY) {
    var container = getContainer();
    var containerRect = container.getBoundingClientRect();
    var newLeft = dragOrigLeft + deltaX;
    var newTop = dragOrigTop + deltaY;
    newLeft = Math.max(0, Math.min(newLeft, containerRect.width - targetRect.width));
    newTop = Math.max(0, Math.min(newTop, containerRect.height - targetRect.height));
    return { constrainedLeft: newLeft, constrainedTop: newTop };
  }

  function getTopMostPosKeyElement(x, y) {
    var els = document.elementsFromPoint(x, y);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.hasAttribute && el.hasAttribute('data-pos-key')) {
        var key = el.getAttribute('data-pos-key');
        if (editItems.indexOf(key) !== -1) return { el: el, key: key };
      }
    }
    return null;
  }
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

function resolveRuntimeUrl(url: string, runtimeBaseUrl?: string): string {
  if (/^https?:\/\//.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  if (!runtimeBaseUrl) return url;
  const base = runtimeBaseUrl.replace(/\/+$/, "");
  if (
    base.endsWith(PREVIEW_RUNTIME_PATH_PREFIX) &&
    url.startsWith(`${PREVIEW_RUNTIME_PATH_PREFIX}/`)
  ) {
    return `${base}${url.slice(PREVIEW_RUNTIME_PATH_PREFIX.length)}`;
  }
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

function buildRuntimeImports(
  cdnBase: string,
  runtimeBaseUrl: string | undefined,
  useCdnRuntime: boolean | undefined,
): Record<string, string> {
  if (useCdnRuntime) {
    return {
      react: `${cdnBase}/react@18.3.1`,
      "react-dom": `${cdnBase}/react-dom@18.3.1`,
      "react-dom/client": `${cdnBase}/react-dom@18.3.1/client`,
      "react/jsx-runtime": `${cdnBase}/react@18.3.1/jsx-runtime`,
      "react/jsx-dev-runtime": `${cdnBase}/react@18.3.1/jsx-dev-runtime`,
      "lucide-react": `${cdnBase}/lucide-react@0.323.0?deps=react@18.3.1,react-dom@18.3.1`,
      "framer-motion": `${cdnBase}/framer-motion@12.38.0?deps=react@18.3.1,react-dom@18.3.1`,
      "svgaplayerweb": `${cdnBase}/svgaplayerweb@2.3.1`,
      "@preview/sdk": resolveRuntimeUrl(DEFAULT_RUNTIME_IMPORTS["@preview/sdk"], runtimeBaseUrl),
    };
  }

  return Object.fromEntries(
    Object.entries(DEFAULT_RUNTIME_IMPORTS).map(([specifier, url]) => [
      specifier,
      resolveRuntimeUrl(url, runtimeBaseUrl),
    ]),
  );
}

export function generateIframeHtml(
  options: IframeTemplateOptions = {},
): string {
  const {
    cssImports = [],
    compiledCode,
    compiledCodeUrl,
    configData,
    cdnBaseUrl,
    runtimeBaseUrl,
    useCdnRuntime,
    supportUrlMode = true,
    baseOrigin,
  } = options;
  const cdnBase = cdnBaseUrl || DEFAULT_CDN_BASE;
  const runtimeImports = buildRuntimeImports(cdnBase, runtimeBaseUrl, useCdnRuntime);
  const tailwindRuntimeUrl = useCdnRuntime
    ? "https://cdn.jsdelivr.net/npm/tailwindcss-cdn@3.4.10/tailwindcss.min.js"
    : resolveRuntimeUrl(
        `${PREVIEW_RUNTIME_PATH_PREFIX}/vendor/tailwindcss.js`,
        runtimeBaseUrl,
      );

  const cssLinks = generateCssLinks(cssImports, cdnBase);
  const initialCode = compiledCode ? JSON.stringify(compiledCode) : "null";
  const initialCodeUrl = compiledCodeUrl ? JSON.stringify(compiledCodeUrl) : "null";
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
      window.parent.postMessage({ type: 'RUNTIME_ERROR', requestId: currentRequestId, ...safePayload }, '*');
    }

    function reportRuntimeTiming(stage, details) {
      try {
        var now = performance.now();
        var payload = Object.assign({
          source: 'preview-runtime',
          stage: stage,
          sinceShellStart: Math.round(now - shellStartedAt),
          requestId: currentRequestId
        }, details || {});
        try { console.info('[PreviewRuntime]', payload); } catch (_consoleErr) {}
        window.parent.postMessage({
          type: 'CONSOLE_LOG',
          payload: {
            level: 'info',
            args: JSON.stringify(payload),
            timestamp: Date.now()
          }
        }, '*');
      } catch (_err) {}
    }

    function summarizeResourceTimings() {
      try {
        var entries = performance.getEntriesByType('resource') || [];
        var relevant = entries
          .filter(function(entry) {
            return entry.name.indexOf('${cdnBase}') === 0 ||
              entry.name.indexOf('https://cdn.jsdelivr.net/') === 0 ||
              entry.name.indexOf('blob:') === 0;
          })
          .slice(-12)
          .map(function(entry) {
            return {
              name: entry.name
                .replace('${cdnBase}', '<cdn>')
                .replace('https://cdn.jsdelivr.net/', '<jsdelivr>/')
                .slice(0, 180),
              initiatorType: entry.initiatorType,
              durationMs: Math.round(entry.duration),
              startMs: Math.round(entry.startTime),
              transferSize: entry.transferSize || 0,
              encodedBodySize: entry.encodedBodySize || 0
            };
          });
        return {
          count: entries.length,
          relevantCount: relevant.length,
          relevant: relevant
        };
      } catch (err) {
        return { error: err && err.message ? err.message : String(err) };
      }
    }

    function loadModuleFromCode(code, thisVersion) {
      const blob = new Blob([code], { type: 'application/javascript' });
      const moduleUrl = URL.createObjectURL(blob);
      var importStart = performance.now();
      reportRuntimeTiming('module_import_start', {
        version: thisVersion,
        codeBytes: code.length
      });
      import(moduleUrl)
        .then((module) => {
          if (thisVersion !== updateVersion) return;
          currentComponent = module.default || null;
          reportRuntimeTiming('module_import_done', {
            version: thisVersion,
            importMs: Math.round(performance.now() - importStart),
            hasDefaultExport: !!module.default,
            resources: summarizeResourceTimings()
          });
          URL.revokeObjectURL(moduleUrl);
          if (module.default) {
            renderComponent();
          } else {
            reportRuntimeError({ stage: 'component_export', error: '模块没有默认导出（export default）' });
          }
        })
        .catch((err) => {
          if (thisVersion !== updateVersion) return;
          reportRuntimeError({ stage: 'dependency_import', error: err.message, stack: err.stack });
        });
    }`;

  const loadModuleFromUrlFn = `
    function loadModuleFromUrl(moduleUrl, thisVersion) {
      var importStart = performance.now();
      reportRuntimeTiming('module_import_start', {
        version: thisVersion,
        codeUrl: moduleUrl
      });
      import(moduleUrl)
        .then((module) => {
          if (thisVersion !== updateVersion) return;
          currentComponent = module.default || null;
          reportRuntimeTiming('module_import_done', {
            version: thisVersion,
            importMs: Math.round(performance.now() - importStart),
            hasDefaultExport: !!module.default,
            resources: summarizeResourceTimings()
          });
          if (module.default) {
            renderComponent();
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
      if (type === 'UPDATE_CODE' || type === 'UPDATE_MODULE') {
        var isModuleUrl = type === 'UPDATE_MODULE' || !!isUrl;
        var incomingCode = moduleUrl || code;
        currentRequestId = typeof requestId === 'number' ? requestId : null;
        reportRuntimeTiming('update_code_received', { isUrl: isModuleUrl });
        currentConfig = newConfigData || {};
        window.__DEMO_PROPS__ = currentConfig;
        updateAppRuntime(appState, routeParams);
        updateCssLinks(newCssImports || []);

        const thisVersion = ++updateVersion;

        if (isModuleUrl) {
          loadModuleFromUrl(incomingCode, thisVersion);
        } else {
          loadModuleFromCode(incomingCode, thisVersion);
        }
      }`
    : `
      if (type === 'UPDATE_CODE') {
        currentRequestId = typeof requestId === 'number' ? requestId : null;
        reportRuntimeTiming('update_code_received', { isUrl: false });
        currentConfig = newConfigData || {};
        window.__DEMO_PROPS__ = currentConfig;
        updateAppRuntime(appState, routeParams);
        updateCssLinks(newCssImports || []);

        const thisVersion = ++updateVersion;

        const blob = new Blob([code], { type: 'application/javascript' });
        const moduleUrl = URL.createObjectURL(blob);
        var importStart = performance.now();
        reportRuntimeTiming('module_import_start', {
          version: thisVersion,
          codeBytes: code.length
        });

        import(moduleUrl)
          .then((module) => {
            if (thisVersion !== updateVersion) return;
            currentComponent = module.default || null;
            reportRuntimeTiming('module_import_done', {
              version: thisVersion,
              importMs: Math.round(performance.now() - importStart),
              hasDefaultExport: !!module.default,
              resources: summarizeResourceTimings()
            });
            URL.revokeObjectURL(moduleUrl);
            if (module.default) {
              renderComponent();
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

    ::-webkit-scrollbar { display: none; }
    html, body { scrollbar-width: none; -ms-overflow-style: none; }
  </style>
${cssLinks}
  <script type="importmap">
  {
    "imports": ${JSON.stringify(runtimeImports, null, 6)}
  }
  </script>
  <script async src="${tailwindRuntimeUrl}"></script>
</head>
<body>
  <div id="root"></div>

  <script type="module">
    ${consoleInterceptScript}
    ${visualEditScript}
    ${commentModeScript}
    ${positionEditScript}

    import React from 'react';
    import ReactDOM from 'react-dom/client';

    let currentRoot = null;
    let currentConfig = ${initialConfig};
    let currentAppState = {};
    let currentRouteParams = {};
    let currentComponent = null;
    let updateVersion = 0;
    let currentRequestId = null;
    let isSleeping = false;

    window.__DEMO_PROPS__ = currentConfig;
    window.__APP_STATE__ = currentAppState;
    window.__ROUTE_PARAMS__ = currentRouteParams;

    // 测量页面完整内容高度（可能超过当前视口/设计高度）。
    // 仅靠 body 的 contentRect 在页面使用 h-screen / height:100vh 时会被钉死在视口高度，
    // 导致超出部分无法上报，画布卡片无法展示完整页面。这里取三者最大值：
    // 1) body 自身高度；2) body 直接子元素的最大下边缘；3) 文档可滚动高度（内容溢出视口时）。
    // 当内容未溢出视口时不采用 scrollHeight，以保留“内容变矮时卡片收缩”的行为。
      function measureFullContentHeight() {
        var bodyRect = document.body.getBoundingClientRect();
        var height = bodyRect.height;
        var children = document.body.children;
        for (var i = 0; i < children.length; i++) {
          var bottom = children[i].getBoundingClientRect().bottom - bodyRect.top;
          if (bottom > height) height = bottom;
        }
        // 穿透 #root 以绕过父级 height:100% 导致的容器膨胀
        var root = document.getElementById('root');
        if (root) {
          var rc = root.children;
          var rootMaxBottom = 0;
          for (var i = 0; i < rc.length; i++) {
            var rcb = rc[i].getBoundingClientRect().bottom - bodyRect.top;
            if (rcb > rootMaxBottom) rootMaxBottom = rcb;
          }
          if (rootMaxBottom > 0 && rootMaxBottom < height) {
            height = rootMaxBottom;
          }
        }
        var scrollHeight = document.documentElement.scrollHeight || 0;
        var viewportHeight = window.innerHeight || 0;
        if (scrollHeight > viewportHeight + 1 && scrollHeight > height) {
          height = scrollHeight;
        }
        return Math.round(height);
      }

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

    function RenderCommitReporter(props) {
      React.useLayoutEffect(function() {
        if (props.version !== updateVersion || props.requestId !== currentRequestId) return;
        reportRuntimeTiming('render_committed', { version: props.version });
        window.parent.postMessage({ type: 'LOADED', requestId: props.requestId }, '*');
      }, [props.version, props.requestId]);
      return null;
    }

    function renderComponent() {
      if (!currentComponent) return;
      const container = document.getElementById('root');
      if (!container) return;
      if (!currentRoot) {
        currentRoot = ReactDOM.createRoot(container);
      }
      const renderVersion = updateVersion;
      const renderRequestId = currentRequestId;
      currentRoot.render(
        React.createElement(ErrorBoundary, { key: renderVersion },
          React.createElement(React.Fragment, null,
            React.createElement(currentComponent, currentConfig),
            React.createElement(RenderCommitReporter, {
              version: renderVersion,
              requestId: renderRequestId
            })
          )
        )
      );
      reportRuntimeTiming('render_invoked', { version: updateVersion });
      requestAnimationFrame(function() {
        var h = measureFullContentHeight();
        if (h >= 50) {
          window.parent.postMessage({ type: 'RESIZE', height: h, requestId: currentRequestId }, '*');
        }
      });
      setTimeout(function() {
        if (window.__VISUAL_EDIT__ && window.__VISUAL_EDIT__.applyPropertyChanges) {
          window.__VISUAL_EDIT__.applyPropertyChanges();
        }
      }, 0);
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

    ${loadModuleFn.trim()}
    ${loadModuleFromUrlFn.trim()}
    const shellStartedAt = performance.now();
    reportRuntimeTiming('shell_start', {
      cdnBase: '${cdnBase}',
      resources: summarizeResourceTimings()
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;

      const { type, code, moduleUrl, configData: newConfigData, cssImports: newCssImports, appState, routeParams, requestId${supportUrlMode ? ", isUrl" : ""} } = event.data;

      if (type === 'SLEEP') {
        isSleeping = true;
        return;
      }

      if (type === 'WAKE') {
        isSleeping = false;
        requestAnimationFrame(function() {
          window.parent.postMessage({ type: 'RESIZE', height: measureFullContentHeight(), requestId: currentRequestId }, '*');
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
              window.parent.postMessage({ type: 'POSITIONABLE_SIZES_RESULT', sizes: sizes2, requestId: currentRequestId }, '*');
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
            window.parent.postMessage({ type: 'POSITIONABLE_SIZES_RESULT', sizes: {}, requestId: currentRequestId }, '*');
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
          var nodes = window.__VISUAL_EDIT__ && window.__VISUAL_EDIT__.collectVisualNodeTree
            ? window.__VISUAL_EDIT__.collectVisualNodeTree()
            : [];
          window.parent.postMessage({ type: 'VISUAL_NODE_TREE_RESULT', nodes: nodes }, '*');
        } catch (err) {
          window.parent.postMessage({ type: 'VISUAL_NODE_TREE_RESULT', nodes: [] }, '*');
        }
      }
    });

    var lastResizeTime = 0;
    var lastReportedHeight = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (isSleeping) return;
      var now = Date.now();
      if (now - lastResizeTime < 50) return;
      lastResizeTime = now;
      const height = measureFullContentHeight();
      if (Math.abs(height - lastReportedHeight) <= 1) return;
      lastReportedHeight = height;
      window.parent.postMessage({ type: 'RESIZE', height, requestId: currentRequestId }, '*');
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

    reportRuntimeTiming('ready_sent');
    window.parent.postMessage({ type: 'READY' }, '*');

    const initialCode = ${initialCode};
    const initialCodeUrl = ${initialCodeUrl};
    if (initialCode) {
      window.__DEMO_PROPS__ = currentConfig;
      const blob = new Blob([initialCode], { type: 'application/javascript' });
      const moduleUrl = URL.createObjectURL(blob);
      var initialImportStart = performance.now();
      reportRuntimeTiming('module_import_start', {
        version: updateVersion,
        codeBytes: initialCode.length,
        initial: true
      });
      import(moduleUrl)
        .then((module) => {
          currentComponent = module.default;
          reportRuntimeTiming('module_import_done', {
            version: updateVersion,
            importMs: Math.round(performance.now() - initialImportStart),
            hasDefaultExport: !!module.default,
            initial: true,
            resources: summarizeResourceTimings()
          });
          renderComponent();
          URL.revokeObjectURL(moduleUrl);
          window.parent.postMessage({ type: 'COMPONENT_READY', requestId: currentRequestId }, '*');
        })
        .catch((err) => {
          reportRuntimeError({ stage: 'dependency_import', error: err.message });
        });
    } else if (initialCodeUrl) {
      window.__DEMO_PROPS__ = currentConfig;
      loadModuleFromUrl(initialCodeUrl, updateVersion);
    }
  </script>
</body>
</html>`;
}

export function buildIframeHtml(cssImports?: string[]): string {
  return generateIframeHtml({ cssImports });
}
