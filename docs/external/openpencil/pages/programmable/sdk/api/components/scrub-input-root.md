---
url: 'https://openpencil.dev/programmable/sdk/api/components/scrub-input-root.md'
description: Headless root primitive for drag-to-scrub numeric input.
---

# ScrubInputRoot

`ScrubInputRoot` is the headless root primitive for drag-to-scrub numeric input.

It manages:

* mixed-value display
* editing vs scrubbing state
* pointer-driven numeric scrubbing
* commit semantics for finished edits

## Props

## Model

## Events

## Slots

## Example

```vue
<ScrubInputRoot v-model:model-value="value" @commit="commit" v-slot="ctx">
  <div @pointerdown="ctx.startScrub">
    <ScrubInputDisplay />
    <ScrubInputField class="w-16" />
  </div>
</ScrubInputRoot>
```

## Related APIs

* [ScrubInputField](./scrub-input-field)
* [ScrubInputDisplay](./scrub-input-display)
