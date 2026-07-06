import * as fs from 'fs';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';

function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

let _projectsDir: string | null = null;

function getProjectsDir(): string {
  if (!_projectsDir) {
    const dataDir = path.resolve(
      process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), 'data'),
    );
    _projectsDir = path.join(dataDir, 'projects');
  }
  return _projectsDir;
}

interface ProjectImageEntry {
  id: string;
  filename: string;
  url: string;
  size: number;
  format: string;
  createdAt: number;
  createdBy: 'user' | 'ai' | 'figma';
}

interface ProjectImageManifest {
  images: ProjectImageEntry[];
}

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
      const manifestProjectId = config.projectId || config.demoId;
      if (!manifestProjectId) {
        return {
          content: [{ type: 'text', text: 'No project associated with this session. Images are not tracked.' }],
          details: { images: [] },
        };
      }

      const manifestPath = path.join(getProjectsDir(), manifestProjectId, 'images.json');

      if (!fs.existsSync(manifestPath)) {
        return {
          content: [{ type: 'text', text: 'No images have been uploaded to this project yet.' }],
          details: { images: [] },
        };
      }

      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const manifest: ProjectImageManifest = JSON.parse(raw);

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
