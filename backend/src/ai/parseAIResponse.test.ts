import { describe, it, expect } from "vitest";
import { parseAIResponse, AISchemaError } from "./parseAIResponse.js";
import { taskSplitSchema } from "./schemas.js";

describe("parseAIResponse with taskSplitSchema", () => {
  it("returns the parsed payload for a valid response", () => {
    const result = parseAIResponse(taskSplitSchema, {
      subtasks: [{ title: "  Alt görev 1  ", estimated_hours: 2 }],
    });

    expect(result).toEqual({ subtasks: [{ title: "Alt görev 1", estimated_hours: 2 }] });
  });

  it("allows a subtask without estimated_hours", () => {
    const result = parseAIResponse(taskSplitSchema, { subtasks: [{ title: "Alt görev" }] });
    expect(result.subtasks[0].estimated_hours).toBeUndefined();
  });

  it("throws AISchemaError when subtasks is missing entirely", () => {
    expect(() => parseAIResponse(taskSplitSchema, { oops: true })).toThrow(AISchemaError);
  });

  it("throws when subtasks is an empty array", () => {
    expect(() => parseAIResponse(taskSplitSchema, { subtasks: [] })).toThrow(AISchemaError);
  });

  it("throws when a title is empty or whitespace-only", () => {
    expect(() => parseAIResponse(taskSplitSchema, { subtasks: [{ title: "" }] })).toThrow(AISchemaError);
    expect(() => parseAIResponse(taskSplitSchema, { subtasks: [{ title: "   " }] })).toThrow(AISchemaError);
  });

  it("throws when estimated_hours is not a positive number", () => {
    expect(() => parseAIResponse(taskSplitSchema, { subtasks: [{ title: "X", estimated_hours: "3" }] })).toThrow(
      AISchemaError,
    );
    expect(() => parseAIResponse(taskSplitSchema, { subtasks: [{ title: "X", estimated_hours: 0 }] })).toThrow(
      AISchemaError,
    );
    expect(() => parseAIResponse(taskSplitSchema, { subtasks: [{ title: "X", estimated_hours: -1 }] })).toThrow(
      AISchemaError,
    );
  });

  it("includes the failing field path in the error message", () => {
    try {
      parseAIResponse(taskSplitSchema, { subtasks: [{ title: "" }] });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AISchemaError);
      expect((err as Error).message).toContain("subtasks.0.title");
    }
  });
});
