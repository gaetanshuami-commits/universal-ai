"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Atom,
  Bot,
  Boxes,
  BrainCircuit,
  BriefcaseBusiness,
  Camera,
  ChevronDown,
  CircleUserRound,
  Code2,
  Command,
  FileSearch,
  Gamepad2,
  Globe2,
  Image,
  Infinity,
  LayoutGrid,
  Menu,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  Paperclip,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  TerminalSquare,
  Video,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";

type Provider = "auto" | "openai" | "anthropic" | "gemini";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface NavigationItem {
  label: string;
  description: string;
  icon: typeof Bot;
  badge?: string;
}

const navigationGroups: Array<{
  label: string;
  items: NavigationItem[];
}> = [
  {
    label: "Intelligence",
    items: [
      {
        label: "Assistant universel",
        description: "Raisonnement et exécution",
        icon: BrainCircuit,
      },
      {
        label: "Recherche profonde",
        description: "Web, sources et documents",
        icon: FileSearch,
      },
      {
        label: "AI Code",
        description: "Développement agentique",
        icon: Code2,
        badge: "Pro",
      },
    ],
  },
  {
    label: "Création",
    items: [
      {
        label: "Créer cette entreprise",
        description: "De l’idée au lancement",
        icon: BriefcaseBusiness,
        badge: "New",
      },
      {
        label: "AI Company",
        description: "Équipe d’agents IA",
        icon: Boxes,
      },
      {
        label: "AI Creator",
        description: "Images, vidéo et médias",
        icon: Image,
      },
    ],
  },
  {
    label: "Expériences",
    items: [
      {
        label: "AI Gamer",
        description: "Copilote de jeu temps réel",
        icon: Gamepad2,
      },
      {
        label: "AI Streamer",
        description: "Studio live intelligent",
        icon: Radio,
      },
      {
        label: "AI Camera",
        description: "Comprendre le monde",
        icon: Camera,
      },
      {
        label: "AI Impossible",
        description: "Solutions hors norme",
        icon: Infinity,
      },
    ],
  },
];

const launchActions = [
  {
    title: "Créer une entreprise",
    description:
      "Transformez une idée en marque, business plan, plateforme et stratégie de lancement.",
    icon: BriefcaseBusiness,
    prompt:
      "Je veux créer cette entreprise. Aide-moi à structurer le projet complet de l'idée au lancement.",
    accent: "violet",
  },
  {
    title: "Construire un produit",
    description:
      "Architecture, code, base de données, tests, sécurité et déploiement.",
    icon: TerminalSquare,
    prompt:
      "Je veux construire un produit numérique complet. Commence par définir l'architecture professionnelle.",
    accent: "cyan",
  },
  {
    title: "Lancer une recherche",
    description:
      "Analysez le web, vos fichiers et plusieurs sources avec une synthèse vérifiable.",
    icon: Globe2,
    prompt:
      "Lance une recherche approfondie et structurée sur le sujet suivant :",
    accent: "blue",
  },
  {
    title: "Créer un contenu",
    description:
      "Campagne, vidéo, identité visuelle, présentation ou stratégie éditoriale.",
    icon: WandSparkles,
    prompt:
      "Crée une stratégie de contenu premium et complète pour mon projet.",
    accent: "gold",
  },
];

const capabilities = [
  "Raisonnement avancé",
  "Recherche web",
  "Création de code",
  "Analyse de fichiers",
  "Images et vidéo",
  "Agents autonomes",
];

const initialMessages: Message[] = [];

