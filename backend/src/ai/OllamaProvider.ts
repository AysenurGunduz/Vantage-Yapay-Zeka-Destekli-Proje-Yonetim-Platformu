import type { AIProvider } from "./AIProvider.js";

// Yerel model kısıtlı donanımda (bkz. GPU/VRAM notları) bazen yavaş yükleniyor;
// bir istek asla yanıtlamazsa Express isteği sonsuza kadar açık kalmasın diye
// bir üst sınır koyuyoruz.
const DEFAULT_TIMEOUT_MS = 45_000;

export class OllamaProvider implements AIProvider {
  constructor(
    private readonly host: string,
    private readonly model: string,
    private readonly temperature: number = 0.3,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  private async generate(prompt: string, jsonMode: boolean): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { temperature: this.temperature },
          ...(jsonMode ? { format: "json" } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Ollama request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }

  generateText(prompt: string): Promise<string> {
    return this.generate(prompt, false);
  }

  async generateJSON<T>(prompt: string): Promise<T> {
    const text = await this.generate(prompt, true);
    return JSON.parse(text) as T;
  }
}
