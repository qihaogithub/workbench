import * as fs from "fs";
import crypto from "crypto";
import * as path from "path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from "./permissions";
import {
  formatRuntimeValidationInstruction,
  validatePreviewFileWrite,
} from "./preview-validation";
import {
  resolveLiveWorkspaceMutationContext,
  WorkspaceMutationAuthorityError,
} from "../../workspace/workspace-mutation-authority";

// ---------------------------------------------------------------------------
// Line ending & BOM utilities (aligned with pi-agent edit-diff.ts)
// ---------------------------------------------------------------------------

function detectLineEnding(content: string): "\r\n" | "\n" {
  const crlfIdx = content.indexOf("\r\n");
  const lfIdx = content.indexOf("\n");
  if (lfIdx === -1) return "\n";
  if (crlfIdx === -1) return "\n";
  return crlfIdx < lfIdx ? "\r\n" : "\n";
}

function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function restoreLineEndings(text: string, ending: "\r\n" | "\n"): string {
  return ending === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
}

function stripBom(content: string): { bom: string; text: string } {
  return content.startsWith("\uFEFF")
    ? { bom: "\uFEFF", text: content.slice(1) }
    : { bom: "", text: content };
}

// ---------------------------------------------------------------------------
// Fuzzy matching utilities (aligned with pi-agent normalizeForFuzzyMatch)
// ---------------------------------------------------------------------------

/**
 * Normalize text for fuzzy matching with progressive transformations:
 * - Strip trailing whitespace from each line
 * - Normalize smart quotes to ASCII equivalents
 * - Normalize Unicode dashes/hyphens to ASCII hyphen
 * - Normalize special Unicode spaces to regular space
 */
function normalizeForFuzzyMatch(text: string): string {
  return (
    text
      .normalize("NFKC")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      // Smart single quotes → '
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      // Smart double quotes → "
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      // Various dashes/hyphens → -
      .replace(
        /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g,
        "-",
      )
      // Special spaces → regular space
      .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ")
  );
}

interface FuzzyMatchResult {
  found: boolean;
  index: number;
  matchLength: number;
  usedFuzzyMatch: boolean;
  contentForReplacement: string;
}

function fuzzyFindText(content: string, oldText: string): FuzzyMatchResult {
  // Try exact match first
  const exactIndex = content.indexOf(oldText);
  if (exactIndex !== -1) {
    return {
      found: true,
      index: exactIndex,
      matchLength: oldText.length,
      usedFuzzyMatch: false,
      contentForReplacement: content,
    };
  }

  // Try fuzzy match
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  const fuzzyIndex = fuzzyContent.indexOf(fuzzyOldText);

  if (fuzzyIndex === -1) {
    return {
      found: false,
      index: -1,
      matchLength: 0,
      usedFuzzyMatch: false,
      contentForReplacement: content,
    };
  }

  return {
    found: true,
    index: fuzzyIndex,
    matchLength: fuzzyOldText.length,
    usedFuzzyMatch: true,
    contentForReplacement: fuzzyContent,
  };
}

// ---------------------------------------------------------------------------
// Edit application logic
// ---------------------------------------------------------------------------

interface Edit {
  old_string: string;
  new_string: string;
}

interface MatchedEdit {
  editIndex: number;
  matchIndex: number;
  matchLength: number;
  new_string: string;
}

function countOccurrences(content: string, oldText: string): number {
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  if (fuzzyOldText.length === 0) return 0;
  return fuzzyContent.split(fuzzyOldText).length - 1;
}

/**
 * Apply one or more exact-text replacements to LF-normalized content.
 * All edits are matched against the same original content. Replacements are
 * applied in reverse order so offsets remain stable.
 */
