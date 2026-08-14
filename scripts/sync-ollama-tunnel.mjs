import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID;
const OLLAMA_LOCAL_URL = "http://localhost:11434";

if (!RENDER_API_KEY || !RENDER_SERVICE_ID) {
  console.error("RENDER_API_KEY ve RENDER_SERVICE_ID, repo kökündeki .env dosyasında tanımlı olmalı.");
  process.exit(1);
}

function findCloudflared() {
  const candidates = [
    "cloudflared",
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
  ];
  for (const candidate of candidates) {
    if (candidate === "cloudflared" || existsSync(candidate)) return candidate;
  }
  throw new Error(
    "cloudflared bulunamadı. https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ üzerinden kur.",
  );
}

async function waitUntilReachable(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return true;
    } catch {
      // henüz hazır değil, tekrar dene
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return false;
}

async function updateRenderEnvVar(key, value) {
  const res = await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars/${key}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    throw new Error(`Render env var güncellenemedi (${res.status}): ${await res.text()}`);
  }
}

console.log("Yerel Ollama'yı dışarı açan tünel başlatılıyor...");

const cloudflaredPath = findCloudflared();
const tunnel = spawn(cloudflaredPath, ["tunnel", "--url", OLLAMA_LOCAL_URL, "--http-host-header", "localhost:11434"]);

let urlFound = false;

tunnel.stderr.setEncoding("utf8");
tunnel.stdout.setEncoding("utf8");

function handleOutput(chunk) {
  process.stdout.write(chunk);
  if (urlFound) return;
  const match = chunk.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match) {
    urlFound = true;
    onTunnelUrl(match[0]);
  }
}

tunnel.stderr.on("data", handleOutput);
tunnel.stdout.on("data", handleOutput);

tunnel.on("exit", (code) => {
  console.log(`Tünel süreci sonlandı (kod: ${code}).`);
  process.exit(code ?? 0);
});

async function onTunnelUrl(url) {
  console.log(`\nTünel adresi: ${url}`);
  console.log("Erişilebilir hale gelmesi bekleniyor...");

  const reachable = await waitUntilReachable(url);
  if (reachable) {
    console.log("Tünel hazır.");
  } else {
    console.error("Tünel 60 saniye içinde erişilebilir hale gelmedi. Yine de Render'ı güncellemeyi deneyeceğim.");
  }

  console.log("Render'daki OLLAMA_HOST güncelleniyor...");
  try {
    await updateRenderEnvVar("OLLAMA_HOST", url);
    console.log("Render güncellendi. Backend birkaç dakika içinde yeniden başlayacak.");
    console.log("\nTünel çalışmaya devam ediyor. Durdurmak için Ctrl+C.");
  } catch (err) {
    console.error("Render güncellemesi başarısız:", err.message);
  }
}

process.on("SIGINT", () => {
  console.log("\nDurduruluyor...");
  tunnel.kill();
  process.exit(0);
});
