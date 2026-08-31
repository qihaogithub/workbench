'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { WidgetProps } from '@rjsf/utils';
import { Upload, Repeat, Trash2, Loader2, AlertTriangle, FileArchive, Play, Video, Image as ImageIcon } from 'lucide-react';
import { cn } from './utils';
import { resolveConfigImageSrc } from './preview-config-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ImageInputActions } from './ImageInputActions';

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片尺寸'));
    };
    img.src = url;
  });
}

interface DimensionOptions {
  widthRule?: { operator: "=" | ">" | "≥" | "<" | "≤"; value: number };
  heightRule?: { operator: "=" | ">" | "≥" | "<" | "≤"; value: number };
}

function validateImageDimensions(
  actual: { width: number; height: number },
  options: DimensionOptions
): { valid: boolean; message: string } {
  const parts: string[] = [];
  const matches = (actualValue: number, rule: DimensionOptions["widthRule"]) => !rule
    || ({ "=": actualValue === rule.value, ">": actualValue > rule.value, "≥": actualValue >= rule.value, "<": actualValue < rule.value, "≤": actualValue <= rule.value }[rule.operator]);
  if (!matches(actual.width, options.widthRule) && options.widthRule) parts.push(`宽度${options.widthRule.operator}${options.widthRule.value}px`);
  if (!matches(actual.height, options.heightRule) && options.heightRule) parts.push(`高度${options.heightRule.operator}${options.heightRule.value}px`);

  if (parts.length === 0) return { valid: true, message: '' };
  return {
    valid: false,
    message: `图片尺寸不符合要求：${parts.join('，')}（实际 ${actual.width}x${actual.height}px）`,
  };
}

async function deleteServerFile(sessionId: string, url: string) {
  if (!url.startsWith('/api/sessions/')) return;
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  if (!filename) return;
  try {
    await fetch(`/api/sessions/${sessionId}/assets/${filename}`, { method: 'DELETE' });
  } catch {
  }
}

export function ColorPickerWidget(props: WidgetProps) {
  const { id, value, onChange, label, required } = props;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={id}
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded border border-border cursor-pointer"
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-3 py-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
        />
      </div>
    </div>
  );
}

export interface FileUploadWidgetOptions {
  accept?: string;
  mediaType?: "image" | "video";
  videoPreviewStyle?: "controls" | "compact" | "cover";
  maxSize?: number;
  placeholder?: string;
  widthRule?: DimensionOptions["widthRule"];
  heightRule?: DimensionOptions["heightRule"];
}

export interface SpineBundle {
  skeleton: string;
  atlas: string;
  texture: string;
}

export interface VideoValue {
  /** Empty objects are used by schemas as the initial, unconfigured value. */
  url?: string;
  poster?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVideoValue(value: unknown): value is VideoValue & { url: string } {
  return isRecord(value) && typeof value.url === 'string' && value.url.trim().length > 0;
}

function isVideoConfigValue(value: unknown): value is VideoValue {
  return isRecord(value)
    && (value.url === undefined || typeof value.url === 'string')
    && (value.poster === undefined || typeof value.poster === 'string');
}

function isSpineBundle(value: unknown): value is SpineBundle {
  return isRecord(value)
    && typeof value.skeleton === 'string'
    && typeof value.atlas === 'string'
    && typeof value.texture === 'string';
}

interface UploadResponsePayload {
  success?: boolean;
  data?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
  };
}

async function parseUploadResponse(response: Response): Promise<UploadResponsePayload | null> {
  try {
    const body = await response.text();
    if (!body.trim()) return null;
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) ? parsed as UploadResponsePayload : null;
  } catch {
    return null;
  }
}

