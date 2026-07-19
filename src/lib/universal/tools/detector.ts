import {
  bootstrapUniversalTools,
  universalToolRegistry,
} from "./registry";

import type {
  UniversalToolDetection,
  UniversalToolDetectionContext,
} from "./types";

const MINIMUM_TOOL_CONFIDENCE = 0.75;

export function detectUniversalTools(
  context: UniversalToolDetectionContext,
): ReadonlyArray<UniversalToolDetection> {
  bootstrapUniversalTools();

  return universalToolRegistry
    .list()
    .map((entry) =>
      entry.value.detect(context),
    )
    .filter(
      (
        detection,
      ): detection is UniversalToolDetection =>
        detection !== null &&
        detection.confidence >=
          MINIMUM_TOOL_CONFIDENCE,
    )
    .sort(
      (left, right) =>
        right.confidence -
        left.confidence,
    );
}