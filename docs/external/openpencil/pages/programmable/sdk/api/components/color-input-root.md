---
url: 'https://openpencil.dev/programmable/sdk/api/components/color-input-root.md'
description: Headless color input helper with hex parsing and update helpers.
---

# ColorInputRoot

`ColorInputRoot` is a headless helper for color input UIs.

It derives a hex value from a color and exposes update helpers for hex and full-color changes.

## Props

## Events

## Slots

## Example

```vue
<ColorInputRoot :color="color" @update="color = $event" v-slot="{ hex, updateFromHex }">
  <input :value="hex" @input="updateFromHex(($event.target as HTMLInputElement).value)" />
</ColorInputRoot>
```

## Related APIs

* [ColorPickerRoot](./color-picker-root)
