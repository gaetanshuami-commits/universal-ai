"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Bell,
  Bot,
  Boxes,
  BrainCircuit,
  BriefcaseBusiness,
  Camera,
  ChevronDown,
  Code2,
  FileSearch,
  Globe2,
  Grid2X2,
  ImageIcon,
  Infinity,
  Menu,
  Mic,
  Paperclip,
  Plus,
  Rocket,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
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

const intelligenceItems = [
  {
    label: "Assistant universel",
    icon: BrainCircuit,
  },
  {
    label: "Recherche approfondie",
    icon: Search,
  },
  {
    label: "AI Code",
    icon: Code2,
  },
  {
    label: "Analyse de fichiers",
    icon: FileSearch,
  },
  {
    label: "Agents autonomes",
    icon: Bot,
  },
  {
    label: "Mémoire longue",
    icon: Boxes,
  },
];

const creationItems = [
  {
    label: "Créer une entreprise",
    icon: BriefcaseBusiness,
    badge: "Nouveau",
  },
  {
    label: "AI Company",
    icon: Boxes,
  },
  {
    label: "AI Creator",
    icon: Sparkles,
  },
  {
    label: "Média Studio",
    icon: Video,
  },
  {
    label: "Design & Branding",
    icon: WandSparkles,
  },
];

const experienceItems = [
  {
    label: "AI Gamer",
    icon: Activity,
  },
  {
    label: "AI Streamer",
    icon: Zap,
  },
  {
    label: "AI Camera",
    icon: Camera,
  },
  {
    label: "AI Impossible",
    icon: Infinity,
  },
];

const capabilityItems = [
  "Raisonnement avancé",
  "Recherche web",
  "Création de code",
  "Analyse de fichiers",
  "Images & vidéo",
  "Agents autonomes",
];

const actionCards = [
  {
    title: "Créer une entreprise",
    description:
      "Transformez une idée en marque, business plan, plateforme et stratégie de lancement.",
    icon: BriefcaseBusiness,
    color: "violet",
    prompt:
      "Je veux créer cette entreprise. Construis le projet complet, de l'idée jusqu'au lancement.",
  },
  {
    title: "Construire un produit",
    description:
      "Architecture, code, base de données, tests, sécurité et déploiement professionnel.",
    icon: Rocket,
    color: "blue",
    prompt:
      "Je veux construire un produit numérique complet. Commence par concevoir son architecture.",
  },
  {
    title: "Lancer une recherche",
    description:
      "Analysez le web, vos fichiers et plusieurs sources avec une synthèse vérifiable.",
    icon: Globe2,
    color: "green",
    prompt:
      "Lance une recherche approfondie, structurée et vérifiable sur le sujet suivant :",
  },
  {
    title: "Créer un contenu",
    description:
      "Campagne, vidéo, identité visuelle, présentation ou stratégie éditoriale.",
    icon: Sparkles,
    color: "orange",
    prompt:
      "Crée une stratégie de contenu premium et complète pour mon projet.",
  },
];

const recentActivities = [
  {
    title: "Analyse de marché IA",
    time: "Il y a 2 min",
  },
  {
    title: "Architecture SaaS",
    time: "Il y a 15 min",
  },
  {
    title: "Recherche concurrentielle",
    time: "Il y a 42 min",
  },
  {
    title: "Stratégie de contenu",
    time: "Il y a 1 h",
  },
];

