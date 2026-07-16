export const platformConfig = {
  name: "Universal AI",
  description:
    "Une intelligence artificielle universelle capable de réfléchir, rechercher, créer, coder et agir.",
  version: "0.1.0",
  defaultLocale: "fr",
  supportedProviders: ["openai", "anthropic", "gemini"] as const,
};