export default function Home() {
  const [messages, setMessages] =
    useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<Provider>("auto");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState("");
  const [activeNav, setActiveNav] = useState("Assistant universel");

  const abortControllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  function applyPrompt(prompt: string) {
    setInput(prompt);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();

    const content = input.trim();

    if (!content || isStreaming) {
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };

    const assistantId = crypto.randomUUID();
    const nextMessages = [...messages, userMessage];

    setMessages([
      ...nextMessages,
      {
        id: assistantId,
        role: "assistant",
        content: "",
      },
    ]);

    setInput("");
    setIsStreaming(true);
    setActiveProvider("");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          conversationId: "local-development",
          messages: nextMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = (await response.json()) as {
          error?: string;
        };

        throw new Error(
          errorData.error ?? "La requête IA a échoué.",
        );
      }

      setActiveProvider(
        response.headers.get("X-AI-Provider") ?? provider,
      );

      if (!response.body) {
        throw new Error("Le serveur n'a retourné aucun flux.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, {
          stream: true,
        });

        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: message.content + chunk,
                }
              : message,
          ),
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Une erreur inattendue est survenue.";

      if (
        errorMessage !== "The user aborted a request." &&
        errorMessage !== "This operation was aborted"
      ) {
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: `Erreur : ${errorMessage}`,
                }
              : message,
          ),
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }

  function stopGeneration() {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function newConversation() {
    if (isStreaming) {
      stopGeneration();
    }

    setMessages([]);
    setInput("");
    setActiveProvider("");
    setSidebarOpen(false);
  }

  const hasConversation = messages.length > 0;

  return (
    <main className="app-shell">
      <aside
        className={`sidebar ${
          sidebarOpen ? "sidebar-visible" : ""
        }`}
      >
        <div className="brand">
          <div className="brand-symbol" aria-hidden="true">
            <span className="brand-core">U</span>
            <span className="brand-orbit orbit-one" />
            <span className="brand-orbit orbit-two" />
          </div>

          <div className="brand-copy">
            <strong>UNIVERSAL</strong>
            <span>ARTIFICIAL INTELLIGENCE</span>
          </div>

          <button
            className="sidebar-close"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer la navigation"
          >
            <X size={20} />
          </button>
        </div>

        <button
          className="new-chat-button"
          type="button"
          onClick={newConversation}
        >
          <Plus size={18} />
          <span>Nouvelle mission</span>
          <kbd>⌘ N</kbd>
        </button>

        <button className="sidebar-search" type="button">
          <Search size={17} />
          <span>Rechercher</span>
          <kbd>⌘ K</kbd>
        </button>

        <div className="navigation-scroll">
          {navigationGroups.map((group) => (
            <section
              className="navigation-group"
              key={group.label}
            >
              <div className="navigation-label">
                {group.label}
              </div>

              <nav>
                {group.items.map(
                  ({
                    label,
                    description,
                    icon: Icon,
                    badge,
                  }) => {
                    const isActive = activeNav === label;

                    return (
                      <button
                        key={label}
                        className={`navigation-item ${
                          isActive ? "navigation-item-active" : ""
                        }`}
                        type="button"
                        onClick={() => {
                          setActiveNav(label);
                          setSidebarOpen(false);
                        }}
                      >
                        <span className="navigation-icon">
                          <Icon size={17} />
                        </span>

                        <span className="navigation-copy">
                          <strong>{label}</strong>
                          <small>{description}</small>
                        </span>

                        {badge && (
                          <span className="navigation-badge">
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  },
                )}
              </nav>
            </section>
          ))}
        </div>

        <div className="sidebar-bottom">
          <button className="workspace-card" type="button">
            <span className="workspace-icon">
              <LayoutGrid size={18} />
            </span>

            <span>
              <strong>Workspace principal</strong>
              <small>1 membre · Plan Founder</small>
            </span>

            <ChevronDown size={15} />
          </button>

          <div className="account-panel">
            <div className="account-avatar">GS</div>

            <div className="account-copy">
              <strong>Gaëtan Shuami</strong>
              <span>Administrateur</span>
            </div>

            <button
              type="button"
              aria-label="Options du compte"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="mobile-overlay"
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fermer la navigation"
        />
      )}

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-button"
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Ouvrir la navigation"
            >
              <Menu size={20} />
            </button>

            <div className="breadcrumb">
              <span>Universal AI</span>
              <strong>{activeNav}</strong>
            </div>
          </div>

          <div className="topbar-center">
            <div className="system-status">
              <span className="status-dot" />
              Systèmes opérationnels
            </div>
          </div>

          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="Commandes rapides"
            >
              <Command size={18} />
            </button>

            <button
              className="icon-button"
              type="button"
              aria-label="Paramètres"
            >
              <Settings2 size={18} />
            </button>

            <label className="model-selector">
              <span className="model-emblem">
                <Atom size={17} />
              </span>

              <span className="model-copy">
                <small>Moteur</small>
                <strong>
                  {provider === "auto"
                    ? "Intelligence Auto"
                    : provider === "openai"
                      ? "OpenAI"
                      : provider === "anthropic"
                        ? "Claude"
                        : "Gemini"}
                </strong>
              </span>

              <select
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value as Provider)
                }
                disabled={isStreaming}
                aria-label="Sélectionner le moteur IA"
              >
                <option value="auto">Automatique</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Claude</option>
                <option value="gemini">Gemini</option>
              </select>

              <ChevronDown size={15} />
            </label>
          </div>
        </header>

        <div className="workspace-body">
          {!hasConversation ? (
            <section className="launch-screen">
              <div className="launch-glow launch-glow-one" />
              <div className="launch-glow launch-glow-two" />

              <div className="launch-content">
                <div className="intelligence-badge">
                  <span>
                    <Sparkles size={14} />
                  </span>
                  UNIVERSAL INTELLIGENCE SYSTEM
                </div>

                <div className="hero-symbol">
                  <div className="hero-symbol-core">
                    <Atom size={42} strokeWidth={1.4} />
                  </div>
                  <span className="hero-ring hero-ring-one" />
                  <span className="hero-ring hero-ring-two" />
                </div>

                <h1>
                  Que voulez-vous
                  <span> accomplir aujourd’hui ?</span>
                </h1>

                <p className="hero-description">
                  Une plateforme d’intelligence artificielle capable
                  de réfléchir, rechercher, créer, coder et coordonner
                  des agents spécialisés dans un seul environnement.
                </p>

                <div className="capability-row">
                  {capabilities.map((capability) => (
                    <span key={capability}>
                      <Zap size={12} />
                      {capability}
                    </span>
                  ))}
                </div>

                <div className="launch-grid">
                  {launchActions.map(
                    ({
                      title,
                      description,
                      icon: Icon,
                      prompt,
                      accent,
                    }) => (
                      <button
                        className={`launch-card launch-card-${accent}`}
                        key={title}
                        type="button"
                        onClick={() => applyPrompt(prompt)}
                      >
                        <span className="launch-card-icon">
                          <Icon size={21} />
                        </span>

                        <span className="launch-card-content">
                          <strong>{title}</strong>
                          <small>{description}</small>
                        </span>

                        <span className="launch-card-arrow">
                          <ArrowRight size={17} />
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section className="conversation-area">
              <div className="conversation-header">
                <div>
                  <span className="conversation-eyebrow">
                    MISSION ACTIVE
                  </span>
                  <h2>Nouvelle conversation</h2>
                </div>

                <div className="conversation-metadata">
                  <span>
                    <ShieldCheck size={14} />
                    Session sécurisée
                  </span>

                  {activeProvider && (
                    <span>
                      <Atom size={14} />
                      {activeProvider}
                    </span>
                  )}
                </div>
              </div>

              <div className="message-list">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`message-row message-${message.role}`}
                  >
                    <div className="message-identity">
                      {message.role === "user" ? (
                        <span className="user-avatar">GS</span>
                      ) : (
                        <span className="assistant-avatar">
                          <Atom size={18} />
                        </span>
                      )}
                    </div>

                    <div className="message-body">
                      <div className="message-header">
                        <strong>
                          {message.role === "user"
                            ? "Vous"
                            : "Universal AI"}
                        </strong>

                        <span>
                          {message.role === "assistant"
                            ? activeProvider || "Intelligence Auto"
                            : "À l’instant"}
                        </span>
                      </div>

                      <div className="message-text">
                        {message.content ||
                          (isStreaming
                            ? "Analyse et orchestration en cours…"
                            : "")}
                      </div>
                    </div>
                  </article>
                ))}

                <div ref={bottomRef} />
              </div>
            </section>
          )}
        </div>

        <footer className="composer-section">
          <form className="composer" onSubmit={sendMessage}>
            <div className="composer-main">
              <textarea
                value={input}
                onChange={(event) =>
                  setInput(event.target.value)
                }
                onKeyDown={handleKeyDown}
                placeholder="Décrivez un objectif, posez une question ou demandez à Universal AI de construire quelque chose…"
                rows={2}
                disabled={isStreaming}
              />

              <div className="composer-quick-actions">
                <button
                  type="button"
                  aria-label="Ajouter un fichier"
                  title="Ajouter un fichier"
                >
                  <Paperclip size={18} />
                </button>

                <button
                  type="button"
                  aria-label="Utiliser la voix"
                  title="Utiliser la voix"
                >
                  <Mic size={18} />
                </button>

                <button
                  type="button"
                  aria-label="Ajouter une image"
                  title="Ajouter une image"
                >
                  <Image size={18} />
                </button>

                <button
                  type="button"
                  aria-label="Ajouter une vidéo"
                  title="Ajouter une vidéo"
                >
                  <Video size={18} />
                </button>
              </div>
            </div>

            <div className="composer-footer">
              <div className="composer-modes">
                <button type="button">
                  <Globe2 size={15} />
                  Recherche
                </button>

                <button type="button">
                  <Code2 size={15} />
                  Code
                </button>

                <button type="button">
                  <Bot size={15} />
                  Agents
                </button>
              </div>

              <div className="composer-submit">
                <span>
                  <kbd>Entrée</kbd> envoyer
                </span>

                {isStreaming ? (
                  <button
                    className="stop-generation"
                    type="button"
                    onClick={stopGeneration}
                  >
                    <Square size={15} fill="currentColor" />
                    Arrêter
                  </button>
                ) : (
                  <button
                    className="send-message"
                    type="submit"
                    disabled={!input.trim()}
                  >
                    <Send size={17} />
                    Exécuter
                  </button>
                )}
              </div>
            </div>
          </form>

          <div className="security-note">
            <ShieldCheck size={12} />
            Réponses générées par intelligence artificielle.
            Vérifiez les décisions critiques.
          </div>
        </footer>
      </section>
    </main>
  );
}
