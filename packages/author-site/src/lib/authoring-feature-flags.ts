export const SKETCH_SCENE_AUTHORING_ENABLED =
  process.env.NEXT_PUBLIC_SKETCH_SCENE_AUTHORING_ENABLED === "true";

export const OPENPENCIL_SKETCH_SPIKE_ENABLED =
  process.env.NEXT_PUBLIC_OPENPENCIL_SKETCH_SPIKE_ENABLED === "true";

export const OPENPENCIL_SPIKE_EDITOR_URL =
  process.env.NEXT_PUBLIC_OPENPENCIL_SPIKE_EDITOR_URL || "http://127.0.0.1:3410";

export function isSketchSceneAuthoringEnabled(): boolean {
  return SKETCH_SCENE_AUTHORING_ENABLED;
}
