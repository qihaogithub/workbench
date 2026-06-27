import * as fs from 'fs';
import * as path from 'path';

import type { Skill } from '@earendil-works/pi-agent-core';

export interface PreinstalledSkill extends Skill {
  source: string;
}

const TASTE_SKILL_NAME = 'design-taste-frontend';
const TASTE_SKILL_SOURCE = 'github:Leonxlnx/taste-skill';
const TASTE_SKILL_RELATIVE_PATH = path.join(
  'design-taste-frontend',
  'SKILL.md',
);

let cachedSkills: PreinstalledSkill[] | null = null;

function getSkillRootCandidates(): string[] {
  const candidates = [
    process.env.PI_AGENT_PREINSTALLED_SKILLS_DIR,
    path.resolve(process.cwd(), 'preinstalled-skills'),
    path.resolve(process.cwd(), 'src', 'preinstalled-skills'),
    path.resolve(
      process.cwd(),
      'packages',
      'agent-service',
      'src',
      'preinstalled-skills',
    ),
  ];

  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

function resolveTasteSkillPath(): string {
  for (const root of getSkillRootCandidates()) {
    const candidate = path.join(root, TASTE_SKILL_RELATIVE_PATH);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(
    process.cwd(),
    'src',
    'preinstalled-skills',
    TASTE_SKILL_RELATIVE_PATH,
  );
}

function readFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return {};

  const metadata: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const [key, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();
    if (key?.trim() && value) {
      metadata[key.trim()] = value.replace(/^["']|["']$/g, '');
    }
  }
  return metadata;
}

export function getPreinstalledSkills(): PreinstalledSkill[] {
  if (cachedSkills) return cachedSkills;

  const filePath = resolveTasteSkillPath();
  const content = fs.readFileSync(filePath, 'utf-8');
  const metadata = readFrontmatter(content);

  cachedSkills = [
    {
      name: metadata.name || TASTE_SKILL_NAME,
      description:
        metadata.description ||
        'Anti-slop frontend skill for landing pages, portfolios, and redesigns.',
      content,
      filePath,
      source: TASTE_SKILL_SOURCE,
    },
  ];

  return cachedSkills;
}

export function getPreinstalledSkill(name: string): PreinstalledSkill | undefined {
  return getPreinstalledSkills().find((skill) => skill.name === name);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatPreinstalledSkillsForPrompt(skills: PreinstalledSkill[]): string {
  const visibleSkills = skills.filter((skill) => !skill.disableModelInvocation);
  if (!visibleSkills.length) return '';

  const lines = [
    '## 预装 Skills',
    '',
    '以下 skill 来自创作端预装资源。任务匹配其 description 时，先调用 `readPreinstalledSkill` 读取完整 `SKILL.md`，再按其中规则工作；不要用 `readFile` 读取这些内部 skill 文件。',
    '',
    '<available_skills>',
  ];

  for (const skill of visibleSkills) {
    lines.push('  <skill>');
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <source>${escapeXml(skill.source)}</source>`);
    lines.push(`    <read_tool>readPreinstalledSkill</read_tool>`);
    lines.push('  </skill>');
  }

  lines.push('</available_skills>');
  return lines.join('\n');
}

