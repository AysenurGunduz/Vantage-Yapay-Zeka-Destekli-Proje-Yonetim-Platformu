import type { ZodType } from "zod";

export class AISchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AISchemaError";
  }
}

export function parseAIResponse<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
    throw new AISchemaError(`AI response did not match the expected schema: ${detail}`);
  }
  return result.data;
}
