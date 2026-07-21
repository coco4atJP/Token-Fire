import "./styles.css";
import "./experience.css";
import "./experiencePhase.css";
import "./advancedExperience.css";
import "./interactionFixes.css";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppController, type ControllerView, type SourceMode } from "./application/appController";
import { AttentionDirector } from "./application/attentionDirector";
import { EnvironmentDirector } from "./application/environmentDirector";
import { PackEventDirector } from "./application/packEventDirector";
import { ReplayRecorder } from "./application/replayRecorder";
import type { AgentSnapshot } from "./domain/agent";
import { EventPackRegistry } from "./domain/eventPack";
import { CodexJsonlSource } from "./infrastructure/codexClient";
import { PlatformBridge } from "./infrastructure/platformBridge";
import { SettingsStore } from "./infrastructure/settingsStore";
import { BrowserWorldPersistence } from "./infrastructure/worldPersistence";
import { TokenFireAudioDirector } from "./presentation/audioDirector";
import { ControlCenter } from "./presentation/controlCenter";
import { ExperienceAudioDirector } from "./presentation/experienceAudio";
import { TokenFireExperienceOverlay } from "./presentation/experienceOverlay";
import { InteractionController } from "./presentation/interactionController";
import { PixelRenderer } from "./presentation/pixelRenderer";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app was not found");

app.innerHTML = `
  <main class="shell">
    <div class="drag-strip" data-tauri-drag-region></div>
    <div class="brand">TOKEN-FIRE</div>
    <div class="toolbar">
      <button id="play-button" type="button" title="キャラクターを触る（P）">PLAY</button>
      <button id="ledger-button" type="button" title="記録棚（L）">LEDGER</button>
      <button id="quiet-button" type="button" title="30分休止（Q）">QUIET</button>
      <button id="source-button" type="button" title="Codex / Demo 切替">DEMO</button>
      <button id="size-button" type="button" title="表示サイズ切替">SIZE</button>
      <button id="info-button" type="button" title="Reality Check（I）">INFO</button>
      <button id="sound-button" type="button" title="サウンド切替" aria-label="サウンド切替">🔊</button>
      <button id="close-button" type="button" title="Trayへ隠す">×</button>
    </div>
    <canvas id="world" width="640" height="384" aria-label="Token-Fire mascot diorama"></canvas>
    <div class="status-line"><span class="connection-dot recovering"></span><span id="connection">WAITING FOR CODEX</span></div>
  </main>
`;

const shell = requireElement<HTMLElement>(".shell");
const canvas = requireElement<HTMLCanvasElement>("#world");
const playButton = requireElement<HTMLButtonElement>("#play-button");
const ledgerButton = requireElement<HTMLButtonElement>("#ledger-button");
const quietButton = requireElement<HTMLButtonElement>("#quiet-button");
const sourceButton = requireElement<HTMLButtonElement>("#source-button");
const sizeButton = requireElement<HTMLButtonElement>("#size-button");
const infoButton = requireElement<HTMLButtonElement>("#info-button");
const soundButton = requireElement<HTMLButtonElement>("#sound-button");
const closeButton = requireElement<HTMLButtonElement>("#close-button");
const connection = requireElement<HTMLSpanElement>("#connection");
const connectionDot = requireElement<HTMLSpanElement>(".connection-dot");

let currentSource: SourceMode = "codex";
let currentSize = 1;
const sizes = [new LogicalSize(380, 240), new LogicalSize(560, 350), new LogicalSize(800, 480)];

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

