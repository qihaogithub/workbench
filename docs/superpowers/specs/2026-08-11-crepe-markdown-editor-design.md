# Crepe Markdown Editor Design

## Outcome

Replace the shared hand-assembled Milkdown editor UI with Milkdown Crepe across every `DocumentEditor` consumer while preserving the public React API and Markdown storage contract.

## Architecture

`DocumentEditor` remains the only shared editing boundary. It owns one Crepe instance, synchronizes controlled values without feedback loops, toggles read-only state through Crepe, and destroys the instance on unmount. Consumers do not need migrations because their props and stored Markdown remain unchanged.

Crepe provides Cursor, ListItem, LinkTooltip, ImageBlock, BlockEdit, Placeholder, Toolbar, CodeMirror, Table, and the native TopBar. Latex and AI remain disabled. The TopBar is the complete sticky document toolbar; project-specific reference, video, and attachment actions are added through `BlockEdit.buildMenu`, while image upload uses the ImageBlock configuration.

The native TopBar stays enabled in Crepe's immutable feature graph. `DocumentEditor` exposes its current read-only state on the editor root, and the host theme hides the TopBar whenever the editor is read-only. This avoids recreating Crepe, losing selection state, or duplicating editor commands in a custom toolbar.

## Styling

Import only Crepe common structural styles and maintain a project theme layer based on existing CSS custom properties. The layer adapts to light and dark hosts, defines readable typography and spacing, and styles menus, toolbars, tables, code blocks, image controls, focus states, and reduced motion consistently.

The native floating selection toolbar uses the host foreground color at full readable contrast, with visible hover and active backgrounds so its icons read as interactive controls in dark mode. The native block handle keeps both operations in their original order: add a block, then drag the current block. Each hit target is approximately 22 px with an approximately 14 px icon, a small gap, and explicit foreground plus hover styling. No custom block-edit behavior or replacement icons are introduced.

## Data and errors

Crepe emits Markdown into the existing `onChange` callback. Parent-originated values update the editor only when they differ from the last emitted value. Upload failures leave document content unchanged and surface the existing user-facing error message. Feature props are read through current refs so asynchronous callbacks do not capture stale handlers or candidates.

## Testing

Integration tests cover rendering, controlled updates, the root read-only marker, placeholder configuration, TopBar enablement, and custom menu construction. A theme-contract test covers the read-only TopBar rule, floating-toolbar contrast states, and compact two-operation block-handle styling. Package type checking and the relevant demo-ui/author-site checks guard shared consumers. Browser verification covers the dark document host, editable-only sticky TopBar, floating-toolbar contrast, and the visible compact add/drag block controls.
