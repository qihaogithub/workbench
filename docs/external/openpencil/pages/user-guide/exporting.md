---
url: 'https://openpencil.dev/user-guide/exporting.md'
description: >-
  Export images, SVG, and .fig subsets, and open .fig or .pen documents in
  OpenPencil.
---

# Exporting

Export individual nodes as images or `.fig` subsets, and open full `.fig` or `.pen` documents.

## Image Export

Select a node and use the Export section in the properties panel.

### Export Settings

* **Scale** — 0.5×, 0.75×, 1×, 1.5×, 2×, 3×, or 4× (hidden for SVG — vectors are resolution-independent)
* **Format** — PNG (transparent background), JPG (white background), WEBP (transparent background), SVG (vector), `.fig` (native document subset)

You can add multiple export settings to export the same node at different scales or formats in one go. A live preview with a checkerboard background shows what will be exported.

### Export Methods

| Method | Mac | Windows / Linux |
|--------|-----|-----------------|
| Keyboard shortcut | ⇧⌘E | Shift + Ctrl + E |
| Context menu | Right-click → Export… | Right-click → Export… |
| Properties panel | Click "Export" button | Click "Export" button |

The exported file is saved via a native dialog (desktop) or browser download.

## Copy/Paste as

In addition to file export, you can copy the selection to the clipboard in multiple formats via the context menu (right-click → Copy/Paste as):

| Action | Shortcut (Mac) | Shortcut (Win/Linux) |
|--------|----------------|----------------------|
| Copy as text | — | — |
| Copy as SVG | — | — |
| Copy as PNG | ⇧⌘C | Shift + Ctrl + C |
| Copy as JSX | — | — |

* **Copy as text** — copies visible text content from the selection
* **Copy as SVG** — copies the selection as SVG markup (paste into code editors, Inkscape, etc.)
* **Copy as PNG** — renders at 2× and copies to the clipboard (ready to paste into Slack, Notion, etc.)
* **Copy as JSX** — copies the OpenPencil JSX representation (compatible with `renderJsx()`)

## .fig File Operations

OpenPencil uses the .fig format for full documents — the same binary format as Figma.

### Opening Files

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Open file | ⌘O | Ctrl + O |

A file picker dialog opens, filtered for `.fig` and `.pen` files. On the desktop app, this uses the native OS dialog.

### Saving Files

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Save | ⌘S | Ctrl + S |
| Save As | ⇧⌘S | Shift + Ctrl + S |

* **Save** overwrites the currently open file without a dialog
* **Save As** opens a save dialog to choose a new location

Saved files are compressed and include a thumbnail image for preview in file browsers.

### Round-trip Compatibility

Files exported from OpenPencil can be opened in Figma, and vice versa. The .fig format preserves all node types, properties, fills, strokes, effects, vector data, and layout settings.

## Keyboard Shortcuts

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Export selection | ⇧⌘E | Shift + Ctrl + E |
| Copy as PNG | ⇧⌘C | Shift + Ctrl + C |
| Open file | ⌘O | Ctrl + O |
| Save | ⌘S | Ctrl + S |
| Save As | ⇧⌘S | Shift + Ctrl + S |

## Tips

* Use 2× or 3× scale when exporting for high-DPI screens.
* JPG always uses a white background — use PNG or WEBP if you need transparency.
* Use SVG export when you need a vector format for further editing in Illustrator, Inkscape, or code.
* The thumbnail in exported .fig files enables preview in file browsers and Figma's file picker.
