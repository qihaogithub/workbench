---
url: 'https://openpencil.dev/programmable/sdk/api/components/gradient-editor-stop.md'
description: Headless slot primitive for a single gradient stop row.
---

# GradientEditorStop

`GradientEditorStop` is a headless primitive for rendering and editing a single gradient stop.

## Props

## Events

## Slots

### Default slot props

```ts
{
  stop: GradientStop
  index: number
  active: boolean
  positionPercent: number
  opacityPercent: number
  hex: string
  css: string
  select: () => void
  updatePosition: (position: number) => void
  updateColor: (hex: string) => void
  updateOpacity: (opacity: number) => void
  remove: () => void
}
```

## Example

```vue
<GradientEditorStop :stop="stop" :index="index" :active="active" v-slot="ctx">
  <MyGradientStopRow v-bind="ctx" />
</GradientEditorStop>
```

## Related APIs

* [GradientEditorRoot](./gradient-editor-root)
* [GradientEditorBar](./gradient-editor-bar)