function getUploadErrorMessage(
  response: Response,
  payload: UploadResponsePayload | null,
  resourceLabel: string,
): string {
  const serverMessage = payload?.error && typeof payload.error.message === 'string'
    ? payload.error.message.trim()
    : '';
  if (serverMessage) return serverMessage;

  if (response.ok) return '服务器返回了无效的上传响应，请重试';

  switch (response.status) {
    case 401:
      return '登录状态已失效，请刷新页面后重试';
    case 404:
      return '编辑会话已失效，请重新打开页面';
    case 413:
      return `${resourceLabel}超过服务器允许的大小限制`;
    default:
      return response.status > 0 ? `上传失败（HTTP ${response.status}）` : '上传失败，请重试';
  }
}

function getUploadedUrl(payload: UploadResponsePayload | null): string | null {
  if (!payload || payload.success !== true) return null;
  if (typeof payload.data === 'string' && payload.data.trim()) return payload.data;
  if (!isRecord(payload.data) || typeof payload.data.url !== 'string') return null;
  const url = payload.data.url.trim();
  return url || null;
}

const DEFAULT_IMAGE_FILE_MAX_SIZE = 50 * 1024 * 1024;
const DEFAULT_VIDEO_FILE_MAX_SIZE = 200 * 1024 * 1024;

export interface FileUploadWidgetProps {
  id?: string;
  value?: string | SpineBundle | VideoValue;
  onChange: (value: string | SpineBundle | VideoValue | undefined) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  sessionId?: string;
  options?: FileUploadWidgetOptions;
  defaultValue?: string | VideoValue;
  onWhiteboard?: () => void;
}

