/**
 * Compatibility barrel for toolchains that resolve package subpaths as files.
 * The package export points directly at `document/contracts.ts`; keeping this
 * tiny entry avoids a second contract implementation in Jest/TS path maps.
 */
export * from "./document/contracts";
