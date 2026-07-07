import * as fs from 'fs';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import {
  getProjectImageManifestPath,
  readProjectImageManifest,
  resolveProjectImageManifestProjectId,
} from './project-image-manifest';

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

        const imageList = manifest.images
          .map(
            (img) =>
              `- ${img.filename} → ${img.url} (${img.format}, ${(img.size / 1024).toFixed(1)}KB, added by ${img.createdBy})`,
          )
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Project images (${manifest.images.length} total):\n${imageList}`,
            },
          ],
          details: { images: manifest.images },
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
