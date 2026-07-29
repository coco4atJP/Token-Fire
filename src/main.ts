import "./styles.css";
import "./experience.css";
import "./advancedExperience.css";
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
import { PixiRenderer } from "./presentation/pixiRenderer";
import { readPresentationMotionPolicy } from "./presentation/presentationMotionPolicy";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app was not found");

app.innerHTML = `
  <main class="shell">
    <div class="drag-strip" data-tauri-drag-region></div>
    <div class="brand">TOKEN-FIRE</div>
    <div class="toolbar">
      <button id="play-button" type="button" title="キャラクターを触る（P）">PLAY</button>
      <button id="ledger-button" type="button" title="つけ帳（L）">つけ帳</button>
      <button id="quiet-button" type="button" title="30分休止（Q）">QUIET</button>
      <button id="menu-button" type="button" title="劇場メニュー" aria-haspopup="menu" aria-expanded="false">MENU</button>
      <button id="close-button" type="button" title="Trayへ隠す">×</button>
    </div>
    <div class="theatre-menu" role="menu" aria-label="劇場メニュー" hidden inert>
      <button id="sound-button" type="button" role="menuitem" title="サウンド切替">サウンド</button>
      <button id="size-button" type="button" role="menuitem">表示サイズ</button>
      <button id="info-button" type="button" role="menuitem">Soto Note</button>
      <button id="settings-button" type="button" role="menuitem">設定</button>
      <button id="source-button" type="button" role="menuitem">入力元</button>
    </div>
    <aside class="play-guide" aria-label="PLAYの操作案内" hidden>
      <strong>舞台へ触れます</strong>
      <span>作業員に触る · Fuwameを横へ運ぶ · 森側を押す · DONE / Escapeで終了</span>
      <button type="button" aria-label="操作案内を閉じる">わかった</button>
    </aside>
    <canvas id="world" aria-label="Token-Fire puppet theatre"></canvas>
    <div class="stage-loading">舞台を組み立てています…</div>
    <div class="status-line"><span class="connection-dot recovering"></span><span id="connection">WAITING FOR CODEX</span></div>
  </main>
`;

const shell = requireElement<HTMLElement>(".shell");
const canvas = requireElement<HTMLCanvasElement>("#world");
const playButton = requireElement<HTMLButtonElement>("#play-button");
const ledgerButton = requireElement<HTMLButtonElement>("#ledger-button");
const quietButton = requireElement<HTMLButtonElement>("#quiet-button");
const menuButton = requireElement<HTMLButtonElement>("#menu-button");
const menu = requireElement<HTMLDivElement>(".theatre-menu");
const sourceButton = requireElement<HTMLButtonElement>("#source-button");
const sizeButton = requireElement<HTMLButtonElement>("#size-button");
const infoButton = requireElement<HTMLButtonElement>("#info-button");
const settingsButton = requireElement<HTMLButtonElement>("#settings-button");
const soundButton = requireElement<HTMLButtonElement>("#sound-button");
const closeButton = requireElement<HTMLButtonElement>("#close-button");
const playGuide = requireElement<HTMLElement>(".play-guide");
const playGuideClose = requireElement<HTMLButtonElement>(".play-guide button");
const connection = requireElement<HTMLSpanElement>("#connection");
const connectionDot = requireElement<HTMLSpanElement>(".connection-dot");
const stageLoading = requireElement<HTMLDivElement>(".stage-loading");
const isDesktop = "__TAURI_INTERNALS__" in window;

let currentSource: SourceMode = "codex";
let currentSize = 1;
const sizes = [new LogicalSize(380, 240), new LogicalSize(560, 350), new LogicalSize(800, 480)];

