import * as fs from 'fs';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import {
  getProjectImageManifestPath,
  readProjectImageManifest,
  resolveProjectImageManifestProjectId,
  addProjectImageManifestEntry,
} from './project-image-manifest';
import { findImageDimensionsBySha256 } from './global-image-store';

const ListImagesParams = Type.Object({});

type ListImagesParams = Static<typeof ListImagesParams>;

export function createListImagesTool(config: AgentConfig): AgentTool {
  return {
    name: 'listImages',
    label: 'List Project Images',
    description:
      'List all images that have been uploaded to the current project. Use this to check what images are already available before creating new ones, to avoid duplicate uploads.',
    parameters: ListImagesParams,
    execute: async (_toolCallId: string) => {
      const manifestProjectId = resolveProjectImageManifestProjectId(config);
      if (!manifestProjectId) {
        return {
          content: [{ type: 'text', text: 'No project associated with this session. Images are not tracked.' }],
          details: { images: [] },
        };
      }

      const manifestPath = getProjectImageManifestPath(manifestProjectId);

      if (!fs.existsSync(manifestPath)) {
        return {
          content: [{ type: 'text', text: 'No images have been uploaded to this project yet.' }],
          details: { images: [] },
        };
      }

      try {
        const manifest = readProjectImageManifest(manifestProjectId);

        if (manifest.images.length === 0) {
          return {
            content: [{ type: 'text', text: 'No images have been uploaded to this project yet.' }],
            details: { images: [] },
          };
        }

        let enriched = false;
        const images = manifest.images.map((img) => {
          if (img.width == null || img.height == null) {
            const dims = img.contentHash
              ? findImageDimensionsBySha256(img.contentHash)
              : {};
            if (dims.width != null && dims.height != null) {
              img.width = dims.width;
              img.height = dims.height;
              enriched = true;
            }
          }
          return img;
        });

        if (enriched) {
          try {
            for (const img of images) {
              addProjectImageManifestEntry(manifestProjectId, img);
            }
          } catch (writeError) {
            logger.warn(
              { projectId: manifestProjectId, error: writeError },
              'listImages: failed to persist enriched dimensions to manifest',
            );
          }
        }

        const imageList = images
          .map((img) => {
            const imageIdMatch = img.url?.match(/\/api\/images\/(img_[a-zA-Z0-9_-]+)/);
            const imageId = imageIdMatch ? imageIdMatch[1] : undefined;
            const idPart = imageId ? ` imageId=${imageId}` : "";
            const dims = img.width != null && img.height != null ? `, ${img.width}×${img.height}` : "";
            const alt = img.alt ? ` 内容：${img.alt}` : "";
            const createdAt = img.createdAt ? new Date(img.createdAt).toISOString() : "";
            return `- ${img.filename} → ${img.url} (${img.format}, ${(img.size / 1024).toFixed(1)}KB${dims}, added by ${img.createdBy}, at ${createdAt})${idPart}${alt}`;
          })
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Project images (${images.length} total):\n${imageList}`,
            },
          ],
          details: { images },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ projectId: manifestProjectId, error: message }, 'listImages: failed to read manifest');
        return {
          content: [{ type: 'text', text: `Error reading project images: ${message}` }],
          details: { error: 'read_failed' },
          isError: true,
        };
      }
    },
  };
}
