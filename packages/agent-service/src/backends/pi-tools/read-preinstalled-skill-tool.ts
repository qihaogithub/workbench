import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import {
  getPreinstalledSkill,
  getPreinstalledSkills,
} from '../preinstalled-skills';

const ReadPreinstalledSkillParams = Type.Object({
  name: Type.String({
    description: 'Name of the preinstalled skill to read, for example "design-taste-frontend".',
    minLength: 1,
  }),
  startLine: Type.Optional(Type.Number({
    description: 'Start line number (1-based, inclusive). Defaults to 1.',
    minimum: 1,
  })),
  endLine: Type.Optional(Type.Number({
    description: 'End line number (1-based, inclusive). Defaults to the last line.',
    minimum: 1,
  })),
});
type ReadPreinstalledSkillParams = Static<typeof ReadPreinstalledSkillParams>;

export function createReadPreinstalledSkillTool(): AgentTool<typeof ReadPreinstalledSkillParams> {
  return {
    name: 'readPreinstalledSkill',
    label: 'Read Preinstalled Skill',
    description:
      'Read the full instructions for a preinstalled Workbench skill by name. Use this before applying a listed skill.',
    parameters: ReadPreinstalledSkillParams,
    execute: async (_toolCallId: string, args: ReadPreinstalledSkillParams) => {
      const name = args.name.trim();
      const skill = getPreinstalledSkill(name);

      if (!skill) {
        const available = getPreinstalledSkills().map((item) => item.name);
        return {
          content: [{
            type: 'text' as const,
            text: `Error: unknown preinstalled skill "${name}". Available skills: ${available.join(', ') || '(none)'}`,
          }],
          details: { success: false, error: 'unknown_skill', available },
          isError: true,
        };
      }

      const lines = skill.content.split('\n');
      const totalLines = lines.length;
      const start = Math.max(1, args.startLine ?? 1);
      const end = Math.min(totalLines, args.endLine ?? totalLines);

      if (start > end) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: invalid line range (start=${start}, end=${end}). Skill has ${totalLines} lines.`,
          }],
          details: { success: false, error: 'invalid_range', totalLines },
          isError: true,
        };
      }

      const selected = lines.slice(start - 1, end).join('\n');
      const range = start === 1 && end === totalLines
        ? 'full file'
        : `lines ${start}-${end}`;

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Skill: ${skill.name}`,
            `Source: ${skill.source}`,
            `Location: ${skill.filePath}`,
            `Range: ${range} (${totalLines} lines total)`,
            '',
            selected,
          ].join('\n'),
        }],
        details: {
          success: true,
          name: skill.name,
          source: skill.source,
          path: skill.filePath,
          totalLines,
          startLine: start,
          endLine: end,
        },
      };
    },
  };
}
