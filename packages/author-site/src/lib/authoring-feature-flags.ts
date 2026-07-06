export const SKETCH_SCENE_AUTHORING_ENABLED =
  process.env.NEXT_PUBLIC_SKETCH_SCENE_AUTHORING_ENABLED === "true";

export function isSketchSceneAuthoringEnabled(): boolean {
  return SKETCH_SCENE_AUTHORING_ENABLED;
}
