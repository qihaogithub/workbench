---
url: 'https://openpencil.dev/programmable/sdk/api/components/fill-picker-root.md'
description: Headless popover-based fill picker primitive.
---

# FillPickerRoot

`FillPickerRoot` is a headless popover-based fill picker for solid, gradient, and image fills.

## Props

## Events

## Slots

### Trigger slot props

```ts
{
  style: Record<string, string>
}
```

### Default slot props

```ts
{
  fill: Fill
  category: 'SOLID' | 'GRADIENT' | 'IMAGE'
  toSolid: () => void
  toGradient: () => void
  toImage: () => void
  update: (fill: Fill) => void
}
```

## Example

```vue
<FillPickerRoot :fill="fill" @update="fill = $event">
  <template #default="{ fill, category, toSolid, toGradient, update }">
    <div>{{ category }}</div>
    <button @click="toSolid">Solid</button>
    <button @click="toGradient">Gradient</button>
    <MyFillEditor :fill="fill" @change="update" />
  </template>
</FillPickerRoot>
```

## Related APIs

* [GradientEditorRoot](./gradient-editor-root)