const settings = new SettingsStore();
const platform = new PlatformBridge();
const persistence = new BrowserWorldPersistence();
const eventPacks = new EventPackRegistry();
const attention = new AttentionDirector(settings, platform);
const environment = new EnvironmentDirector(settings);
const packEvents = new PackEventDirector(eventPacks, settings, attention);
const replay = new ReplayRecorder();
const experience = new TokenFireExperienceOverlay(shell);
const audio = new ExperienceAudioDirector(new TokenFireAudioDirector(), {
  allowEventSound: () => attention.allowEventSound(),
  isQuiet: () => attention.isQuiet(),
});
const controller = new AppController(
  new CodexJsonlSource(),
  new PixelRenderer(canvas),
  audio,
  experience,
  persistence,
  environment,
  attention,
  packEvents,
  replay,
  view,
);
const interaction = new InteractionController(shell, () => controller.getWorld(), controller.getCharacterDirector());
const controlCenter = new ControlCenter(
  shell,
  controller.getWorld(),
  controller.getSnapshot(),
  persistence,
  settings,
  eventPacks,
  platform,
);
controller.subscribe((world, snapshot) => {
  interaction.update(world, snapshot);
  controlCenter.update(world, snapshot);
  shell.dataset.attention = settings.get().attention.mode;
  shell.classList.toggle("is-quiet", attention.isQuiet());
  shell.classList.toggle("reduce-flash", settings.get().attention.reduceFlash);
});
controller.start();
if (!("__TAURI_INTERNALS__" in window)) controller.setMode("demo");

const renderSoundButton = (): void => {
  soundButton.disabled = !audio.supported;
  soundButton.textContent = audio.supported ? (audio.enabled ? "🔊" : "🔇") : "—";
  soundButton.setAttribute("aria-pressed", String(audio.enabled));
  soundButton.title = !audio.supported ? "この環境ではサウンドを利用できません" : audio.enabled ? "サウンドをミュート（M）" : "サウンドを有効化（M）";
};

const renderQuietButton = (): void => {
  const quiet = settings.isQuiet();
  quietButton.textContent = quiet ? "WAKE" : "QUIET";
  quietButton.setAttribute("aria-pressed", String(quiet));
};
renderSoundButton();
renderQuietButton();
settings.addEventListener("change", renderQuietButton);

const unlockAudio = (): void => { void audio.unlock(); };
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio);

playButton.addEventListener("click", () => {
  const enabled = interaction.toggle();
  playButton.setAttribute("aria-pressed", String(enabled));
  playButton.textContent = enabled ? "DONE" : "PLAY";
});
ledgerButton.addEventListener("click", () => controlCenter.toggle());
quietButton.addEventListener("click", () => {
  if (settings.isQuiet()) settings.update({ attention: { ...settings.get().attention, quietUntil: 0 } });
  else settings.quietFor(30);
  renderQuietButton();
});
sourceButton.addEventListener("click", () => controller.setMode(currentSource === "codex" ? "demo" : "codex"));
sizeButton.addEventListener("click", async () => {
  currentSize = (currentSize + 1) % sizes.length;
  if ("__TAURI_INTERNALS__" in window) await getCurrentWindow().setSize(sizes[currentSize]);
});
infoButton.addEventListener("click", () => experience.toggleRealityCheck());
soundButton.addEventListener("click", async () => {
  await audio.toggle();
  renderSoundButton();
});
closeButton.addEventListener("click", () => void platform.hideWindow());

void platform.getAutostart().then((enabled) => {
  if (enabled !== settings.get().autostart) settings.update({ autostart: enabled });
});
void platform.registerToggleShortcut(() => void platform.showWindow());

window.addEventListener("beforeunload", () => controller.stop(), { once: true });
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "d") controller.setMode(currentSource === "codex" ? "demo" : "codex");
  if (key === "m" && !event.repeat) void audio.toggle().then(renderSoundButton);
  if (key === "i" && !event.repeat) experience.toggleRealityCheck();
  if (key === "p" && !event.repeat) playButton.click();
  if (key === "l" && !event.repeat) controlCenter.toggle();
  if (key === "q" && !event.repeat) quietButton.click();
  if (event.key === "Escape") {
    experience.toggleRealityCheck(false);
    controlCenter.toggle(false);
    interaction.toggle(false);
    playButton.textContent = "PLAY";
    playButton.setAttribute("aria-pressed", "false");
  }
});

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Token-Fire UI failed to initialize: ${selector}`);
  return element;
}
