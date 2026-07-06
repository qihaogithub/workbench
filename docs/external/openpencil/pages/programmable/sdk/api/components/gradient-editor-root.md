---
url: 'https://openpencil.dev/programmable/sdk/api/components/gradient-editor-root.md'
description: Headless root primitive for gradient stop editing.
---

# GradientEditorRoot

`GradientEditorRoot` is a headless root primitive for gradient editing.

It owns:

* active stop state
* subtype switching
* stop add/remove/update logic
* active color editing
* derived bar background

## Props

## Events

## Slots

### Default slot props

```ts
{
  stops: GradientStop[]
  subtype: GradientSubtype
  subtypes: Array<{ value: GradientSubtype; label: string }>
  activeStopIndex: number
  activeColor: Color
  barBackground: string
  setSubtype: (type: GradientSubtype) => void
  selectStop: (index: number) => void
  addStop: () => void
  removeStop: (index: number) => void
  updateStopPosition: (index: number, position: number) => void
  updateStopColor: (index: number, hex: string) => void
  updateStopOpacity: (index: number, opacity: number) => void
  updateActiveColor: (color: Color) => void
  dragStop: (index: number, position: number) => void
}
```

## Example

```vue
<GradientEditorRoot :fill="fill" @update="fill = $event" v-slot="ctx">
  <MyGradientUI v-bind="ctx" />
</GradientEditorRoot>
```

## Related APIs

* [GradientEditorBar](./gradient-editor-bar)
* [GradientEditorStop](./gradient-editor-stop)