const initialMessages: Message[] = [];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<Provider>("auto");
  const [activeSection, setActiveSection] =
    useState("Assistant universel");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeProvider, setActiveProvider] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const hasConversation = messages.length > 0;

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
        throw new Error("Aucun flux n'a été retourné.");
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
      const message =
        error instanceof Error
          ? error.message
          : "Une erreur inattendue est survenue.";

      if (
        message !== "This operation was aborted" &&
        message !== "The user aborted a request."
      ) {
        setMessages((currentMessages) =>
          currentMessages.map((currentMessage) =>
            currentMessage.id === assistantId
              ? {
                  ...currentMessage,
                  content: `Erreur : ${message}`,
                }
              : currentMessage,
          ),
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function stopGeneration() {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }

  function newMission() {
    abortControllerRef.current?.abort();
    setMessages([]);
    setInput("");
    setActiveProvider("");
    setIsStreaming(false);
  }

  return (
    <main className="universal-shell">
      <aside
        className={`main-sidebar ${
          sidebarOpen ? "main-sidebar-open" : ""
        }`}
      >
        <div className="brand-area">
          <div className="universal-logo">
            <div className="logo-glow" />
            <div className="logo-sphere logo-sphere-one" />
            <div className="logo-sphere logo-sphere-two" />
            <div className="logo-sphere logo-sphere-three" />
          </div>

          <div className="brand-text">
            <strong>UNIVERSAL AI</strong>
            <span>COMMAND CENTER</span>
          </div>

          <button
            className="sidebar-close-button"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer la navigation"
          >
            <X size={20} />
          </button>
        </div>

        <button
          className="new-mission-button"
          type="button"
          onClick={newMission}
        >
          <Plus size={18} />
          <span>Nouvelle mission</span>
          <kbd>⌘ N</kbd>
        </button>

        <div className="sidebar-search">
          <Search size={17} />
          <input
            type="search"
            placeholder="Rechercher..."
            aria-label="Rechercher"
          />
          <kbd>⌘ K</kbd>
        </div>

        <div className="sidebar-navigation">
          <NavigationGroup
            title="Intelligence"
            items={intelligenceItems}
            activeSection={activeSection}
            onSelect={setActiveSection}
          />

          <NavigationGroup
            title="Création"
            items={creationItems}
            activeSection={activeSection}
            onSelect={setActiveSection}
          />

          <NavigationGroup
            title="Expériences"
            items={experienceItems}
            activeSection={activeSection}
            onSelect={setActiveSection}
          />
        </div>

        <div className="sidebar-bottom">
          <button className="workspace-selector" type="button">
            <span className="workspace-icon">
              <Grid2X2 size={17} />
            </span>

            <span className="workspace-copy">
              <strong>Workspace principal</strong>
              <small>Plan Founder</small>
            </span>

            <ChevronDown size={15} />
          </button>

          <div className="account-row">
            <div className="user-avatar">GS</div>

            <div className="account-copy">
              <strong>Gaëtan Shuami</strong>
              <span>Administrateur</span>
            </div>

            <span className="pro-badge">PRO</span>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="mobile-backdrop"
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <section className="main-workspace">
        <header className="workspace-topbar">
          <div className="topbar-title">
            <button
              className="mobile-menu-button"
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Ouvrir la navigation"
            >
              <Menu size={20} />
            </button>

            <strong>{activeSection}</strong>

            <span className="operational-status">
              <span />
              Systèmes opérationnels
            </span>
          </div>

          <div className="topbar-actions">
            <button
              className="topbar-icon-button"
              type="button"
              aria-label="Applications"
            >
              <Grid2X2 size={18} />
            </button>

            <button
              className="topbar-icon-button"
              type="button"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </button>

            <button
              className="topbar-icon-button"
              type="button"
              aria-label="Paramètres"
            >
              <Settings2 size={18} />
            </button>

            <label className="model-control">
              <span className="model-control-icon">
                <BrainCircuit size={18} />
              </span>

              <span className="model-control-copy">
                <small>Moteur actif</small>
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
                aria-label="Choisir le moteur IA"
              >
                <option value="auto">Intelligence Auto</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Claude</option>
                <option value="gemini">Gemini</option>
              </select>

              <ChevronDown size={15} />
            </label>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="main-content">
            <div className="main-scroll">
              {!hasConversation ? (
                <section className="welcome-screen">
                  <div className="welcome-ambient welcome-ambient-one" />
                  <div className="welcome-ambient welcome-ambient-two" />

                  <div className="welcome-content">
                    <h1>
                      Que voulez-vous accomplir
                      <span> aujourd’hui ?</span>
                    </h1>

                    <p>
                      Universal AI est une intelligence artificielle
                      capable de réfléchir, rechercher, créer, coder et
                      coordonner des agents spécialisés dans un seul
                      environnement.
                    </p>

                    <div className="capabilities">
                      {capabilityItems.map((item) => (
                        <span key={item}>
                          <Zap size={12} />
                          {item}
                        </span>
                      ))}
                    </div>

                    <div className="action-card-grid">
                      {actionCards.map(
                        ({
                          title,
                          description,
                          icon: Icon,
                          color,
                          prompt,
                        }) => (
                          <button
                            key={title}
                            type="button"
                            className={`action-card action-card-${color}`}
                            onClick={() => applyPrompt(prompt)}
                          >
                            <span className="action-card-icon">
                              <Icon size={23} />
                            </span>

                            <strong>{title}</strong>
                            <p>{description}</p>

                            <span className="action-arrow">→</span>
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </section>
              ) : (
                <section className="conversation-view">
                  <div className="conversation-title-row">
                    <div>
                      <span>Mission active</span>
                      <h2>Nouvelle conversation</h2>
                    </div>

                    <span className="secure-session">
                      <ShieldCheck size={14} />
                      Session sécurisée
                    </span>
                  </div>

                  <div className="messages-list">
                    {messages.map((message) => (
                      <article
                        key={message.id}
                        className={`message-item message-item-${message.role}`}
                      >
                        <div
                          className={`message-avatar ${
                            message.role === "assistant"
                              ? "assistant-message-avatar"
                              : ""
                          }`}
                        >
                          {message.role === "assistant" ? (
                            <BrainCircuit size={19} />
                          ) : (
                            "GS"
                          )}
                        </div>

                        <div className="message-content">
                          <div className="message-meta">
                            <strong>
                              {message.role === "assistant"
                                ? "Universal AI"
                                : "Vous"}
                            </strong>

                            <span>
                              {message.role === "assistant"
                                ? activeProvider ||
                                  "Intelligence Auto"
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

            <footer className="composer-wrapper">
              <form
                className="main-composer"
                onSubmit={sendMessage}
              >
                <textarea
                  value={input}
                  onChange={(event) =>
                    setInput(event.target.value)
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="Décrivez un objectif, posez une question ou demandez à Universal AI de construire quelque chose..."
                  rows={3}
                  disabled={isStreaming}
                />

                <div className="composer-bottom-row">
                  <div className="attachment-tools">
                    <button
                      type="button"
                      aria-label="Ajouter un fichier"
                    >
                      <Paperclip size={18} />
                    </button>

                    <button
                      type="button"
                      aria-label="Recherche web"
                    >
                      <Globe2 size={18} />
                    </button>

                    <button
                      type="button"
                      aria-label="Mode code"
                    >
                      <Code2 size={18} />
                    </button>

                    <button
                      type="button"
                      aria-label="Ajouter une image"
                    >
                      <ImageIcon size={18} />
                    </button>

                    <button
                      type="button"
                      aria-label="Utiliser la voix"
                    >
                      <Mic size={18} />
                    </button>
                  </div>

                  <div className="send-area">
                    <span>Entrée pour envoyer</span>

                    {isStreaming ? (
                      <button
                        className="stop-button"
                        type="button"
                        onClick={stopGeneration}
                      >
                        <Square
                          size={15}
                          fill="currentColor"
                        />
                        Arrêter
                      </button>
                    ) : (
                      <button
                        className="execute-button"
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

              <p className="ai-warning">
                <ShieldCheck size={12} />
                Universal AI peut faire des erreurs. Vérifiez les
                informations importantes.
              </p>
            </footer>
          </section>

          <aside className="intelligence-panel">
            <section className="side-panel-card active-engine-card">
              <div className="side-panel-heading">
                <span>Moteur actif</span>
                <button type="button">+</button>
              </div>

              <div className="neural-visual">
                <span className="neural-core" />
                <span className="neural-ring neural-ring-one" />
                <span className="neural-ring neural-ring-two" />
                <span className="neural-ring neural-ring-three" />
              </div>

              <h3>Intelligence Auto</h3>

              <p>
                Sélectionne automatiquement le meilleur modèle pour
                chaque mission.
              </p>

              <div className="model-badges">
                <span>
                  <i className="dot-blue" />
                  OpenAI
                  <small>Prioritaire</small>
                </span>

                <span>
                  <i className="dot-orange" />
                  Claude
                  <small>Analytique</small>
                </span>

                <span>
                  <i className="dot-green" />
                  Gemini
                  <small>Rapide</small>
                </span>
              </div>
            </section>

            <section className="side-panel-card">
              <div className="side-panel-heading">
                <span>Statut systèmes</span>
                <button type="button">+</button>
              </div>

              <div className="system-list">
                <SystemStatus
                  label="Réseau neural"
                  value="Opérationnel"
                />

                <SystemStatus
                  label="Base de connaissances"
                  value="Synchronisée"
                />

                <SystemStatus
                  label="Agents spécialisés"
                  value="12/12 actifs"
                />

                <SystemStatus
                  label="Sécurité & confidentialité"
                  value="Renforcée"
                />
              </div>
            </section>

            <section className="side-panel-card recent-card">
              <div className="side-panel-heading">
                <span>Activité récente</span>
                <button type="button">Tout voir</button>
              </div>

              <div className="recent-list">
                {recentActivities.map((activity) => (
                  <button
                    key={activity.title}
                    type="button"
                  >
                    <span className="recent-icon">
                      <Activity size={13} />
                    </span>

                    <span className="recent-copy">
                      <strong>{activity.title}</strong>
                      <small>{activity.time}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

interface NavigationGroupProps {
  title: string;
  items: Array<{
    label: string;
    icon: typeof Activity;
    badge?: string;
  }>;
  activeSection: string;
  onSelect: (label: string) => void;
}

function NavigationGroup({
  title,
  items,
  activeSection,
  onSelect,
}: NavigationGroupProps) {
  return (
    <section className="navigation-group">
      <span className="navigation-group-title">{title}</span>

      <nav>
        {items.map(({ label, icon: Icon, badge }) => (
          <button
            key={label}
            type="button"
            className={
              activeSection === label
                ? "navigation-link navigation-link-active"
                : "navigation-link"
            }
            onClick={() => onSelect(label)}
          >
            <Icon size={16} />

            <span>{label}</span>

            {badge && (
              <small className="navigation-new-badge">
                {badge}
              </small>
            )}
          </button>
        ))}
      </nav>
    </section>
  );
}

function SystemStatus({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="system-status-row">
      <span className="system-status-label">
        <i />
        {label}
      </span>

      <strong>{value}</strong>
    </div>
  );
}
