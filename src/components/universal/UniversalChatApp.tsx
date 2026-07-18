"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  streamUniversalChat,
} from "../../lib/universal/chat/client";

type MessageRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  providerId?: string;
  model?: string;
  fallbackUsed?: boolean;
  error?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface ProviderOption {
  id: string;
  label: string;
  providerId?: string;
  description: string;
}

const STORAGE_KEY =
  "universal-ai-conversations-v1";

const PROVIDERS: ProviderOption[] = [
  {
    id: "auto",
    label: "Auto",
    description:
      "Universal AI sélectionne automatiquement le meilleur modèle.",
  },
  {
    id: "openai",
    label: "OpenAI",
    providerId: "openai",
    description:
      "Raisonnement, rédaction, analyse et code.",
  },
  {
    id: "anthropic",
    label: "Claude",
    providerId: "anthropic",
    description:
      "Analyse approfondie, écriture et programmation.",
  },
  {
    id: "google",
    label: "Gemini",
    providerId: "google",
    description:
      "Multimodal, rapidité et contexte étendu.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    providerId: "deepseek",
    description:
      "Code, raisonnement et tâches techniques.",
  },
];

const SUGGESTIONS = [
  {
    title: "Créer un produit",
    prompt:
      "Aide-moi à transformer mon idée en produit avec une stratégie, une architecture et un plan d’exécution.",
  },
  {
    title: "Analyser un marché",
    prompt:
      "Réalise une analyse structurée du marché, de la concurrence, des opportunités et des risques.",
  },
  {
    title: "Développer du code",
    prompt:
      "Aide-moi à concevoir une fonctionnalité logicielle robuste, modulaire et prête pour la production.",
  },
  {
    title: "Préparer une stratégie",
    prompt:
      "Construis une stratégie claire avec les priorités, les étapes, les ressources et les indicateurs de réussite.",
  },
];

function createId(): string {
  return crypto.randomUUID();
}

function createConversation(): Conversation {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: "Nouvelle conversation",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function buildConversationTitle(
  content: string,
): string {
  const normalized = content
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Nouvelle conversation";
  }

  return normalized.length > 42
    ? `${normalized.slice(0, 42).trim()}…`
    : normalized;
}

