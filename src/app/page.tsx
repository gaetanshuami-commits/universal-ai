"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bot,
  BrainCircuit,
  Building2,
  Camera,
  ChevronDown,
  Code2,
  Gamepad2,
  ImageIcon,
  Menu,
  Mic,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Video,
  WandSparkles,
  X,
} from "lucide-react";

type Provider = "auto" | "openai" | "anthropic" | "gemini";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const modules = [
  { label: "Assistant universel", icon: Bot },
  { label: "AI Code", icon: Code2 },
  { label: "Créer cette entreprise", icon: Building2 },
  { label: "AI Company", icon: BrainCircuit },
  { label: "AI Gamer", icon: Gamepad2 },
  { label: "AI Streamer", icon: Video },
  { label: "AI Creator", icon: ImageIcon },
  { label: "AI Camera", icon: Camera },
  { label: "AI Impossible", icon: WandSparkles },
];

const initialMessages: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Bonjour. Je suis Universal AI. Décris ton objectif : je peux réfléchir, créer, coder et coordonner plusieurs intelligences artificielles.",
  },
];

export default function Home() {
  const [messages, setMessages] =
    useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<Provider>("auto");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

      if (errorMessage !== "The user aborted a request.") {
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

    setMessages(initialMessages);
    setActiveProvider("");
    setSidebarOpen(false);
  }

  return (
    <main className="platform-shell">
      <aside
        className={`platform-sidebar ${
          sidebarOpen ? "sidebar-open" : ""
        }`}
      >
        <div className="sidebar-header">
          <div className="brand-mark">
            <Sparkles size={20} />
          </div>

          <div>
            <strong>Universal AI</strong>
            <span>Intelligence Operating System</span>
          </div>

          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer le menu"
          >
            <X size={20} />
          </button>
        </div>

        <button
          className="new-conversation"
          onClick={newConversation}
        >
          <Plus size={18} />
          Nouvelle conversation
        </button>

        <nav className="module-navigation">
          {modules.map(({ label, icon: Icon }, index) => (
            <button
              key={label}
              className={index === 0 ? "active" : ""}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="account-avatar">GS</div>
          <div>
            <strong>Gaëtan Shuami</strong>
            <span>Fondateur</span>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fermer le menu"
        />
      )}

      <section className="platform-workspace">
        <header className="workspace-header">
          <button
            className="mobile-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu size={21} />
          </button>

          <div className="workspace-title">
            <strong>Assistant universel</strong>
            <span>
              {activeProvider
                ? `Propulsé par ${activeProvider}`
                : "Multi-modèles · mémoire longue · agents"}
            </span>
          </div>

          <label className="provider-selector">
            <select
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as Provider)
              }
              disabled={isStreaming}
              aria-label="Choisir le moteur IA"
            >
              <option value="auto">Automatique</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Claude</option>
              <option value="gemini">Gemini</option>
            </select>
            <ChevronDown size={15} />
          </label>
        </header>

        <div className="conversation-scroll">
          <div className="conversation">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`chat-message ${message.role}`}
              >
                <div className="message-avatar">
                  {message.role === "user" ? "GS" : <Sparkles size={18} />}
                </div>

                <div className="message-content">
                  <span className="message-author">
                    {message.role === "user"
                      ? "Vous"
                      : "Universal AI"}
                  </span>

                  <p>
                    {message.content ||
                      (isStreaming ? "Réflexion en cours…" : "")}
                  </p>
                </div>
              </article>
            ))}

            <div ref={bottomRef} />
          </div>
        </div>

        <div className="composer-area">
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Demandez quelque chose ou écrivez : "Je veux créer cette entreprise…"'
              rows={3}
              disabled={isStreaming}
            />

            <div className="composer-toolbar">
              <div className="composer-tools">
                <button type="button" title="Ajouter un fichier">
                  <Paperclip size={18} />
                </button>
                <button type="button" title="Utiliser la voix">
                  <Mic size={18} />
                </button>
                <span>
                  Fichiers · Web · Code · Images · Voix · Agents
                </span>
              </div>

              {isStreaming ? (
                <button
                  type="button"
                  className="stop-button"
                  onClick={stopGeneration}
                >
                  <span />
                  Arrêter
                </button>
              ) : (
                <button
                  type="submit"
                  className="send-button"
                  disabled={!input.trim()}
                >
                  <Send size={18} />
                  Envoyer
                </button>
              )}
            </div>
          </form>

          <p className="composer-disclaimer">
            Universal AI peut faire des erreurs. Vérifiez les
            informations importantes et les modifications de code.
          </p>
        </div>
      </section>
    </main>
  );
}