function applyEdits(
  normalizedContent: string,
  edits: Edit[],
  filePath: string,
): { baseContent: string; newContent: string; usedFuzzyMatch: boolean } {
  // Normalize edits to LF
  const normalizedEdits = edits.map((edit) => ({
    old_string: normalizeToLF(edit.old_string),
    new_string: normalizeToLF(edit.new_string),
  }));

  // Validate: no empty old_string
  for (let i = 0; i < normalizedEdits.length; i++) {
    if (normalizedEdits[i].old_string.length === 0) {
      const label =
        normalizedEdits.length === 1
          ? "old_string"
          : `edits[${i}].old_string`;
      throw new Error(`${label} must not be empty in ${filePath}.`);
    }
  }

  // Match all edits against original content
  const initialMatches = normalizedEdits.map((edit) =>
    fuzzyFindText(normalizedContent, edit.old_string),
  );
  const usedFuzzyMatch = initialMatches.some((m) => m.usedFuzzyMatch);
  const replacementBaseContent = usedFuzzyMatch
    ? normalizeForFuzzyMatch(normalizedContent)
    : normalizedContent;

  const matchedEdits: MatchedEdit[] = [];
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i];
    const matchResult = fuzzyFindText(replacementBaseContent, edit.old_string);
    if (!matchResult.found) {
      const label =
        normalizedEdits.length === 1
          ? `Could not find the exact text in ${filePath}`
          : `Could not find edits[${i}] in ${filePath}`;
      throw new Error(
        `${label}. The old_string must match exactly including all whitespace and newlines.`,
      );
    }

    const occurrences = countOccurrences(
      replacementBaseContent,
      edit.old_string,
    );
    if (occurrences > 1) {
      const label =
        normalizedEdits.length === 1
          ? `Found ${occurrences} occurrences of the text in ${filePath}`
          : `Found ${occurrences} occurrences of edits[${i}] in ${filePath}`;
      throw new Error(
        `${label}. The text must be unique. Please provide more context to make it unique.`,
      );
    }

    matchedEdits.push({
      editIndex: i,
      matchIndex: matchResult.index,
      matchLength: matchResult.matchLength,
      new_string: edit.new_string,
    });
  }

  // Sort by position and check for overlaps
  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);
  for (let i = 1; i < matchedEdits.length; i++) {
    const previous = matchedEdits[i - 1];
    const current = matchedEdits[i];
    if (previous.matchIndex + previous.matchLength > current.matchIndex) {
      throw new Error(
        `edits[${previous.editIndex}] and edits[${current.editIndex}] overlap in ${filePath}. Merge them into one edit or target disjoint regions.`,
      );
    }
  }

  // Apply replacements in reverse order to keep offsets stable
  let result = replacementBaseContent;
  for (let i = matchedEdits.length - 1; i >= 0; i--) {
    const { matchIndex, matchLength, new_string } = matchedEdits[i];
    result =
      result.substring(0, matchIndex) +
      new_string +
      result.substring(matchIndex + matchLength);
  }

  if (replacementBaseContent === result) {
    const label =
      normalizedEdits.length === 1
        ? `No changes made to ${filePath}`
        : `No changes made to ${filePath}`;
    throw new Error(
      `${label}. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected.`,
    );
  }

  return { baseContent: normalizedContent, newContent: result, usedFuzzyMatch };
}

/**
 * Apply fuzzy-matched replacements while preserving unchanged line blocks
 * from the original content. Only the lines touched by edits are rewritten
 * from the normalized space; all other lines keep their original bytes.
 */
function applyFuzzyEditsPreservingOriginal(
  originalContent: string,
  normalizedContent: string,
  edits: Edit[],
  filePath: string,
): string {
  const normalizedEdits = edits.map((edit) => ({
    old_string: normalizeToLF(edit.old_string),
    new_string: normalizeToLF(edit.new_string),
  }));

  const fuzzyContent = normalizeForFuzzyMatch(normalizedContent);

  const matchedEdits: MatchedEdit[] = [];
  for (let i = 0; i < normalizedEdits.length; i++) {
    const edit = normalizedEdits[i];
    const matchResult = fuzzyFindText(fuzzyContent, edit.old_string);
    if (!matchResult.found) {
      throw new Error(
        `Could not find edits[${i}] in ${filePath}. The old_string must match exactly including all whitespace and newlines.`,
      );
    }
    matchedEdits.push({
      editIndex: i,
      matchIndex: matchResult.index,
      matchLength: matchResult.matchLength,
      new_string: edit.new_string,
    });
  }

  matchedEdits.sort((a, b) => a.matchIndex - b.matchIndex);

  // Build line spans for fuzzy content
  const originalLines = originalContent.split("\n");
  const fuzzyLines = fuzzyContent.split("\n");
  if (originalLines.length !== fuzzyLines.length) {
    // Line count mismatch — fall back to full replacement
    let result = fuzzyContent;
    for (let i = matchedEdits.length - 1; i >= 0; i--) {
      const { matchIndex, matchLength, new_string } = matchedEdits[i];
      result =
        result.substring(0, matchIndex) +
        new_string +
        result.substring(matchIndex + matchLength);
    }
    return result;
  }

  // Apply edits to fuzzy content, then overlay changed lines onto original
  let fuzzyResult = fuzzyContent;
  for (let i = matchedEdits.length - 1; i >= 0; i--) {
    const { matchIndex, matchLength, new_string } = matchedEdits[i];
    fuzzyResult =
      fuzzyResult.substring(0, matchIndex) +
      new_string +
      fuzzyResult.substring(matchIndex + matchLength);
  }

  const resultLines = fuzzyResult.split("\n");
  // For changed line ranges, use fuzzy result; for unchanged, use original
  const changedLineSet = new Set<number>();
  for (const edit of matchedEdits) {
    // Determine which lines this edit touches in fuzzy content
    let charCount = 0;
    for (let line = 0; line < fuzzyLines.length; line++) {
      const lineEnd = charCount + fuzzyLines[line].length + 1; // +1 for \n
      if (charCount >= edit.matchIndex && charCount < edit.matchIndex + edit.matchLength) {
        changedLineSet.add(line);
      }
      if (lineEnd > edit.matchIndex + edit.matchLength) break;
      charCount = lineEnd;
    }
  }

  // Simple strategy: if line counts match, overlay changed lines
  if (resultLines.length === originalLines.length) {
    return resultLines
      .map((line, i) => (changedLineSet.has(i) ? line : originalLines[i]))
      .join("\n");
  }

  // Fallback: return the fuzzy result
  return fuzzyResult;
}

