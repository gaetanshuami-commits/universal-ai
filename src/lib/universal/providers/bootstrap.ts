import { universalProviderRegistry } from "./registry";

import { AnthropicProvider } from "./adapters/anthropic";
import { DeepSeekProvider } from "./adapters/deepseek";
import { GeminiProvider } from "./adapters/gemini";
import { OpenAIProvider } from "./adapters/openai";

let bootstrapped = false;

export function bootstrapUniversalProviders(): void {
  if (bootstrapped) {
    return;
  }

  const providers = [
    new OpenAIProvider(),
    new AnthropicProvider(),
    new GeminiProvider(),
    new DeepSeekProvider(),
  ];

  for (const provider of providers) {
    universalProviderRegistry.register(
      provider,
      {
        replace: true,
      },
    );
  }

  bootstrapped = true;
}