export function FileUploadWidget(props: WidgetProps | FileUploadWidgetProps) {
  const {
    id,
    value,
    onChange,
    label,
    required,
    disabled,
  } = props as any;

  const sessionId = (props as any).sessionId ?? (props as any).formContext?.sessionId;
  const rawOptions = ((props as any).options || {}) as FileUploadWidgetOptions;
  const defaultValue = (props as any).defaultValue as string | VideoValue | undefined;
  const onWhiteboard = (props as any).onWhiteboard as (() => void) | undefined;

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const [sizeWarning, setSizeWarning] = useState<{
    file: File;
    message: string;
  } | null>(null);

  const accept = rawOptions.accept || 'image/*';
  const isVideo = rawOptions.mediaType === 'video';
  const maxSize = rawOptions.maxSize ?? (isVideo ? DEFAULT_VIDEO_FILE_MAX_SIZE : DEFAULT_IMAGE_FILE_MAX_SIZE);

  const dimensionOptions: DimensionOptions = {
    widthRule: rawOptions.widthRule,
    heightRule: rawOptions.heightRule,
  };

  const hasDimensionCheck = Object.values(dimensionOptions).some((rule) => !!rule);

  // Video schemas use an object value, so an empty default (`{}`) must not be
  // treated as an uploaded Spine bundle or as a playable video.
  const hasValue = isVideo ? isVideoValue(value) : Boolean(value);
  const videoValue = isVideo && isVideoValue(value) ? value : null;
  const posterValue = videoValue?.poster;
  const posterSrc = posterValue ? resolveConfigImageSrc(posterValue, sessionId) : undefined;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [posterError, setPosterError] = useState(false);

  useEffect(() => {
    setPosterError(false);
  }, [posterValue]);

  const doUpload = useCallback(
    async (file: File, skipDimensionCheck = false) => {
      setError('');
      if (file.size > maxSize) {
        setError(`文件大小超过 ${maxSize / 1024 / 1024}MB 限制`);
        return;
      }

      if (hasDimensionCheck && !skipDimensionCheck && !isVideo) {
        try {
          const dims = await getImageDimensions(file);
          const result = validateImageDimensions(dims, dimensionOptions);
          if (!result.valid) {
            setSizeWarning({ file, message: result.message });
            return;
          }
        } catch {
          setError('无法读取图片尺寸，请检查文件是否有效');
          return;
        }
      }

      setIsUploading(true);
      setError('');

      try {
        if (sessionId) {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch(`/api/sessions/${sessionId}/assets/upload`, {
            method: 'POST',
            body: formData,
          });

          const data = await parseUploadResponse(res);

          if (!res.ok || data?.success !== true) {
            setError(getUploadErrorMessage(res, data, isVideo ? '视频' : '文件'));
            return;
          }

          const uploadedUrl = getUploadedUrl(data);
          const isBundle = isSpineBundle(data.data);
          if (!uploadedUrl && !isBundle) {
            setError('服务器未返回有效的上传地址，请重试');
            return;
          }

          if (typeof value === 'string' && value.startsWith('/api/sessions/')) {
            await deleteServerFile(sessionId, value);
          }

          onChange(isVideo ? { url: uploadedUrl! } : (isBundle ? data.data : uploadedUrl!));
        } else {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsDataURL(file);
          });
          onChange(isVideo ? { url: dataUrl } : dataUrl);
        }
      } catch {
        setError(sessionId ? '网络连接失败，请检查网络后重试' : '上传失败，请重试');
      } finally {
        setIsUploading(false);
      }
    },
    [sessionId, maxSize, hasDimensionCheck, dimensionOptions, value, onChange, isVideo]
  );

  const handlePosterChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !sessionId || !isVideo) return;
    if (!file.type.startsWith('image/')) { setError('封面必须是图片'); return; }
    if (file.size > maxSize) { setError(`封面大小超过 ${maxSize / 1024 / 1024}MB 限制`); return; }
    setIsUploading(true); setError('');
    try {
      const formData = new FormData(); formData.append('file', file);
      const res = await fetch(`/api/sessions/${sessionId}/assets/upload`, { method: 'POST', body: formData });
      const data = await parseUploadResponse(res);
      const uploadedUrl = getUploadedUrl(data);
      if (!res.ok || data?.success !== true || !uploadedUrl) {
        setError(getUploadErrorMessage(res, data, '封面图片'));
        return;
      }
      const current = typeof value === 'object' && value !== null && 'url' in value ? value as VideoValue : { url: '' };
      onChange({ ...current, poster: uploadedUrl });
    } catch { setError('网络连接失败，请检查网络后重试'); } finally { setIsUploading(false); }
  }, [sessionId, isVideo, maxSize, value, onChange]);

  const handleFileSelect = useCallback(
    (file: File) => {
      doUpload(file);
    },
    [doUpload]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
      e.target.value = '';
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleClear = useCallback(async () => {
    const defaultVideo = isVideo
      ? (isVideoConfigValue(defaultValue)
        ? defaultValue
        : typeof defaultValue === 'string' && defaultValue.trim()
          ? { url: defaultValue }
          : undefined)
      : undefined;
    const nextValue = isVideo
      ? defaultVideo
      : typeof defaultValue === 'string'
        ? defaultValue
        : undefined;

    if (!isVideo && sessionId && isSpineBundle(value)) {
      // Spine bundle：清空字段即可，zip 解压文件留在 workspace（由项目资产收集统一管理）
      onChange(nextValue);
      return;
    }

    if (isVideo) {
      // The visual state should reset immediately; asset cleanup is best effort.
      onChange(nextValue);
      if (sessionId && isVideoValue(value)) {
        if (value.url !== defaultVideo?.url) await deleteServerFile(sessionId, value.url);
        if (value.poster && value.poster !== defaultVideo?.poster) {
          await deleteServerFile(sessionId, value.poster);
        }
      }
      return;
    }

    if (sessionId && typeof value === 'string' && value.startsWith('/api/sessions/')) {
      await deleteServerFile(sessionId, value);
    }

    onChange(nextValue);
  }, [sessionId, value, onChange, defaultValue, isVideo]);

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        disabled={disabled || isUploading}
        className="hidden"
      />
      {isVideo && <input ref={posterInputRef} type="file" accept="image/*" onChange={handlePosterChange} className="hidden" />}
      <div className="flex items-start gap-3">
        {hasValue ? (
          isVideo && isVideoValue(value) ? (
            <div className="w-full max-w-[360px] overflow-hidden rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                disabled={disabled}
                className="group relative block aspect-video w-full overflow-hidden bg-muted text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default disabled:opacity-80"
                aria-label={`${label || '视频'}预览`}
              >
                {posterSrc && !posterError ? (
                  <img
                    src={posterSrc}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setPosterError(true)}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
                    <Video className="h-10 w-10" aria-hidden="true" />
                    <span className="text-xs">暂无封面</span>
                  </div>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/20 group-focus-visible:bg-black/20">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition-transform duration-200 group-hover:scale-105 group-focus-visible:scale-105">
                    <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
                  </span>
                </span>
              </button>
              <div className="flex flex-wrap gap-2 border-t border-border/70 p-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || isUploading}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                  替换视频
                </button>
                <button
                  type="button"
                  onClick={() => posterInputRef.current?.click()}
                  disabled={disabled || isUploading}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {value.poster ? '更换封面' : '添加封面'}
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={disabled || isUploading}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  删除
                </button>
              </div>
            </div>
          ) : !isVideo && isSpineBundle(value) ? (
            <div className="relative w-[80px] h-[80px] rounded-lg border border-border overflow-hidden bg-muted shrink-0 flex flex-col items-center justify-center gap-1 group">
              <FileArchive className="w-5 h-5 text-muted-foreground" />
              <span className="text-[9px] text-muted-foreground px-1 text-center leading-tight">Spine 素材包</span>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled || isUploading} className="p-2 rounded-full bg-background/90 text-foreground hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50" aria-label="替换压缩包"><Repeat className="w-4 h-4" /></button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={disabled || isUploading}
                  className="p-2 rounded-full bg-background/90 text-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
                  aria-label="删除压缩包"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="relative w-[80px] h-[80px] rounded-lg border border-border overflow-hidden bg-muted shrink-0 group">
              <img
                src={resolveConfigImageSrc(value, sessionId)}
                alt="Preview"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.classList.add('flex', 'items-center', 'justify-center');
                }}
              />
              <ImageInputActions onUpload={() => fileInputRef.current?.click()} onWhiteboard={onWhiteboard} disabled={disabled || isUploading} />
              {!(defaultValue && value === defaultValue) && (
                <button type="button" onClick={handleClear} disabled={disabled || isUploading} className="absolute right-1 top-1 rounded-full bg-background/90 p-1.5 text-foreground hover:bg-destructive hover:text-destructive-foreground" aria-label="删除图片" title="删除图片">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'group relative',
              'w-[80px] h-[80px] flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg cursor-pointer transition-colors shrink-0',
              isUploading
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            )}
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <div className="p-1.5 rounded-full bg-muted">
                  <Upload className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-xs text-muted-foreground">Upload</span>
              </div>
            )}
            <ImageInputActions onUpload={() => fileInputRef.current?.click()} onWhiteboard={onWhiteboard} disabled={disabled || isUploading} />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl border-border bg-black p-2 text-white sm:p-3 [&>button]:text-white [&>button]:opacity-90">
          <DialogHeader className="sr-only">
            <DialogTitle>{label ? `${label}预览` : '视频预览'}</DialogTitle>
            <DialogDescription>视频预览弹窗</DialogDescription>
          </DialogHeader>
          {videoValue && (
            <div className="overflow-hidden rounded-md bg-black">
              <video
                key={videoValue.url}
                src={videoValue.url}
                poster={posterError ? undefined : posterSrc}
                controls
                preload="metadata"
                className="max-h-[80vh] w-full object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!sizeWarning} onOpenChange={(open) => !open && setSizeWarning(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              图片尺寸不符合要求
            </DialogTitle>
            <DialogDescription>{sizeWarning?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSizeWarning(null)}>
              取消上传
            </Button>
            <Button
              onClick={() => {
                if (sizeWarning) {
                  const file = sizeWarning.file;
                  setSizeWarning(null);
                  doUpload(file, true);
                }
              }}
            >
              继续上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const customWidgets = {
  color: ColorPickerWidget,
  file: FileUploadWidget,
};
