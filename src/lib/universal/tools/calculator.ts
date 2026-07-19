import { UniversalError } from "../core";

import type {
  UniversalTool,
  UniversalToolDetection,
  UniversalToolDetectionContext,
} from "./types";

interface CalculatorInput {
  readonly expression: string;
}

const CALCULATION_KEYWORDS = [
  "calcule",
  "calculer",
  "calculation",
  "calculate",
  "combien font",
  "combien fait",
  "résous",
  "resous",
  "evaluate",
  "évalue",
  "evalue",
] as const;

const MAX_EXPRESSION_LENGTH = 200;

class ArithmeticParser {
  private position = 0;

  public constructor(
    private readonly source: string,
  ) {}

  public parse(): number {
    const result = this.parseExpression();

    this.skipWhitespace();

    if (this.position !== this.source.length) {
      throw new Error(
        `Caractère inattendu à la position ${this.position + 1}.`,
      );
    }

    if (!Number.isFinite(result)) {
      throw new Error(
        "Le résultat du calcul n'est pas un nombre fini.",
      );
    }

    return result;
  }

  private parseExpression(): number {
    let value = this.parseTerm();

    while (true) {
      this.skipWhitespace();

      if (this.consume("+")) {
        value += this.parseTerm();
        continue;
      }

      if (this.consume("-")) {
        value -= this.parseTerm();
        continue;
      }

      return value;
    }
  }

  private parseTerm(): number {
    let value = this.parsePower();

    while (true) {
      this.skipWhitespace();

      if (this.consume("*")) {
        value *= this.parsePower();
        continue;
      }

      if (this.consume("/")) {
        const divisor = this.parsePower();

        if (divisor === 0) {
          throw new Error(
            "La division par zéro est impossible.",
          );
        }

        value /= divisor;
        continue;
      }

      if (this.consume("%")) {
        const divisor = this.parsePower();

        if (divisor === 0) {
          throw new Error(
            "Le modulo par zéro est impossible.",
          );
        }

        value %= divisor;
        continue;
      }

      return value;
    }
  }

  private parsePower(): number {
    const base = this.parseUnary();

    this.skipWhitespace();

    if (this.consume("^")) {
      const exponent = this.parsePower();
      return Math.pow(base, exponent);
    }

    return base;
  }

  private parseUnary(): number {
    this.skipWhitespace();

    if (this.consume("+")) {
      return this.parseUnary();
    }

    if (this.consume("-")) {
      return -this.parseUnary();
    }

    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWhitespace();

    if (this.consume("(")) {
      const value = this.parseExpression();

      this.skipWhitespace();

      if (!this.consume(")")) {
        throw new Error(
          "Une parenthèse fermante est manquante.",
        );
      }

      return value;
    }

    return this.parseNumber();
  }

  private parseNumber(): number {
    this.skipWhitespace();

    const start = this.position;
    let decimalSeparatorFound = false;

    while (this.position < this.source.length) {
      const character =
        this.source[this.position];

      if (
        character >= "0" &&
        character <= "9"
      ) {
        this.position += 1;
        continue;
      }

      if (
        character === "." &&
        !decimalSeparatorFound
      ) {
        decimalSeparatorFound = true;
        this.position += 1;
        continue;
      }

      break;
    }

    const raw =
      this.source.slice(start, this.position);

    if (
      !raw ||
      raw === "."
    ) {
      throw new Error(
        `Nombre attendu à la position ${start + 1}.`,
      );
    }

    const value = Number(raw);

    if (!Number.isFinite(value)) {
      throw new Error(
        `Nombre invalide : ${raw}.`,
      );
    }

    return value;
  }

  private consume(
    expected: string,
  ): boolean {
    if (
      this.source.startsWith(
        expected,
        this.position,
      )
    ) {
      this.position += expected.length;
      return true;
    }

    return false;
  }

  private skipWhitespace(): void {
    while (
      this.position < this.source.length &&
      /\s/.test(this.source[this.position])
    ) {
      this.position += 1;
    }
  }
}

function getLatestUserMessage(
  context: UniversalToolDetectionContext,
): string {
  for (
    let index = context.messages.length - 1;
    index >= 0;
    index -= 1
  ) {
    const message = context.messages[index];

    if (message.role === "user") {
      return message.content.trim();
    }
  }

  return "";
}

function normalizeExpression(
  value: string,
): string {
  return value
    .replace(/[×x]/gi, "*")
    .replace(/[÷]/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function extractExpression(
  message: string,
): string | null {
  const normalizedMessage =
    normalizeExpression(message);

  const keywordExpression =
    normalizedMessage.match(
      /(?:calcule|calculer|calculate|calculation|combien font|combien fait|résous|resous|evaluate|évalue|evalue)\s*:?\s*([0-9+\-*/%^().\s]+)/i,
    )?.[1];

  const candidate =
    keywordExpression ??
    normalizedMessage.match(
      /([0-9][0-9+\-*/%^().\s]*[+\-*/%^][0-9+\-*/%^().\s]*)/,
    )?.[1];

  if (!candidate) {
    return null;
  }

  const expression =
    candidate.trim();

  if (
    expression.length === 0 ||
    expression.length >
      MAX_EXPRESSION_LENGTH
  ) {
    return null;
  }

  if (
    !/^[0-9+\-*/%^().\s]+$/.test(
      expression,
    )
  ) {
    return null;
  }

  if (!/[+\-*/%^]/.test(expression)) {
    return null;
  }

  return expression;
}

function formatNumber(
  value: number,
): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  return Number(
    value.toPrecision(15),
  ).toString();
}

function isCalculatorInput(
  value: unknown,
): value is CalculatorInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "expression" in value &&
    typeof (
      value as {
        readonly expression?: unknown;
      }
    ).expression === "string"
  );
}

export const calculatorTool: UniversalTool = {
  id: "calculator",
  name: "Calculatrice",
  description:
    "Effectue des calculs arithmétiques sécurisés sans utiliser eval.",

  detect(
    context,
  ): UniversalToolDetection | null {
    const message =
      getLatestUserMessage(context);

    if (!message) {
      return null;
    }

    const expression =
      extractExpression(message);

    if (!expression) {
      return null;
    }

    const lowerMessage =
      message.toLowerCase();

    const explicitRequest =
      CALCULATION_KEYWORDS.some(
        (keyword) =>
          lowerMessage.includes(keyword),
      );

    return {
      toolId: "calculator",
      confidence:
        explicitRequest ? 1 : 0.85,
      input: {
        expression,
      } satisfies CalculatorInput,
      reason:
        "Une expression arithmétique a été détectée.",
    };
  },

  async execute(input) {
    if (!isCalculatorInput(input)) {
      throw new UniversalError({
        code: "VALIDATION_ERROR",
        message:
          "L'expression de calcul est invalide.",
        statusCode: 400,
      });
    }

    const expression =
      normalizeExpression(
        input.expression,
      );

    const parser =
      new ArithmeticParser(expression);

    const result = parser.parse();
    const formattedResult =
      formatNumber(result);

    return {
      content:
        `${expression} = ${formattedResult}`,
      data: {
        expression,
        result,
        formattedResult,
      },
    };
  },
};