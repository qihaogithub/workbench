import * as fs from 'fs';
import * as path from 'path';

import type { Skill } from '@earendil-works/pi-agent-core';

export interface PreinstalledSkill extends Skill {
  source: string;
}

const WORKBENCH_SKILL_SOURCE_PREFIX = 'workbench:internal:';

let cachedSkills: PreinstalledSkill[] | null = null;

function getSkillRootCandidates(): string[] {
  const baseCandidates = [
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

  return baseCandidates.filter((candidate): candidate is string => Boolean(candidate));
}

function resolveSkillRoot(): string {
  for (const root of getSkillRootCandidates()) {
    if (fs.existsSync(root)) {
      return root;
    }
  }
  return path.resolve(
    process.cwd(),
    'packages',
    'agent-service',
    'src',
    'preinstalled-skills',
  );
}

function resolveSkillSource(dirName: string): string {
  if (dirName === 'design-taste-frontend') {
    return 'github:Leonxlnx/taste-skill';
  }
  return `${WORKBENCH_SKILL_SOURCE_PREFIX}${dirName}`;
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

function loadSkill(dirName: string, skillFilePath: string): PreinstalledSkill {
  const content = fs.readFileSync(skillFilePath, 'utf-8');
  const metadata = readFrontmatter(content);

  return {
    name: metadata.name || dirName,
    description:
      metadata.description ||
      `Workbench built-in skill: ${dirName}`,
    content,
    filePath: skillFilePath,
    source: resolveSkillSource(dirName),
  };
}

export function getPreinstalledSkills(): PreinstalledSkill[] {
  if (cachedSkills) return cachedSkills;

  const skillsDir = resolveSkillRoot();
  const skills: PreinstalledSkill[] = [];

  if (!fs.existsSync(skillsDir)) {
    cachedSkills = skills;
    return skills;
  }

  for (const entry of fs.readdirSync(skillsDir)) {
    const entryPath = path.join(skillsDir, entry);
    if (!fs.statSync(entryPath).isDirectory()) continue;

    const skillPath = path.join(entryPath, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      skills.push(loadSkill(entry, skillPath));
    }
  }

  cachedSkills = skills;
  return skills;
}

export function getPreinstalledSkill(name: string): PreinstalledSkill | undefined {
  return getPreinstalledSkills().find((skill) => skill.name === name);
}

export function clearPreinstalledSkillsCache(): void {
  cachedSkills = null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isSkillApplicable(skillName: string, toolNames?: string[]): boolean {
  if (!toolNames || toolNames.length === 0) return true;

  const tools = new Set(toolNames);

  switch (skillName) {
    case 'page-deletion':
      return tools.has('deletePage') || tools.has('deletePages') || tools.has('previewDeletePages');
    default:
      return true;
  }
}

export function formatPreinstalledSkillsForPrompt(
  skills: PreinstalledSkill[],
  toolNames?: string[],
): string {
  const visibleSkills = skills.filter((skill) => {
    if (skill.disableModelInvocation) return false;
    if (toolNames && !isSkillApplicable(skill.name, toolNames)) return false;
    return true;
  });
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
