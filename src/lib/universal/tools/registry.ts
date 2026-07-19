import {
  UniversalRegistry,
} from "../core";

import {
  calculatorTool,
} from "./calculator";

import type {
  UniversalTool,
} from "./types";

export const universalToolRegistry =
  new UniversalRegistry<UniversalTool>();

let bootstrapped = false;

export function bootstrapUniversalTools(): void {
  if (bootstrapped) {
    return;
  }

  universalToolRegistry.register(
    calculatorTool.id,
    calculatorTool,
  );

  bootstrapped = true;
}