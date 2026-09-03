import {jsx as _jsx, jsxs as _jsxs} from "http://localhost:4200/preview-runtime/vendor/react-jsx-runtime.js"; function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }






export default function Demo({ heroVideo }) {
  const videoUrl = _optionalChain([heroVideo, 'optionalAccess', _ => _.url]) || "";
  const poster = _optionalChain([heroVideo, 'optionalAccess', _2 => _2.poster]) || undefined;

  return (
    _jsx('div', { className: "min-h-screen bg-slate-50 px-6 py-10"   , children: 
      _jsxs('div', { className: "mx-auto max-w-md" , children: [
        _jsx('h1', { className: "text-2xl font-bold tracking-tight text-slate-900"   , children: "视频展示页"

        })
        , _jsx('p', { className: "mt-2 text-sm leading-relaxed text-slate-500"   , children: "这是一个简单的示例页面，包含一个视频配置项。你可以在右侧配置面板上传或填写视频地址与封面。"

        })

        , _jsx('div', { className: "mt-6 overflow-hidden rounded-2xl bg-slate-900 shadow-sm"    , children: 
          videoUrl ? (
            _jsx('video', {
              className: "aspect-video w-full bg-slate-900 object-cover"   ,
              src: videoUrl,
              poster: poster,
              controls: true,
              preload: "metadata",}
            )
          ) : (
            _jsx('div', { className: "flex aspect-video w-full items-center justify-center bg-slate-100 text-sm text-slate-400"       , children: "请在配置面板添加视频地址"

            })
          )
        })

        , _jsx('p', { className: "mt-4 text-xs text-slate-400"  , children: "支持 MP4 / WebM 格式，封面为可选项。"

        })
      ]})
    })
  );
}
