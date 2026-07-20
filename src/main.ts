import "./styles.css";
import "./experience.css";
import "./experiencePhase.css";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppController, type ControllerView, type SourceMode } from "./application/appController";
import type { AgentSnapshot } from "./domain/agent";
import { CodexJsonlSource } from "./infrastructure/codexClient";
import { BrowserWorldPersistence } from "./infrastructure/worldPersistence";
import { TokenFireAudioDirector } from "./presentation/audioDirector";
import { ExperienceAudioDirector } from "./presentation/experienceAudio";
import { TokenFireExperienceOverlay } from "./presentation/experienceOverlay";
import { PixelRenderer } from "./presentation/pixelRenderer";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app was not found");

app.innerHTML = `
  <main class="shell">
    <div class="drag-strip" data-tauri-drag-region></div>
    <div class="brand">TOKEN-FIRE</div>
    <div class="toolbar">
      <button id="source-button" type="button" title="Codex / Demo 切替">DEMO</button>
      <button id="size-button" type="button" title="表示サイズ切替">SIZE</button>
      <button id="info-button" type="button" title="Reality Check（I）">INFO</button>
      <button id="sound-button" type="button" title="サウンド切替" aria-label="サウンド切替">🔊</button>
      <button id="close-button" type="button" title="閉じる">×</button>
    </div>
    <canvas id="world" width="640" height="384" aria-label="Token-Fire mascot diorama"></canvas>
    <div class="status-line"><span class="connection-dot recovering"></span><span id="connection">WAITING FOR CODEX</span></div>
  </main>
`;

const shell = document.querySelector<HTMLElement>(".shell");
const canvas = document.querySelector<HTMLCanvasElement>("#world");
const sourceButton = document.querySelector<HTMLButtonElement>("#source-button");
const sizeButton = document.querySelector<HTMLButtonElement>("#size-button");
const infoButton = document.querySelector<HTMLButtonElement>("#info-button");
const soundButton = document.querySelector<HTMLButtonElement>("#sound-button");
const closeButton = document.querySelector<HTMLButtonElement>("#close-button");
const connection = document.querySelector<HTMLSpanElement>("#connection");
const connectionDot = document.querySelector<HTMLSpanElement>(".connection-dot");
if (!shell || !canvas || !sourceButton || !sizeButton || !infoButton || !soundButton || !closeButton || !connection || !connectionDot) {
  throw new Error("Token-Fire UI failed to initialize");
}

let currentSource: SourceMode = "codex";
let currentSize = 1;
const sizes = [
  new LogicalSize(380, 240),
  new LogicalSize(560, 350),
  new LogicalSize(800, 480),
];

const view: ControllerView = {
  setSourceMode(mode) {
    currentSource = mode;
    sourceButton.textContent = mode === "codex" ? "DEMO" : "CODEX";
    sourceButton.setAttribute("aria-pressed", String(mode === "demo"));
  },
  setConnectionLabel(label) {
    connection.textContent = label;
  },
  setStatus(snapshot: AgentSnapshot) {
    connectionDot.classList.toggle("active", snapshot.active);
    connectionDot.classList.toggle("recovering", !snapshot.active && snapshot.status !== "error");
    const suffix = snapshot.sessionTitle ? ` · ${snapshot.sessionTitle}` : "";
    connection.textContent = `${snapshot.source.toUpperCase()}${suffix}`;
  },
};

const experience = new TokenFireExperienceOverlay(shell);
const audio = new ExperienceAudioDirector(new TokenFireAudioDirector());
const controller = new AppController(
  new CodexJsonlSource(),
  new PixelRenderer(canvas),
  audio,
  experience,
  new BrowserWorldPersistence(),
  view,
);
controller.start();
if (!("__TAURI_INTERNALS__" in window)) controller.setMode("demo");

const renderSoundButton = (): void => {
  soundButton.disabled = !audio.supported;
  soundButton.textContent = audio.supported ? (audio.enabled ? "🔊" : "🔇") : "—";
  soundButton.setAttribute("aria-pressed", String(audio.enabled));
  soundButton.title = !audio.supported
    ? "この環境ではサウンドを利用できません"
    : audio.enabled
      ? "サウンドをミュート（M）"
      : "サウンドを有効化（M）";
};
renderSoundButton();

const unlockAudio = (): void => {
  void audio.unlock();
};
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio);

sourceButton.addEventListener("click", () => {
  controller.setMode(currentSource === "codex" ? "demo" : "codex");
});

sizeButton.addEventListener("click", async () => {
  currentSize = (currentSize + 1) % sizes.length;
  await getCurrentWindow().setSize(sizes[currentSize]);
});

infoButton.addEventListener("click", () => experience.toggleRealityCheck());

soundButton.addEventListener("click", async () => {
  await audio.toggle();
  renderSoundButton();
});

closeButton.addEventListener("click", async () => {
  controller.stop();
  await getCurrentWindow().close();
});

window.addEventListener("beforeunload", () => controller.stop(), { once: true });
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "d") controller.setMode(currentSource === "codex" ? "demo" : "codex");
  if (event.key.toLowerCase() === "m" && !event.repeat) void audio.toggle().then(renderSoundButton);
  if (event.key.toLowerCase() === "i" && !event.repeat) experience.toggleRealityCheck();
  if (event.key === "Escape") experience.toggleRealityCheck(false);
});
