import { describe, it, expect, vi, beforeEach } from "vitest";
import { OllamaProvider } from "./OllamaProvider.js";

describe("OllamaProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sends the model and prompt to the Ollama generate endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ response: "merhaba" }),
    } as Response);

    const provider = new OllamaProvider("http://localhost:11434", "llama3.2:3b");
    const result = await provider.generateText("selam");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/generate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "llama3.2:3b",
          prompt: "selam",
          stream: false,
          options: { temperature: 0.3 },
        }),
      }),
    );
    expect(result).toBe("merhaba");
  });

  it("requests JSON mode and parses the response for generateJSON", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{"ok":true}' }),
    } as Response);

    const provider = new OllamaProvider("http://localhost:11434", "llama3.2:3b");
    const result = await provider.generateJSON<{ ok: boolean }>("selam");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/generate",
      expect.objectContaining({
        body: JSON.stringify({
          model: "llama3.2:3b",
          prompt: "selam",
          stream: false,
          options: { temperature: 0.3 },
          format: "json",
        }),
      }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("throws when the Ollama request fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    const provider = new OllamaProvider("http://localhost:11434", "llama3.2:3b");

    await expect(provider.generateText("selam")).rejects.toThrow("Ollama request failed: 500 Internal Server Error");
  });

  it("throws a clear timeout error when the request is aborted", async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));

    const provider = new OllamaProvider("http://localhost:11434", "llama3.2:3b", 0.3, 10);

    await expect(provider.generateText("selam")).rejects.toThrow("Ollama request timed out after 10ms");
  });

  it("passes an AbortSignal to fetch so a hung request can be cancelled", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ response: "merhaba" }),
    } as Response);

    const provider = new OllamaProvider("http://localhost:11434", "llama3.2:3b");
    await provider.generateText("selam");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/api/generate",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
