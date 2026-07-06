---
url: 'https://openpencil.dev/programmable/sdk/api/components/font-picker-root.md'
description: Headless searchable font picker built on Reka Combobox.
---

# FontPickerRoot

`FontPickerRoot` is a headless searchable font picker built on Reka UI Combobox primitives.

## Props

## Model

## Events

## Slots

## Example

```vue
<FontPickerRoot v-model="fontFamily" :list-families="listFamilies">
  <template #trigger="{ value }">
    <button class="w-full truncate">{{ value }}</button>
  </template>
</FontPickerRoot>
```

## Related APIs

* [useTypography](../composables/use-typography)
