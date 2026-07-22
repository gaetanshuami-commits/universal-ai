"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

type AgentStatus =
  | "idle"
  | "connecting"
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

interface AgentStep {
  id: string;
  order: number;
  title: string;
  status: StepStatus;
  tool?: string;
  message?: string;
  output?: string;
  error?: string;
  durationMs?: number;
}

interface AgentLog {
  id: number;
  time: string;
  type: string;
  message: string;
}

interface StreamPayload {
  type?: string;
  timestamp?: string;
  stepId?: string;
  order?: number;
  title?: string;
  tool?: string;
  message?: string;
  error?: string;
  finalAnswer?: string;
  data?: unknown;
  plan?: {
    summary?: string;
    steps?: Array<{
      id?: string;
      order?: number;
      title?: string;
      tool?: string;
    }>;
  };
  run?: {
    finalAnswer?: string;
    steps?: Array<{
      stepId: string;
      order: number;
      title: string;
      tool?: string;
      status: StepStatus;
      output?: string;
      error?: string;
      durationMs?: number;
    }>;
  };
}

interface ParsedEvent {
  event: string;
  data: StreamPayload;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseSseBlock(
  block: string,
): ParsedEvent | null {
  const lines = block
    .replace(/\r\n/g, "\n")
    .split("\n");

  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line
        .slice("event:".length)
        .trim();
    }

