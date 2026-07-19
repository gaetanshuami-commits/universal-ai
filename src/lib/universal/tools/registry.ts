import { UniversalRegistry } from "../core";
import { calculatorTool } from "./calculator";
import { webSearchTool } from "./web";
import type { UniversalTool } from "./types";

export const universalToolRegistry =
  new UniversalRegistry<UniversalTool>();

let bootstrapped = false;

export function bootstrapUniversalTools(): void {
  if (bootstrapped) return;

  universalToolRegistry.register(
    calculatorTool.id,
    calculatorTool,
  );

  universalToolRegistry.register(
    webSearchTool.id,
    webSearchTool,
  );

  bootstrapped = true;
}