export default function UniversalChatApp() {
  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [activeConversationId, setActiveConversationId] =
    useState<string>("");

  const [input, setInput] = useState("");
  const [providerSelection, setProviderSelection] =
    useState("auto");

  const [isGenerating, setIsGenerating] =
    useState(false);

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [providerMenuOpen, setProviderMenuOpen] =
    useState(false);

  const [hasLoadedStorage, setHasLoadedStorage] =
    useState(false);

  const abortControllerRef =
    useRef<AbortController | null>(null);

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(null);

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw =
        window.localStorage.getItem(
          STORAGE_KEY,
        );

      if (raw) {
        const parsed =
          JSON.parse(raw) as Conversation[];

        if (
          Array.isArray(parsed) &&
          parsed.length > 0
        ) {
          setConversations(parsed);
          setActiveConversationId(
            parsed[0].id,
          );
          setHasLoadedStorage(true);
          return;
        }
      }
    } catch {
      window.localStorage.removeItem(
        STORAGE_KEY,
      );
    }

    const initial = createConversation();

    setConversations([initial]);
    setActiveConversationId(initial.id);
    setHasLoadedStorage(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(conversations),
    );
  }, [
    conversations,
    hasLoadedStorage,
  ]);

  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) =>
          conversation.id ===
          activeConversationId,
      ) ?? conversations[0],
    [
      conversations,
      activeConversationId,
    ],
  );

  const selectedProvider =
    PROVIDERS.find(
      (provider) =>
        provider.id === providerSelection,
    ) ?? PROVIDERS[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [
    activeConversation?.messages,
    isGenerating,
  ]);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height =
      `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [input]);

  function updateConversation(
    conversationId: string,
    updater: (
      conversation: Conversation,
    ) => Conversation,
  ): void {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? updater(conversation)
          : conversation,
      ),
    );
  }

  function handleNewConversation(): void {
    if (isGenerating) {
      abortControllerRef.current?.abort();
      setIsGenerating(false);
    }

    const conversation =
      createConversation();

    setConversations((current) => [
      conversation,
      ...current,
    ]);

    setActiveConversationId(
      conversation.id,
    );

    setInput("");
    setSidebarOpen(false);

    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  }

  function handleDeleteConversation(
    conversationId: string,
  ): void {
    setConversations((current) => {
      const remaining = current.filter(
        (conversation) =>
          conversation.id !== conversationId,
      );

      if (remaining.length > 0) {
        if (
          activeConversationId ===
          conversationId
        ) {
          setActiveConversationId(
            remaining[0].id,
          );
        }

        return remaining;
      }

      const replacement =
        createConversation();

      setActiveConversationId(
        replacement.id,
      );

      return [replacement];
    });
  }

  async function sendMessage(
    requestedPrompt?: string,
  ): Promise<void> {
    const prompt = (
      requestedPrompt ?? input
    ).trim();

    if (
      !prompt ||
      !activeConversation ||
      isGenerating
    ) {
      return;
    }

    const conversationId =
      activeConversation.id;

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: prompt,
      createdAt:
        new Date().toISOString(),
    };

    const assistantMessageId =
      createId();

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      createdAt:
        new Date().toISOString(),
    };

    updateConversation(
      conversationId,
      (conversation) => ({
        ...conversation,
        title:
          conversation.messages.length === 0
            ? buildConversationTitle(prompt)
            : conversation.title,
        updatedAt:
          new Date().toISOString(),
        messages: [
          ...conversation.messages,
          userMessage,
          assistantMessage,
        ],
      }),
    );

    setInput("");
    setIsGenerating(true);
    setProviderMenuOpen(false);

    const controller =
      new AbortController();

    abortControllerRef.current =
      controller;

    const priorMessages =
      activeConversation.messages
        .filter(
          (message) => !message.error,
        )
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

    try {
      await streamUniversalChat(
        {
          messages: [
            ...priorMessages,
            {
              role: "user",
              content: prompt,
            },
          ],
          mode: "auto",
          providerId:
            selectedProvider.providerId,
          allowFallback: true,
          stream: true,
        },
        {
          onDelta(delta) {
            updateConversation(
              conversationId,
              (conversation) => ({
                ...conversation,
                updatedAt:
                  new Date().toISOString(),
                messages:
                  conversation.messages.map(
                    (message) =>
                      message.id ===
                      assistantMessageId
                        ? {
                            ...message,
                            content:
                              message.content +
                              delta,
                          }
                        : message,
                  ),
              }),
            );
          },

          onComplete(result) {
            updateConversation(
              conversationId,
              (conversation) => ({
                ...conversation,
                updatedAt:
                  new Date().toISOString(),
                messages:
                  conversation.messages.map(
                    (message) =>
                      message.id ===
                      assistantMessageId
                        ? {
                            ...message,
                            content:
                              result.content ||
                              message.content,
                            providerId:
                              result.metadata
                                .providerId,
                            model:
                              result.metadata
                                .model,
                            fallbackUsed:
                              result.metadata
                                .fallbackUsed,
                          }
                        : message,
                  ),
              }),
            );
          },

          onError(error) {
            updateConversation(
              conversationId,
              (conversation) => ({
                ...conversation,
                updatedAt:
                  new Date().toISOString(),
                messages:
                  conversation.messages.map(
                    (message) =>
                      message.id ===
                      assistantMessageId
                        ? {
                            ...message,
                            error: true,
                            content:
                              error.message ||
                              "La génération a échoué.",
                          }
                        : message,
                  ),
              }),
            );
          },
        },
        controller.signal,
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        updateConversation(
          conversationId,
          (conversation) => ({
            ...conversation,
            messages:
              conversation.messages.map(
                (message) =>
                  message.id ===
                  assistantMessageId
                    ? {
                        ...message,
                        content:
                          message.content ||
                          "Génération arrêtée.",
                      }
                    : message,
              ),
          }),
        );
      } else {
        const message =
          error instanceof Error
            ? error.message
            : "Une erreur inattendue est survenue.";

        updateConversation(
          conversationId,
          (conversation) => ({
            ...conversation,
            messages:
              conversation.messages.map(
                (currentMessage) =>
                  currentMessage.id ===
                  assistantMessageId
                    ? {
                        ...currentMessage,
                        error: true,
                        content: message,
                      }
                    : currentMessage,
              ),
          }),
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  }

  function stopGeneration(): void {
    abortControllerRef.current?.abort();
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const hasMessages =
    Boolean(
      activeConversation &&
        activeConversation.messages.length >
          0,
    );

  return (
    <main className="flex min-h-screen bg-[#f7f8fa] text-[#17191f]">
      {sidebarOpen ? (
        <button
          aria-label="Fermer le menu"
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() =>
            setSidebarOpen(false)
          }
          type="button"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-[290px] flex-col border-r border-black/[0.06] bg-white transition-transform duration-300 lg:static lg:translate-x-0",
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-20 items-center gap-3 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#111318] text-sm font-bold text-white shadow-sm">
            U
          </div>

          <div>
            <div className="text-[15px] font-semibold tracking-[-0.02em]">
              Universal AI
            </div>
            <div className="text-xs text-black/45">
              Intelligence unifiée
            </div>
          </div>
        </div>

        <div className="px-4">
          <button
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#15171c] px-4 text-sm font-medium text-white transition hover:bg-black"
            onClick={handleNewConversation}
            type="button"
          >
            <span className="text-lg leading-none">
              +
            </span>
            Nouvelle conversation
          </button>
        </div>

        <div className="mt-7 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/35">
          Conversations
        </div>

        <div className="mt-3 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {conversations.map(
            (conversation) => {
              const active =
                conversation.id ===
                activeConversation?.id;

              return (
                <div
                  className={[
                    "group flex items-center rounded-xl transition",
                    active
                      ? "bg-[#f0f1f4]"
                      : "hover:bg-[#f7f7f8]",
                  ].join(" ")}
                  key={conversation.id}
                >
                  <button
                    className="min-w-0 flex-1 px-3 py-3 text-left"
                    onClick={() => {
                      setActiveConversationId(
                        conversation.id,
                      );
                      setSidebarOpen(false);
                    }}
                    type="button"
                  >
                    <div className="truncate text-sm font-medium">
                      {conversation.title}
                    </div>

                    <div className="mt-1 text-[11px] text-black/35">
                      {
                        conversation.messages
                          .length
                      }{" "}
                      message
                      {conversation.messages
                        .length > 1
                        ? "s"
                        : ""}
                    </div>
                  </button>

                  <button
                    aria-label="Supprimer la conversation"
                    className="mr-2 hidden h-8 w-8 items-center justify-center rounded-lg text-black/35 transition hover:bg-white hover:text-black group-hover:flex"
                    onClick={() =>
                      handleDeleteConversation(
                        conversation.id,
                      )
                    }
                    type="button"
                  >
                    ×
                  </button>
                </div>
              );
            },
          )}
        </div>

        <div className="border-t border-black/[0.06] p-4">
          <div className="rounded-2xl bg-[#f6f7f9] p-4">
            <div className="text-xs font-semibold">
              Universal Router
            </div>
            <div className="mt-1 text-xs leading-5 text-black/45">
              Sélection intelligente et
              fallback multi-modèles.
            </div>
          </div>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-black/[0.05] bg-[#f7f8fa]/90 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Ouvrir le menu"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.08] bg-white lg:hidden"
              onClick={() =>
                setSidebarOpen(true)
              }
              type="button"
            >
              <span className="space-y-1">
                <span className="block h-px w-4 bg-black" />
                <span className="block h-px w-4 bg-black" />
                <span className="block h-px w-4 bg-black" />
              </span>
            </button>

            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold sm:text-base">
                {activeConversation?.title ??
                  "Universal AI"}
              </h1>

              <p className="hidden text-xs text-black/40 sm:block">
                Assistant multi-modèles
                intelligent
              </p>
            </div>
          </div>

          <div className="relative">
            <button
              className="flex h-10 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-sm font-medium shadow-sm transition hover:border-black/15"
              onClick={() =>
                setProviderMenuOpen(
                  (current) => !current,
                )
              }
              type="button"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#eff0f3] text-[10px] font-bold">
                {selectedProvider.label
                  .slice(0, 1)
                  .toUpperCase()}
              </span>

              <span>
                {selectedProvider.label}
              </span>

              <span className="text-[10px] text-black/35">
                ▾
              </span>
            </button>

            {providerMenuOpen ? (
              <div className="absolute right-0 top-12 z-50 w-[280px] rounded-2xl border border-black/[0.08] bg-white p-2 shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
                {PROVIDERS.map(
                  (provider) => (
                    <button
                      className={[
                        "flex w-full gap-3 rounded-xl p-3 text-left transition",
                        provider.id ===
                        providerSelection
                          ? "bg-[#f2f3f5]"
                          : "hover:bg-[#f7f7f8]",
                      ].join(" ")}
                      key={provider.id}
                      onClick={() => {
                        setProviderSelection(
                          provider.id,
                        );
                        setProviderMenuOpen(
                          false,
                        );
                      }}
                      type="button"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#15171c] text-xs font-bold text-white">
                        {provider.label
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>

                      <span>
                        <span className="block text-sm font-semibold">
                          {provider.label}
                        </span>

                        <span className="mt-1 block text-xs leading-4 text-black/45">
                          {
                            provider.description
                          }
                        </span>
                      </span>
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {!hasMessages ? (
            <div className="mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-4xl flex-col justify-center px-5 py-12 sm:px-8">
              <div className="max-w-2xl">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#15171c] text-xl font-bold text-white shadow-lg shadow-black/10">
                  U
                </div>

                <h2 className="text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
                  Comment puis-je vous aider ?
                </h2>

                <p className="mt-4 max-w-xl text-base leading-7 text-black/48">
                  Une seule interface pour
                  interroger plusieurs modèles
                  d’intelligence artificielle et
                  sélectionner automatiquement le
                  plus adapté.
                </p>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                {SUGGESTIONS.map(
                  (suggestion) => (
                    <button
                      className="group rounded-2xl border border-black/[0.07] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-black/15 hover:shadow-md"
                      key={suggestion.title}
                      onClick={() =>
                        void sendMessage(
                          suggestion.prompt,
                        )
                      }
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-sm font-semibold">
                          {suggestion.title}
                        </span>

                        <span className="text-black/25 transition group-hover:translate-x-0.5 group-hover:text-black">
                          →
                        </span>
                      </div>

                      <p className="mt-2 text-sm leading-6 text-black/45">
                        {suggestion.prompt}
                      </p>
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
              <div className="space-y-8">
                {activeConversation?.messages.map(
                  (message) => (
                    <article
                      className={[
                        "flex gap-3 sm:gap-4",
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start",
                      ].join(" ")}
                      key={message.id}
                    >
                      {message.role ===
                      "assistant" ? (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#15171c] text-[11px] font-bold text-white">
                          U
                        </div>
                      ) : null}

                      <div
                        className={[
                          "max-w-[88%] sm:max-w-[78%]",
                          message.role === "user"
                            ? "rounded-[22px] rounded-br-md bg-[#15171c] px-5 py-3.5 text-white"
                            : "min-w-0",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "whitespace-pre-wrap break-words text-[15px] leading-7",
                            message.error
                              ? "text-red-600"
                              : "",
                          ].join(" ")}
                        >
                          {message.content ? (
                            message.content
                          ) : isGenerating &&
                            message.role === "assistant" ? (
                            <span className="inline-flex items-center gap-1.5 py-2">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black/35" />
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black/35 [animation-delay:150ms]" />
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black/35 [animation-delay:300ms]" />
                            </span>
                          ) : null}
                        </div>

                        {message.role ===
                          "assistant" &&
                        message.providerId ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-black/35">
                            <span className="rounded-md bg-black/[0.045] px-2 py-1">
                              {
                                message.providerId
                              }
                            </span>

                            {message.model ? (
                              <span className="rounded-md bg-black/[0.045] px-2 py-1">
                                {message.model}
                              </span>
                            ) : null}

                            {message.fallbackUsed ? (
                              <span className="rounded-md bg-black/[0.045] px-2 py-1">
                                fallback utilisé
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ),
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-20 bg-gradient-to-t from-[#f7f8fa] via-[#f7f8fa] to-transparent px-4 pb-5 pt-6 sm:px-7">
          <form
            className="mx-auto max-w-4xl"
            onSubmit={handleSubmit}
          >
            <div className="rounded-[24px] border border-black/[0.09] bg-white p-2 shadow-[0_12px_40px_rgba(20,24,35,0.09)] transition focus-within:border-black/20">
              <textarea
                className="block max-h-[180px] min-h-[52px] w-full resize-none bg-transparent px-3 py-3 text-[15px] leading-6 outline-none placeholder:text-black/30"
                disabled={isGenerating}
                onChange={(event) =>
                  setInput(event.target.value)
                }
                onKeyDown={handleKeyDown}
                placeholder="Écrivez votre message à Universal AI…"
                ref={textareaRef}
                rows={1}
                value={input}
              />

              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <div className="flex items-center gap-2 px-2 text-xs text-black/35">
                  <span className="hidden sm:inline">
                    {selectedProvider.label}
                  </span>

                  <span className="hidden sm:inline">
                    ·
                  </span>

                  <span>
                    Entrée pour envoyer
                  </span>
                </div>

                {isGenerating ? (
                  <button
                    className="flex h-10 items-center gap-2 rounded-xl bg-[#15171c] px-4 text-sm font-medium text-white"
                    onClick={stopGeneration}
                    type="button"
                  >
                    <span className="h-3 w-3 rounded-[3px] bg-white" />
                    Arrêter
                  </button>
                ) : (
                  <button
                    aria-label="Envoyer"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#15171c] text-lg text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={!input.trim()}
                    type="submit"
                  >
                    ↑
                  </button>
                )}
              </div>
            </div>

            <p className="mt-2 text-center text-[11px] text-black/30">
              Universal AI peut commettre des
              erreurs. Vérifiez les informations
              importantes.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}

