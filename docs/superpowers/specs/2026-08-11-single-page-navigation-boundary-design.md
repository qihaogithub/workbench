# Single-page Navigation Boundary Design

## Outcome

Make the editor's top-level preview modes mutually clear: `单页` displays and navigates Demo pages only, while every document is viewed through the existing top-level `文档` mode.

## Architecture

The active Demo page remains the sole selection state for single-page preview. Its dropdown and previous/next controls derive only from `demoPages`, so navigation cannot enter a document target. Entering `单页` always restores the current active page, including projects that also contain knowledge documents or canvas document nodes.

Remove the document variant from the single-preview target and the single-page-only document projection pipeline. This includes canvas-document discovery, Markdown loading, document rendering, document history resolution, and the conditional configuration-panel behavior that existed only because a document could be selected inside `单页`. The existing `DocumentView` and `DocumentModeRightPanel` continue to own document browsing, editing, history entry points, and related document tools in `文档` mode.

## Interaction

The centered single-page selector lists page names without a `文档` group. Previous and next buttons move only within page order. When no page exists, `单页` keeps the current explicit empty state even if the project has documents; users select `文档` in the top header to work with those resources.

Visual editing, sketch editing, page history, page configuration, comments, runtime conversion, and preview rendering retain their existing behavior for the active page. The top-level `画布` and `文档` modes are otherwise unchanged.

## Data and state transitions

Page selection continues through the existing page-selection handler so unsaved visual-property work is protected and the active page, code, schema, and configuration stay synchronized. A mode change to `单页` normalizes the single-preview target to the active page; no document target is persisted or reconstructed.

Document data remains available to canvas and document mode. Removing the single-page document projection must not delete knowledge documents, canvas nodes, or shared document hooks needed by those modes.

## Testing and documentation

Add focused regressions proving that single-page items are produced only from Demo pages, previous/next boundaries cannot cross into documents, switching from `文档` back to `单页` restores the active Demo page without retaining a document target, and a project with documents but no Demo pages still shows the explicit single-page empty state. Update the existing single-preview history test so its contract covers page history only.

Update the preview requirements and real-time preview implementation document to state the new mode boundary. Refresh their module and global index summaries only where the current descriptions still advertise documents inside single-page preview.
