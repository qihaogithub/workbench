import type { IconNode } from "lucide-react";

// Icon nodes are synced from lucide-react 0.575.0, which is ISC-licensed.
/**
 * Lucide's icon components are React components, while Milkdown's toolbar and
 * the editor overlays accept SVG strings. Keep the icon data in the same
 * shape as Lucide's published IconNode values and render it once at the
 * boundary so every Markdown editor surface shares the same icon system.
 */
function renderIcon(name: string, node: IconNode): string {
  const children = node
    .map(([element, attrs]) => {
      const attributes = Object.entries(attrs)
        .filter(([key]) => key !== "key")
        .map(([key, value]) => ` ${key}="${value}"`)
        .join("");
      return `<${element}${attributes}></${element}>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="${name}" aria-hidden="true">${children}</svg>`;
}

const ICON_NODES = {
  text: [
    ["path", { d: "M21 5H3", key: "1fi0y6" }],
    ["path", { d: "M15 12H3", key: "6jk70r" }],
    ["path", { d: "M17 19H3", key: "z6ezky" }],
  ],
  h1: [
    ["path", { d: "M4 12h8", key: "17cfdx" }],
    ["path", { d: "M4 18V6", key: "1rz3zl" }],
    ["path", { d: "M12 18V6", key: "zqpxq5" }],
    ["path", { d: "m17 12 3-2v8", key: "1hhhft" }],
  ],
  h2: [
    ["path", { d: "M4 12h8", key: "17cfdx" }],
    ["path", { d: "M4 18V6", key: "1rz3zl" }],
    ["path", { d: "M12 18V6", key: "zqpxq5" }],
    ["path", { d: "M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1", key: "9jr5yi" }],
  ],
  h3: [
    ["path", { d: "M4 12h8", key: "17cfdx" }],
    ["path", { d: "M4 18V6", key: "1rz3zl" }],
    ["path", { d: "M12 18V6", key: "zqpxq5" }],
    [
      "path",
      { d: "M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2", key: "68ncm8" },
    ],
    [
      "path",
      { d: "M17 17.5c2 1.5 3.5.3 3.5-1.5a2 2 0 0 0-2-2", key: "1ejuhz" },
    ],
  ],
  h4: [
    ["path", { d: "M12 18V6", key: "zqpxq5" }],
    ["path", { d: "M17 10v3a1 1 0 0 0 1 1h3", key: "tj5zdr" }],
    ["path", { d: "M21 10v8", key: "1kdml4" }],
    ["path", { d: "M4 12h8", key: "17cfdx" }],
    ["path", { d: "M4 18V6", key: "1rz3zl" }],
  ],
  h5: [
    ["path", { d: "M4 12h8", key: "17cfdx" }],
    ["path", { d: "M4 18V6", key: "1rz3zl" }],
    ["path", { d: "M12 18V6", key: "zqpxq5" }],
    ["path", { d: "M17 13v-3h4", key: "1nvgqp" }],
    [
      "path",
      {
        d: "M17 17.7c.4.2.8.3 1.3.3 1.5 0 2.7-1.1 2.7-2.5S19.8 13 18.3 13H17",
        key: "2nebdn",
      },
    ],
  ],
  h6: [
    ["path", { d: "M4 12h8", key: "17cfdx" }],
    ["path", { d: "M4 18V6", key: "1rz3zl" }],
    ["path", { d: "M12 18V6", key: "zqpxq5" }],
    ["circle", { cx: "19", cy: "16", r: "2", key: "15mx69" }],
    ["path", { d: "M20 10c-2 2-3 3.5-3 6", key: "f35dl0" }],
  ],
  bold: [
    [
      "path",
      {
        d: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8",
        key: "mg9rjx",
      },
    ],
  ],
  italic: [
    ["line", { x1: "19", x2: "10", y1: "4", y2: "4", key: "15jd3p" }],
    ["line", { x1: "14", x2: "5", y1: "20", y2: "20", key: "bu0au3" }],
    ["line", { x1: "15", x2: "9", y1: "4", y2: "20", key: "uljnxc" }],
  ],
  strikethrough: [
    ["path", { d: "M16 4H9a3 3 0 0 0-2.83 4", key: "43sutm" }],
    ["path", { d: "M14 12a4 4 0 0 1 0 8H6", key: "nlfj13" }],
    ["line", { x1: "4", x2: "20", y1: "12", y2: "12", key: "1e0a9i" }],
  ],
  code: [
    ["path", { d: "m18 16 4-4-4-4", key: "1inbqp" }],
    ["path", { d: "m6 8-4 4 4 4", key: "15zrgr" }],
    ["path", { d: "m14.5 4-5 16", key: "e7oirm" }],
  ],
  link: [
    [
      "path",
      {
        d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 1 0-7.07-7.07l-1.72 1.71",
        key: "1cjeqo",
      },
    ],
    [
      "path",
      {
        d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 1 0 7.07 7.07l1.71-1.71",
        key: "19qd67",
      },
    ],
  ],
  bulletList: [
    ["path", { d: "M3 5h.01", key: "18ugdj" }],
    ["path", { d: "M3 12h.01", key: "nlz23k" }],
    ["path", { d: "M3 19h.01", key: "noohij" }],
    ["path", { d: "M8 5h13", key: "1pao27" }],
    ["path", { d: "M8 12h13", key: "1za7za" }],
    ["path", { d: "M8 19h13", key: "m83p4d" }],
  ],
  orderedList: [
    ["path", { d: "M11 5h10", key: "1cz7ny" }],
    ["path", { d: "M11 12h10", key: "1438ji" }],
    ["path", { d: "M11 19h10", key: "11t30w" }],
    ["path", { d: "M4 4h1v5", key: "10yrso" }],
    ["path", { d: "M4 9h2", key: "r1h2o0" }],
    [
      "path",
      {
        d: "M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02",
        key: "xtkcd5",
      },
    ],
  ],
  todoList: [
    ["path", { d: "m3 7 2 2 4-4", key: "1obspn" }],
    ["path", { d: "m3 17 2 2 4-4", key: "1jhpwq" }],
    ["path", { d: "M13 5h8", key: "a7qcls" }],
    ["path", { d: "M13 12h8", key: "h98zly" }],
    ["path", { d: "M13 19h8", key: "c3s6r1" }],
  ],
  quote: [
    [
      "path",
      {
        d: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
        key: "rib7q0",
      },
    ],
    [
      "path",
      {
        d: "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
        key: "1ymkrd",
      },
    ],
  ],
  divider: [["path", { d: "M5 12h14", key: "1ays0h" }]],
  image: [
    [
      "rect",
      { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "1m3agn" },
    ],
    ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
    ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" }],
  ],
  table: [
    [
      "path",
      {
        d: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18",
        key: "gugj83",
      },
    ],
  ],
  codeBlock: [
    ["path", { d: "m10 9-3 3 3 3", key: "1oro0q" }],
    ["path", { d: "m14 15 3-3-3-3", key: "bz13h7" }],
    [
      "rect",
      { x: "3", y: "3", width: "18", height: "18", rx: "2", key: "h1oib" },
    ],
  ],
  dragHandle: [
    ["circle", { cx: "9", cy: "12", r: "1", key: "1vctgf" }],
    ["circle", { cx: "9", cy: "5", r: "1", key: "hp0tcf" }],
    ["circle", { cx: "9", cy: "19", r: "1", key: "fkjjf6" }],
    ["circle", { cx: "15", cy: "12", r: "1", key: "1tmaij" }],
    ["circle", { cx: "15", cy: "5", r: "1", key: "19l28e" }],
    ["circle", { cx: "15", cy: "19", r: "1", key: "f4zoj3" }],
  ],
  plus: [
    ["path", { d: "M5 12h14", key: "1ays0h" }],
    ["path", { d: "M12 5v14", key: "s699le" }],
  ],
  comment: [
    [
      "path",
      {
        d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
        key: "18887p",
      },
    ],
  ],
} satisfies Record<string, IconNode>;

const ICON_NAMES: Record<keyof typeof ICON_NODES, string> = {
  text: "text-align-start",
  h1: "heading-1",
  h2: "heading-2",
  h3: "heading-3",
  h4: "heading-4",
  h5: "heading-5",
  h6: "heading-6",
  bold: "bold",
  italic: "italic",
  strikethrough: "strikethrough",
  code: "code-xml",
  link: "link",
  bulletList: "list",
  orderedList: "list-ordered",
  todoList: "list-checks",
  quote: "quote",
  divider: "minus",
  image: "image",
  table: "table-2",
  codeBlock: "square-code",
  dragHandle: "grip-vertical",
  plus: "plus",
  comment: "message-square",
};

export const LUCIDE_ICONS = Object.fromEntries(
  Object.entries(ICON_NODES).map(([key, node]) => [
    key,
    renderIcon(ICON_NAMES[key as keyof typeof ICON_NAMES], node),
  ]),
) as {
  [K in keyof typeof ICON_NODES]: string;
};

export function lucideHeadingIcon(level: number | null): string {
  if (level === null) return LUCIDE_ICONS.text;
  return LUCIDE_ICONS[`h${level}` as `h${1 | 2 | 3 | 4 | 5 | 6}`];
}
