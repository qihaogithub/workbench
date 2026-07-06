---
url: 'https://openpencil.dev/programmable/sdk/api/components/color-picker-root.md'
description: Headless popover-based color picker primitive.
---

# ColorPickerRoot

`ColorPickerRoot` is a headless popover-based color picker primitive.

It provides:

* a trigger slot with swatch background styling
* a default trigger fallback
* a content slot with `color` and `update()`

## Props

## Events

## Slots

## Example

```vue
<ColorPickerRoot :color="color" @update="color = $event">
  <template #trigger="{ style }">
    <button class="size-6 rounded border" :style="style" />
  </template>

  <template #default="{ color, update }">
    <MyColorEditor :color="color" @change="update" />
  </template>
</ColorPickerRoot>
```

## Related APIs

* [ColorInputRoot](./color-input-root)
