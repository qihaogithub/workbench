---
url: 'https://openpencil.dev/programmable/sdk/api/components/gradient-editor-bar.md'
description: Headless draggable bar primitive for gradient stops.
---

# GradientEditorBar

`GradientEditorBar` is the draggable bar primitive used inside gradient editors.

## Props

## Events

## Slots

### Default slot props

```ts
{
  stops: GradientStop[]
  activeStopIndex: number
  barBackground: string
  barRef: (el: unknown) => void
  onStopPointerDown: (index: number, event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: () => void
  draggingIndex: number | null
}
```

## Example

```vue
<GradientEditorBar
  :stops="stops"
  :active-stop-index="activeStopIndex"
  :bar-background="barBackground"
  @select-stop="selectStop"
  @drag-stop="dragStop"
  v-slot="ctx"
>
  <MyGradientBar v-bind="ctx" />
</GradientEditorBar>
```

## Related APIs

* [GradientEditorRoot](./gradient-editor-root)
* [GradientEditorStop](./gradient-editor-stop)