    if (line.startsWith("data:")) {
      dataLines.push(
        line
          .slice("data:".length)
          .trimStart(),
      );
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const rawData = dataLines.join("\n");

  try {
    const parsed = JSON.parse(
      rawData,
    ) as unknown;

    return {
      event: eventName,
      data: isRecord(parsed)
        ? (parsed as StreamPayload)
        : {},
    };
  } catch {
    return {
      event: eventName,
      data: {
        message: rawData,
      },
    };
  }
}

function getMessage(
  eventName: string,
  data: StreamPayload,
): string {
  if (
    typeof data.message === "string" &&
    data.message.trim()
  ) {
    return data.message.trim();
  }

  switch (eventName) {
    case "connected":
      return "Connexion au Runtime établie.";

    case "agent.started":
      return "L’agent a démarré.";

    case "plan.created":
      return "Le plan d’exécution a été créé.";

    case "step.started":
      return `Étape démarrée : ${
        data.title ?? "sans titre"
      }`;

    case "step.completed":
      return `Étape terminée : ${
        data.title ?? "sans titre"
      }`;

    case "step.failed":
      return `Étape échouée : ${
        data.title ?? "sans titre"
      }`;

    case "step.skipped":
      return `Étape ignorée : ${
        data.title ?? "sans titre"
      }`;

    case "synthesis.started":
      return "Création de la synthèse finale.";

    case "synthesis.completed":
      return "Synthèse finale terminée.";

    case "agent.completed":
      return "Exécution terminée.";

    case "result":
      return "Résultat final reçu.";

    case "done":
      return "Flux temps réel terminé.";

    case "error":
      return (
        data.error ??
        "Une erreur est survenue."
      );

    default:
      return eventName;
  }
}

function getStatusLabel(
  status: StepStatus,
): string {
  switch (status) {
    case "running":
      return "En cours";

    case "completed":
      return "Terminée";

    case "failed":
      return "Échec";

    case "skipped":
      return "Ignorée";

    default:
      return "En attente";
  }
}

function getStatusClasses(
  status: StepStatus,
): string {
  switch (status) {
    case "running":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";

    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";

    case "failed":
      return "border-red-200 bg-red-50 text-red-700";

    case "skipped":
      return "border-amber-200 bg-amber-50 text-amber-700";

    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

export default function AgentPage() {
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");

  const [status, setStatus] =
    useState<AgentStatus>("idle");

  const [steps, setSteps] =
    useState<AgentStep[]>([]);

  const [logs, setLogs] =
    useState<AgentLog[]>([]);

  const [planSummary, setPlanSummary] =
    useState("");

  const [finalAnswer, setFinalAnswer] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [maxSteps, setMaxSteps] =
    useState(6);

  const [maxParallelSteps, setMaxParallelSteps] =
    useState(3);

  const abortControllerRef =
    useRef<AbortController | null>(null);

  const logIdRef = useRef(0);

  const isRunning =
    status === "connecting" ||
    status === "running";

  const completedSteps = useMemo(
    () =>
      steps.filter(
        (step) =>
          step.status === "completed",
      ).length,
    [steps],
  );

  const finishedSteps = useMemo(
    () =>
      steps.filter(
        (step) =>
          step.status === "completed" ||
          step.status === "failed" ||
          step.status === "skipped",
      ).length,
    [steps],
  );

  const progress =
    steps.length > 0
      ? Math.round(
          (finishedSteps / steps.length) *
            100,
        )
      : 0;

  const addLog = useCallback(
    (
      type: string,
      message: string,
      timestamp?: string,
    ) => {
      logIdRef.current += 1;

      setLogs((current) => [
        ...current.slice(-99),
        {
          id: logIdRef.current,
          type,
          message,
          time:
            timestamp ??
            new Date().toISOString(),
        },
      ]);
    },
    [],
  );

  const updateStep = useCallback(
    (
      stepId: string,
      update: Partial<AgentStep>,
    ) => {
      setSteps((current) => {
        const existing = current.find(
          (step) => step.id === stepId,
        );

        if (!existing) {
          const created: AgentStep = {
            id: stepId,
            order:
              update.order ??
              current.length + 1,
            title:
              update.title ??
              "Étape sans titre",
            status:
              update.status ??
              "pending",
            tool: update.tool,
            message: update.message,
            output: update.output,
            error: update.error,
            durationMs:
              update.durationMs,
          };

          return [...current, created].sort(
            (left, right) =>
              left.order - right.order,
          );
        }

        return current
          .map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  ...update,
                }
              : step,
          )
          .sort(
            (left, right) =>
              left.order - right.order,
          );
      });
    },
    [],
  );

  const processEvent = useCallback(
    (
      eventName: string,
      data: StreamPayload,
    ) => {
      addLog(
        eventName,
        getMessage(eventName, data),
        data.timestamp,
      );

      if (
        eventName === "connected" ||
        eventName === "agent.started"
      ) {
        setStatus("running");
        return;
      }

      if (eventName === "plan.created") {
        const nestedData = isRecord(
          data.data,
        )
          ? data.data
          : null;

        const nestedPlan =
          nestedData &&
          isRecord(nestedData.plan)
            ? nestedData.plan
            : null;

        const plan =
          nestedPlan ?? data.plan;

        if (plan && isRecord(plan)) {
          if (
            typeof plan.summary ===
            "string"
          ) {
            setPlanSummary(
              plan.summary,
            );
          }

          if (
            Array.isArray(plan.steps)
          ) {
            const planSteps =
              plan.steps as Array<{
                id?: string;
                order?: number;
                title?: string;
                tool?: string;
              }>;

            setSteps(
              planSteps.map(
                (step, index) => ({
                  id:
                    step.id ??
                    `step-${index + 1}`,
                  order:
                    step.order ??
                    index + 1,
                  title:
                    step.title ??
                    `Étape ${index + 1}`,
                  status:
                    "pending" as const,
                  tool: step.tool,
                }),
              ),
            );
          }
        }

        return;
      }

      if (
        eventName === "step.started" ||
        eventName === "step.completed" ||
        eventName === "step.failed" ||
        eventName === "step.skipped"
      ) {
        const stepId =
          data.stepId ??
          `step-${data.order ?? Date.now()}`;

        let stepStatus: StepStatus =
          "pending";

        if (
          eventName === "step.started"
        ) {
          stepStatus = "running";
        }

        if (
          eventName === "step.completed"
        ) {
          stepStatus = "completed";
        }

        if (
          eventName === "step.failed"
        ) {
          stepStatus = "failed";
        }

        if (
          eventName === "step.skipped"
        ) {
          stepStatus = "skipped";
        }

        const execution = isRecord(
          data.data,
        )
          ? data.data
          : null;

        updateStep(stepId, {
          order: data.order,
          title: data.title,
          tool: data.tool,
          status: stepStatus,
          message: data.message,
          output:
            execution &&
            typeof execution.output ===
              "string"
              ? execution.output
              : undefined,
          error:
            execution &&
            typeof execution.error ===
              "string"
              ? execution.error
              : data.error,
          durationMs:
            execution &&
            typeof execution.durationMs ===
              "number"
              ? execution.durationMs
              : undefined,
        });

        return;
      }

      if (
        eventName ===
        "synthesis.completed"
      ) {
        const nestedData = isRecord(
          data.data,
        )
          ? data.data
          : null;

        const answer =
          nestedData &&
          typeof nestedData.finalAnswer ===
            "string"
            ? nestedData.finalAnswer
            : data.finalAnswer;

        if (
          typeof answer === "string"
        ) {
          setFinalAnswer(answer);
        }

        return;
      }

      if (eventName === "result") {
        if (
          data.run?.finalAnswer
        ) {
          setFinalAnswer(
            data.run.finalAnswer,
          );
        }

        if (
          Array.isArray(
            data.run?.steps,
          )
        ) {
          setSteps(
            data.run.steps.map(
              (step) => ({
                id: step.stepId,
                order: step.order,
                title: step.title,
                status: step.status,
                tool: step.tool,
                output: step.output,
                error: step.error,
                durationMs:
                  step.durationMs,
              }),
            ),
          );
        }

        return;
      }

      if (
        eventName ===
          "agent.completed" ||
        eventName === "done"
      ) {
        setStatus("completed");
        return;
      }

      if (eventName === "error") {
        setStatus("failed");

        setErrorMessage(
          data.error ??
            data.message ??
            "Une erreur est survenue.",
        );
      }
    },
    [addLog, updateStep],
  );

  const startAgent = useCallback(
    async () => {
      const normalizedGoal =
        goal.trim();

      if (
        normalizedGoal.length < 3
      ) {
        setErrorMessage(
          "Décris un objectif plus précis.",
        );

        return;
      }

      abortControllerRef.current?.abort();

      const controller =
        new AbortController();

      abortControllerRef.current =
        controller;

      setStatus("connecting");
      setSteps([]);
      setLogs([]);
      setPlanSummary("");
      setFinalAnswer("");
      setErrorMessage("");
      logIdRef.current = 0;

      try {
        const response = await fetch(
          "/api/universal/agent/stream",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "text/event-stream",
            },
            body: JSON.stringify({
              goal: normalizedGoal,
              context:
                context.trim() ||
                undefined,
              maxSteps,
              maxParallelSteps,
              maxRetriesPerStep: 1,
              stepTimeoutMs: 45000,
              stopOnError: false,
            }),
            signal:
              controller.signal,
          },
        );

        if (!response.ok) {
          const body = (await response
            .json()
            .catch(() => null)) as
            | {
                error?: string;
              }
            | null;

          throw new Error(
            body?.error ??
              `Erreur HTTP ${response.status}`,
          );
        }

        if (!response.body) {
          throw new Error(
            "Aucun flux reçu.",
          );
        }

        const reader =
          response.body.getReader();

        const decoder =
          new TextDecoder();

        let buffer = "";

        while (true) {
          const {
            done,
            value,
          } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(
            value,
            {
              stream: true,
            },
          );

          buffer = buffer.replace(
            /\r\n/g,
            "\n",
          );

          let separator =
            buffer.indexOf("\n\n");

          while (separator >= 0) {
            const block = buffer.slice(
              0,
              separator,
            );

            buffer = buffer.slice(
              separator + 2,
            );

            const parsed =
              parseSseBlock(block);

            if (parsed) {
              processEvent(
                parsed.event,
                parsed.data,
              );
            }

            separator =
              buffer.indexOf("\n\n");
          }
        }

        const lastBlock =
          buffer.trim();

        if (lastBlock) {
          const parsed =
            parseSseBlock(lastBlock);

          if (parsed) {
            processEvent(
              parsed.event,
              parsed.data,
            );
          }
        }

        if (
          !controller.signal.aborted
        ) {
          setStatus("completed");
        }
      } catch (error) {
        if (
          controller.signal.aborted
        ) {
          setStatus("cancelled");

          addLog(
            "cancelled",
            "Exécution annulée.",
          );
        } else {
          const message =
            error instanceof Error
              ? error.message
              : "Erreur inconnue.";

          setStatus("failed");
          setErrorMessage(message);

          addLog(
            "error",
            message,
          );
        }
      } finally {
        if (
          abortControllerRef.current ===
          controller
        ) {
          abortControllerRef.current =
            null;
        }
      }
    },
    [
      addLog,
      context,
      goal,
      maxParallelSteps,
      maxSteps,
      processEvent,
    ],
  );

  const cancelAgent =
    useCallback(() => {
      abortControllerRef.current?.abort();
    }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Universal AI
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
            Agent autonome en temps réel
          </h1>

          <p className="mt-4 max-w-3xl leading-7 text-slate-600">
            Lance une mission et suis le plan,
            les étapes, les erreurs et le résultat
            final directement depuis le flux SSE.
          </p>
        </header>

        <div className="mt-7 grid gap-7 xl:grid-cols-[400px_minmax(0,1fr)]">
          <section className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              Nouvelle mission
            </h2>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium">
                Objectif
              </span>

              <textarea
                value={goal}
                onChange={(event) =>
                  setGoal(
                    event.target.value,
                  )
                }
                disabled={isRunning}
                rows={7}
                placeholder="Exemple : analyse les tendances IA et prépare une synthèse..."
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />
            </label>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-medium">
                Contexte
              </span>

              <textarea
                value={context}
                onChange={(event) =>
                  setContext(
                    event.target.value,
                  )
                }
                disabled={isRunning}
                rows={4}
                placeholder="Langue, contraintes et format attendu..."
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />
            </label>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <label>
                <span className="mb-2 block text-sm font-medium">
                  Étapes
                </span>

                <input
                  type="number"
                  min={1}
                  max={12}
                  value={maxSteps}
                  disabled={isRunning}
                  onChange={(event) =>
                    setMaxSteps(
                      Math.max(
                        1,
                        Math.min(
                          12,
                          Number(
                            event.target.value,
                          ) || 1,
                        ),
                      ),
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-medium">
                  Parallèles
                </span>

                <input
                  type="number"
                  min={1}
                  max={8}
                  value={
                    maxParallelSteps
                  }
                  disabled={isRunning}
                  onChange={(event) =>
                    setMaxParallelSteps(
                      Math.max(
                        1,
                        Math.min(
                          8,
                          Number(
                            event.target.value,
                          ) || 1,
                        ),
                      ),
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
                />
              </label>
            </div>

            {errorMessage && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="mt-6">
              {!isRunning ? (
                <button
                  type="button"
                  onClick={() => {
                    void startAgent();
                  }}
                  className="w-full rounded-2xl bg-slate-950 px-5 py-3.5 font-semibold text-white transition hover:bg-indigo-700"
                >
                  Lancer l’agent
                </button>
              ) : (
                <button
                  type="button"
                  onClick={cancelAgent}
                  className="w-full rounded-2xl border border-red-200 bg-red-50 px-5 py-3.5 font-semibold text-red-700"
                >
                  Annuler
                </button>
              )}
            </div>
          </section>

          <div className="space-y-7">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    Progression
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    État : {status}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold">
                  {progress} %
                </div>
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                  style={{
                    width: `${progress}%`,
                  }}
                />
              </div>

              <p className="mt-3 text-sm text-slate-500">
                {completedSteps} étape(s)
                terminée(s) sur {steps.length}
              </p>

              {planSummary && (
                <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                  <p className="text-sm font-semibold text-indigo-700">
                    Plan
                  </p>

                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {planSummary}
                  </p>
                </div>
              )}

              <div className="mt-6 space-y-4">
                {steps.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
                    Les étapes apparaîtront ici.
                  </div>
                ) : (
                  steps.map((step) => (
                    <article
                      key={step.id}
                      className="rounded-2xl border border-slate-200 p-5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 font-semibold text-white">
                          {step.order}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="font-semibold">
                              {step.title}
                            </h3>

                            <span
                              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${getStatusClasses(
                                step.status,
                              )}`}
                            >
                              {getStatusLabel(
                                step.status,
                              )}
                            </span>
                          </div>

                          {step.tool && (
                            <p className="mt-2 text-xs font-medium text-indigo-600">
                              Outil : {step.tool}
                            </p>
                          )}

                          {step.message && (
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              {step.message}
                            </p>
                          )}

                          {step.output && (
                            <div className="mt-4 whitespace-pre-wrap rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-slate-700">
                              {step.output}
                            </div>
                          )}

                          {step.error && (
                            <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                              {step.error}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">
                Résultat final
              </h2>

              {finalAnswer ? (
                <div className="mt-5 whitespace-pre-wrap rounded-2xl bg-slate-50 p-5 text-sm leading-7 text-slate-700">
                  {finalAnswer}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
                  Le résultat final apparaîtra ici.
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">
                Journal temps réel
              </h2>

              <div className="mt-5 max-h-96 space-y-3 overflow-y-auto rounded-2xl bg-slate-950 p-4">
                {logs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    Aucun événement reçu.
                  </p>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="grid gap-2 border-b border-white/10 pb-3 text-xs last:border-0 sm:grid-cols-[85px_150px_1fr]"
                    >
                      <span className="text-slate-500">
                        {new Date(
                          log.time,
                        ).toLocaleTimeString(
                          "fr-FR",
                        )}
                      </span>

                      <span className="font-medium text-indigo-300">
                        {log.type}
                      </span>

                      <span className="leading-5 text-slate-300">
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