// ---------------------------------------------------------------------------
// Tool parameter schema
// ---------------------------------------------------------------------------

const SingleEditSchema = Type.Object({
  old_string: Type.String({
    description:
      "The exact text to find and replace. Must match exactly, including whitespace and indentation.",
  }),
  new_string: Type.String({
    description:
      "The text to replace old_string with. Use empty string to delete the matched text.",
  }),
});

const EditFileParams = Type.Object({
  path: Type.String({ description: "Relative path to the file to edit" }),
  edits: Type.Array(SingleEditSchema, {
    description:
      "One or more targeted replacements. Each edit is matched against the original file, not incrementally. Do not include overlapping or nested edits. If two changes touch the same block or nearby lines, merge them into one edit instead.",
  }),
});
type EditFileParams = Static<typeof EditFileParams>;

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createEditFileTool(
  config: AgentConfig,
): AgentTool<typeof EditFileParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: "editFile",
    label: "Edit File",
    description:
      "Edit a single file using exact text replacement. Supports multiple edits in one call via the edits[] array. Each edits[].old_string must match a unique, non-overlapping region of the original file. Prefer this over writeFile for making targeted changes to existing files, as it preserves the rest of the file and reduces token usage.",
    parameters: EditFileParams,
    execute: async (toolCallId: string, args: EditFileParams) => {
      const filePath = path.resolve(config.workingDir || ".", args.path);

      if (!isPathAllowed(args.path, config.workingDir || "", permissions)) {
        logger.warn({ path: args.path }, "editFile denied by permissions");
        return {
          content: [
            {
              type: "text",
              text: `Error: path "${args.path}" is not allowed by workspace permissions`,
            },
          ],
          details: { path: args.path, error: "permission denied" },
          isError: true,
        };
      }

      const edits = args.edits;
      if (!edits || edits.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Error: editFile requires a non-empty edits[] array.`,
            },
          ],
          details: { path: args.path, error: "invalid edit arguments" },
          isError: true,
        };
      }

      // Declare snapshot outside try so catch can access it for preview
      let snapshot: any = null;
      try {
        // --- Resolve file content via liveWorkspace or filesystem ---
        const liveWorkspace = config.workingDir
          ? resolveLiveWorkspaceMutationContext(config.workingDir)
          : null;
        let snapshotDriftRetry = 0;
        while (true) {
          try {
            snapshot = liveWorkspace
              ? await liveWorkspace.authority.getSnapshot(
                  liveWorkspace.projectId,
                  liveWorkspace.workspaceId,
                )
              : null;
            break;
          } catch (err) {
            if (
              err instanceof WorkspaceMutationAuthorityError &&
              err.code === "WORKSPACE_EXTERNAL_DRIFT" &&
              liveWorkspace &&
              snapshotDriftRetry === 0
            ) {
              snapshotDriftRetry++;
              logger.info(
                { path: args.path },
                "editFile getSnapshot: EXTERNAL_DRIFT, reconciling",
              );
              await liveWorkspace.authority.reconcileAdopt(
                liveWorkspace.projectId,
                liveWorkspace.workspaceId,
              );
              continue;
            }
            throw err;
          }
        }
        const rawContent = snapshot
          ? snapshot.resources[args.path]
          : await fs.promises.readFile(filePath, "utf-8");
        if (rawContent === undefined) {
          return {
            content: [
              {
                type: "text",
                text: `Error editing file: ${args.path} is not a committed text resource`,
              },
            ],
            details: { path: args.path, error: "WORKSPACE_RESOURCE_NOT_FOUND" },
            isError: true,
          };
        }

        // --- BOM & line ending normalization ---
        const { bom, text: bomStripped } = stripBom(rawContent);
        const originalEnding = detectLineEnding(bomStripped);
        const normalizedContent = normalizeToLF(bomStripped);

        // --- Apply edits ---
        const { newContent: normalizedNewContent, usedFuzzyMatch } = applyEdits(
          normalizedContent,
          edits,
          args.path,
        );

        // If fuzzy matching was used, preserve unchanged lines from original
        const finalLFContent = usedFuzzyMatch
          ? applyFuzzyEditsPreservingOriginal(
              bomStripped,
              normalizedContent,
              edits,
              args.path,
            )
          : normalizedNewContent;

        const newContent = bom + restoreLineEndings(finalLFContent, originalEnding);

        // --- Write back ---
        const receipt = liveWorkspace
          ? await (async () => {
              let mutateDriftRetry = 0;
              while (true) {
                try {
                  return await liveWorkspace.authority.mutate({
                    mutationId: crypto.randomUUID(),
                    projectId: liveWorkspace.projectId,
                    workspaceId: liveWorkspace.workspaceId,
                    sessionId: config.sessionId,
                    baseRevision: snapshot!.state.revision,
                    actor: "ai",
                    reason: "agent_edit_file",
                    operations: [
                      {
                        type: "put_text",
                        path: args.path,
                        content: newContent,
                        expectedHash: crypto
                          .createHash("sha256")
                          .update(rawContent)
                          .digest("hex"),
                      },
                    ],
                  });
                } catch (err) {
                  if (
                    err instanceof WorkspaceMutationAuthorityError &&
                    err.code === "WORKSPACE_EXTERNAL_DRIFT" &&
                    mutateDriftRetry === 0
                  ) {
                    mutateDriftRetry++;
                    logger.info(
                      { path: args.path },
                      "editFile mutate: EXTERNAL_DRIFT, reconciling",
                    );
                    await liveWorkspace.authority.reconcileAdopt(
                      liveWorkspace.projectId,
                      liveWorkspace.workspaceId,
                    );
                    snapshot = await liveWorkspace.authority.getSnapshot(
                      liveWorkspace.projectId,
                      liveWorkspace.workspaceId,
                    );
                    continue;
                  }
                  throw err;
                }
              }
            })()
          : (await fs.promises.writeFile(filePath, newContent, "utf-8"), null);

        // --- Build result summary ---
        const firstEdit = edits[0];
        const firstMatchIndex = normalizedContent.indexOf(
          normalizeToLF(firstEdit.old_string),
        );
        const lineNumber =
          firstMatchIndex >= 0
            ? normalizedContent.substring(0, firstMatchIndex).split("\n").length
            : 1;

        const totalOldLines = edits.reduce(
          (sum, e) => sum + e.old_string.split("\n").length,
          0,
        );
        const totalNewLines = edits.reduce(
          (sum, e) => sum + e.new_string.split("\n").length,
          0,
        );

        const runtimeValidation = validatePreviewFileWrite(
          args.path,
          newContent,
        );
        const fuzzyNote = usedFuzzyMatch ? " (fuzzy match used)" : "";
        logger.debug(
          { path: args.path, lineNumber, editCount: edits.length },
          "File edited successfully",
        );
        const validationText =
          formatRuntimeValidationInstruction(runtimeValidation);
        return {
          content: [
            {
              type: "text",
              text: `Successfully replaced ${edits.length} block(s) in ${args.path} starting at line ${lineNumber} (${totalOldLines} line(s) replaced with ${totalNewLines} line(s))${fuzzyNote}${validationText}`,
            },
          ],
          details: {
            path: args.path,
            lineNumber,
            editCount: edits.length,
            oldLineCount: totalOldLines,
            newLineCount: totalNewLines,
            usedFuzzyMatch,
            runtimeValidation,
            receipt,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";

        // For "not found" errors, include file preview to help the model self-correct
        if (
          message.includes("Could not find") ||
          message.includes("not found")
        ) {
          try {
            const previewContent = snapshot
              ? snapshot.resources[args.path]
              : await fs.promises.readFile(filePath, "utf-8").catch(() => null);
            if (previewContent != null) {
              const lines = previewContent.split("\n");
              const totalLines = lines.length;
              const previewLines = lines
                .slice(0, Math.min(20, totalLines))
                .map((line: string, i: number) => `${i + 1}\u2192${line}`)
                .join("\n");
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${message}. File has ${totalLines} lines. First 20 lines:\n${previewLines}`,
                  },
                ],
                details: { path: args.path, error: message },
                isError: true,
              };
            }
          } catch {
            // Ignore preview errors, fall through to generic error
          }
        }

        logger.error(
          { path: args.path, error: message },
          "Failed to edit file",
        );
        return {
          content: [{ type: "text", text: `Error editing file: ${message}` }],
          details: { path: args.path, error: message },
          isError: true,
        };
      }
    },
  };
}
