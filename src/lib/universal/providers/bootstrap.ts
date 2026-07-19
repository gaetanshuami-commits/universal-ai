import { universalProviderRegistry } from "./registry";
import { OpenRouterManagerProvider } from "./adapters/openrouter-manager";

let bootstrapped = false;

export function bootstrapUniversalProviders(): void {
  if (bootstrapped) {
    return;
  }

  universalProviderRegistry.register(
    new OpenRouterManagerProvider(),
    {
      replace: true,
    },
  );

  bootstrapped = true;
}
