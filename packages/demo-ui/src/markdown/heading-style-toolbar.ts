export interface HeadingStyleOption {
  label: string;
  level: number | null;
}

export const HEADING_STYLE_OPTIONS: HeadingStyleOption[] = [
  { label: "正文", level: null },
  { label: "H1", level: 1 },
  { label: "H2", level: 2 },
  { label: "H3", level: 3 },
  { label: "H4", level: 4 },
  { label: "H5", level: 5 },
  { label: "H6", level: 6 },
];

export const PRIMARY_HEADING_STYLE_OPTIONS = HEADING_STYLE_OPTIONS.filter(
  ({ level }) => level === null || level <= 3,
);
export const MORE_HEADING_STYLE_OPTIONS = HEADING_STYLE_OPTIONS.filter(
  ({ level }) => level !== null && level >= 4,
);

export function getHeadingStyleLabel(level: number | null): string {
  return (
    HEADING_STYLE_OPTIONS.find((option) => option.level === level)?.label ??
    HEADING_STYLE_OPTIONS[0].label
  );
}