const view: ControllerView = {
  setSourceMode(mode) {
    currentSource = mode;
    sourceButton.textContent = mode === "codex" ? "Demoへ切替" : "Codexへ切替";
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
let interaction: InteractionController | null = null;
const stopDirectInteraction = (): void => {
  if (!interaction) return;
  interaction.toggle(false);
  playButton.textContent = "PLAY";
  playButton.setAttribute("aria-pressed", "false");
};
const experience = new TokenFireExperienceOverlay(shell, (open) => {
  if (open) stopDirectInteraction();
});
const audio = new ExperienceAudioDirector(new TokenFireAudioDirector(), {
  allowEventSound: () => attention.allowEventSound(),
  isQuiet: () => attention.isQuiet(),
});
const renderer = await PixiRenderer.create(canvas, () =>
  readPresentationMotionPolicy(settings.get(), attention.isQuiet()),
);
stageLoading.remove();
const controller = new AppController(
  new CodexJsonlSource(),
  renderer,
  audio,
  experience,
  persistence,
  environment,
  attention,
  packEvents,
  replay,
  view,
);
interaction = new InteractionController(shell, () => controller.getWorld(), controller.getCharacterDirector());
const controlCenter = new ControlCenter(
  shell,
  controller.getWorld(),
  controller.getSnapshot(),
  persistence,
  settings,
  eventPacks,
  platform,
  (open) => {
    if (open) stopDirectInteraction();
  },
  () => showPlayIntro(false),
);
controller.subscribe((world, snapshot) => {
  interaction?.update(world, snapshot);
  controlCenter.update(world, snapshot);
  shell.dataset.attention = settings.get().attention.mode;
  shell.classList.toggle("is-quiet", attention.isQuiet());
  shell.classList.toggle("reduce-flash", settings.get().attention.reduceFlash);
});
controller.start();
if (!isDesktop) {
  controller.setMode("demo");
  sourceButton.disabled = true;
  sourceButton.textContent = "Codex · デスクトップ版で利用可能";
  sourceButton.title = "Codex監視はデスクトップ版で利用できます";
}

const renderSoundButton = (): void => {
  soundButton.disabled = !audio.supported;
  soundButton.textContent = audio.supported ? (audio.enabled ? "サウンド · ON" : "サウンド · OFF") : "サウンド · 利用不可";
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
  const enabled = interaction?.toggle() ?? false;
  playButton.setAttribute("aria-pressed", String(enabled));
  playButton.textContent = enabled ? "DONE" : "PLAY";
  if (enabled && !settings.get().playIntroSeen) showPlayIntro(true);
});
ledgerButton.addEventListener("click", () => {
  closeMenu();
  experience.toggleRealityCheck(false);
  controlCenter.toggle();
});
quietButton.addEventListener("click", () => {
  if (settings.isQuiet()) settings.update({ attention: { ...settings.get().attention, quietUntil: 0 } });
  else settings.quietFor(30);
  renderQuietButton();
});
menuButton.addEventListener("click", () => toggleMenu());
sourceButton.addEventListener("click", () => {
  if (!isDesktop) return;
  controller.setMode(currentSource === "codex" ? "demo" : "codex");
});
sizeButton.addEventListener("click", async () => {
  currentSize = (currentSize + 1) % sizes.length;
  if ("__TAURI_INTERNALS__" in window) await getCurrentWindow().setSize(sizes[currentSize]);
});
infoButton.addEventListener("click", () => {
  closeMenu();
  controlCenter.toggle(false);
  experience.toggleRealityCheck();
});
settingsButton.addEventListener("click", () => {
  closeMenu();
  experience.toggleRealityCheck(false);
  controlCenter.openSettings();
});
soundButton.addEventListener("click", async () => {
  await audio.toggle();
  renderSoundButton();
});
closeButton.addEventListener("click", () => void platform.hideWindow());
playGuideClose.addEventListener("click", () => {
  playGuide.hidden = true;
  playButton.removeAttribute("aria-describedby");
});
document.addEventListener("pointerdown", (event) => {
  if (menu.hidden || menu.contains(event.target as Node) || event.target === menuButton) return;
  closeMenu();
});

void platform.getAutostart().then((enabled) => {
  if (enabled !== settings.get().autostart) settings.update({ autostart: enabled });
});
void platform.registerToggleShortcut(() => void platform.showWindow());

window.addEventListener("beforeunload", () => controller.stop(), { once: true });
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "d" && isDesktop) controller.setMode(currentSource === "codex" ? "demo" : "codex");
  if (key === "m" && !event.repeat) void audio.toggle().then(renderSoundButton);
  if (key === "i" && !event.repeat) experience.toggleRealityCheck();
  if (key === "p" && !event.repeat) playButton.click();
  if (key === "l" && !event.repeat) controlCenter.toggle();
  if (key === "q" && !event.repeat) quietButton.click();
  if (event.key === "Escape") {
    experience.toggleRealityCheck(false);
    controlCenter.toggle(false);
    closeMenu();
    playGuide.hidden = true;
    stopDirectInteraction();
  }
});

function toggleMenu(force?: boolean): void {
  const open = force ?? menu.hidden;
  menu.hidden = !open;
  menu.inert = !open;
  menu.toggleAttribute("inert", !open);
  menuButton.setAttribute("aria-expanded", String(open));
  if (open) menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  else if (document.activeElement && menu.contains(document.activeElement)) menuButton.focus();
}

function closeMenu(): void {
  toggleMenu(false);
}

function showPlayIntro(markSeen: boolean): void {
  playGuide.hidden = false;
  playButton.setAttribute("aria-describedby", "play-guide-copy");
  const copy = playGuide.querySelector<HTMLElement>("span");
  if (copy) copy.id = "play-guide-copy";
  if (markSeen) settings.update({ playIntroSeen: true });
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Token-Fire UI failed to initialize: ${selector}`);
  return element;
}
