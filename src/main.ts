import "./styles.css";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppController, type ControllerView, type SourceMode } from "./application/appController";
import type { AgentSnapshot } from "./domain/agent";
import { CodexJsonlSource } from "./infrastructure/codexClient";
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
      <button id="close-button" type="button" title="閉じる">×</button>
    </div>
    <canvas id="world" width="640" height="384" aria-label="Token-Fire mascot diorama"></canvas>
    <div class="status-line"><span class="connection-dot recovering"></span><span id="connection">WAITING FOR CODEX</span></div>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#world");
const sourceButton = document.querySelector<HTMLButtonElement>("#source-button");
const sizeButton = document.querySelector<HTMLButtonElement>("#size-button");
const closeButton = document.querySelector<HTMLButtonElement>("#close-button");
const connection = document.querySelector<HTMLSpanElement>("#connection");
const connectionDot = document.querySelector<HTMLSpanElement>(".connection-dot");
if (!canvas || !sourceButton || !sizeButton || !closeButton || !connection || !connectionDot) {
  throw new Error("Token-Fire UI failed to initialize");
}

let currentSource: SourceMode = "codex";
let currentSize = 1;
const sizes = [
  new LogicalSize(380, 240),
  new LogicalSize(560, 350),
  new LogicalSize(820, 300),
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

const controller = new AppController(new CodexJsonlSource(), new PixelRenderer(canvas), view);
controller.start();
if (!("__TAURI_INTERNALS__" in window)) {
  controller.setMode("demo");
}

sourceButton.addEventListener("click", () => {
  controller.setMode(currentSource === "codex" ? "demo" : "codex");
});

sizeButton.addEventListener("click", async () => {
  currentSize = (currentSize + 1) % sizes.length;
  await getCurrentWindow().setSize(sizes[currentSize]);
});

closeButton.addEventListener("click", async () => {
  controller.stop();
  await getCurrentWindow().close();
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "d") {
    controller.setMode(currentSource === "codex" ? "demo" : "codex");
  }
});
