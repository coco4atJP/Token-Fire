import "./styles.css";
import "./experience.css";
import "./advancedExperience.css";
import "./redesign.css";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppController, type ControllerView, type SourceMode } from "./application/appController";
import { AttentionDirector } from "./application/attentionDirector";
import { EnvironmentDirector } from "./application/environmentDirector";
import { PackEventDirector } from "./application/packEventDirector";
import { ReplayRecorder } from "./application/replayRecorder";
import type { AgentSnapshot } from "./domain/agent";
import { readWorldScene } from "./domain/worldScene";
import type { AgentSource } from "./infrastructure/codexClient";
import type { DevelopmentFixture } from "./infrastructure/developmentFixture";
import { EventPackRegistry } from "./domain/eventPack";
import { CodexJsonlSource } from "./infrastructure/codexClient";
import { PlatformBridge } from "./infrastructure/platformBridge";
import { SettingsStore } from "./infrastructure/settingsStore";
import { BrowserWorldPersistence, type WorldPersistence } from "./infrastructure/worldPersistence";
import { TokenFireAudioDirector } from "./presentation/audioDirector";
import { ControlCenter } from "./presentation/controlCenter";
import { ExperienceAudioDirector } from "./presentation/experienceAudio";
import { TokenFireExperienceOverlay } from "./presentation/experienceOverlay";
import { shouldIgnoreGlobalShortcut } from "./presentation/globalShortcut";
import { InteractionController } from "./presentation/interactionController";
import { OpeningBriefing } from "./presentation/openingBriefing";
import { PixiRenderer } from "./presentation/pixiRenderer";
import { readPresentationMotionPolicy } from "./presentation/presentationMotionPolicy";
import { readStageLayoutMode } from "./presentation/stageLayout";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app was not found");

app.innerHTML = `
  <main class="shell">
    <div class="drag-strip" data-tauri-drag-region></div>
    <div class="brand" aria-hidden="true"><span>HIBANA WORKS</span><strong>TOKEN-FIRE</strong></div>
    <div class="toolbar" role="toolbar" aria-label="劇場操作">
      <button id="play-button" type="button" title="キャラクターへ触る（P）" aria-label="PLAY · キャラクターへ触る（P）"><img src="/assets/token-fire/generated/ui/icons/play-puppet-control-64.png" alt=""><span>遊ぶ</span></button>
      <button id="ledger-button" type="button" title="つけ帳を開く（L）" aria-label="LEDGER · つけ帳を開く（L）"><img src="/assets/token-fire/generated/ui/icons/ledger-book-control-64.png" alt=""><span>台帳</span></button>
      <button id="quiet-button" type="button" title="30分の幕間（Q）" aria-label="QUIET · 30分の幕間（Q）"><img src="/assets/token-fire/generated/ui/icons/quiet-rain-intermission-64.png" alt=""><span>幕間</span></button>
      <button id="menu-button" type="button" title="舞台裏を開く" aria-label="BACKSTAGE · 舞台裏を開く" aria-haspopup="menu" aria-expanded="false"><img src="/assets/token-fire/generated/ui/icons/backstage-curtain-toolbox-control-64.png" alt=""><span>舞台裏</span></button>
      <button id="close-button" class="toolbar__close" type="button" title="Trayへ退避" aria-label="Trayへ退避"><img src="/assets/token-fire/generated/ui/icons/tray-stow-theatre-64.png" alt=""><span>退避</span></button>
    </div>
    <div class="theatre-menu" role="menu" aria-label="劇場メニュー" hidden inert>
      <div class="theatre-menu__header" role="presentation" aria-hidden="true"><span>BACKSTAGE</span><strong>劇場メニュー</strong></div>
      <button id="sound-button" type="button" role="menuitem" title="サウンド切替"><span>サウンド</span><small aria-hidden="true">ON</small></button>
      <button id="size-button" type="button" role="menuitem"><span>表示サイズ</span><small aria-hidden="true">窓の大きさ</small></button>
      <button id="info-button" type="button" role="menuitem"><span>Soto Note</span><small aria-hidden="true">現実との距離</small></button>
      <button id="settings-button" type="button" role="menuitem"><span>設定</span><small aria-hidden="true">通知・天気</small></button>
      <button id="source-button" type="button" role="menuitem"><span>入力元</span><small aria-hidden="true">Demoへ切替</small></button>
    </div>
    <aside class="play-guide" aria-label="PLAYの操作案内" hidden>
      <strong>舞台へ触れます</strong>
      <span>作業員に触る · Fuwameを横へ運ぶ · 森側を押す · DONE / Escapeで終了</span>
      <button type="button" aria-label="操作案内を閉じる">わかった</button>
    </aside>
    <canvas id="world" aria-label="Token-Fire puppet theatre"></canvas>
    <div class="stage-loading">舞台を組み立てています…</div>
  </main>
`;

const shell = requireElement<HTMLElement>(".shell");
const toolbar = requireElement<HTMLElement>(".toolbar");
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
const stageLoading = requireElement<HTMLDivElement>(".stage-loading");
const isDesktop = "__TAURI_INTERNALS__" in window;
const setMenuMeta = (button: HTMLButtonElement, value: string): void => {
  const meta = button.querySelector<HTMLElement>("small");
  if (meta) meta.textContent = value;
};

let currentSource: SourceMode = "codex";
let currentSize = 1;
let connectionLabel = "WAITING FOR CODEX";
let experience: TokenFireExperienceOverlay;
const sizes = [new LogicalSize(380, 240), new LogicalSize(560, 350), new LogicalSize(800, 480)];

const view: ControllerView = {
  setSourceMode(mode) {
    currentSource = mode;
    setMenuMeta(sourceButton, mode === "codex" ? "Demoへ切替" : "Codexへ切替");
    sourceButton.setAttribute("aria-label", mode === "codex" ? "入力元をDemoへ切替" : "入力元をCodexへ切替");
    sourceButton.setAttribute("aria-pressed", String(mode === "demo"));
  },
  setConnectionLabel(label) {
    connectionLabel = label;
    experience?.setConnectionLabel(label);
  },
  setStatus(snapshot: AgentSnapshot) {
    const suffix = snapshot.sessionTitle ? ` · ${snapshot.sessionTitle}` : "";
    connectionLabel = `${snapshot.source.toUpperCase()}${suffix}`;
    experience?.setConnectionLabel(connectionLabel);
  },
};

const settings = new SettingsStore();
toolbar.classList.toggle("is-inviting", !settings.get().playIntroSeen);
const platform = new PlatformBridge();
let developmentFixture: DevelopmentFixture | null = null;
let persistence: WorldPersistence = new BrowserWorldPersistence();
const eventPacks = new EventPackRegistry();
const attention = new AttentionDirector(settings, platform, () => developmentFixture === null);
const environment = new EnvironmentDirector(settings);
const packEvents = new PackEventDirector(eventPacks, settings, attention);
const replay = new ReplayRecorder();
let source: AgentSource = new CodexJsonlSource();
let applyDevelopmentFixture: ((fixture: DevelopmentFixture) => void) | null = null;
if (import.meta.env.DEV) {
  const fixtureModule = await import("./infrastructure/developmentFixture");
  developmentFixture = fixtureModule.readDevelopmentFixture(window.location.search, true);
  if (developmentFixture) {
    // bodyの5px insetを含むviewport寸法がfixtureの基準。100%で上限を設け、
    // 380×240時にapp自身を380×240へ固定して外側へ8〜10px溢れさせない。
    app.style.width = `min(100%, ${developmentFixture.width}px)`;
    app.style.height = `min(100%, ${developmentFixture.height}px)`;
    app.dataset.fixture = developmentFixture.scene;
    source = new fixtureModule.DevelopmentFixtureSource(developmentFixture);
    persistence = new fixtureModule.DevelopmentFixturePersistence(developmentFixture);
    applyDevelopmentFixture = (fixture) => fixtureModule.applyDevelopmentWorldFixture(controller.getWorld(), fixture);
  }
}
const readEffectiveQuiet = (): boolean => developmentFixture
  ? developmentFixture.quiet || document.visibilityState === "hidden"
  : attention.isQuiet();
let interaction: InteractionController | null = null;
const setToolbarLabel = (button: HTMLButtonElement, label: string): void => {
  const text = button.querySelector<HTMLElement>("span");
  if (text) text.textContent = label;
};
const stopDirectInteraction = (): void => {
  if (!interaction) return;
  interaction.toggle(false);
  setToolbarLabel(playButton, "遊ぶ");
  playButton.setAttribute("aria-pressed", "false");
  playButton.setAttribute("aria-label", "PLAY · キャラクターへ触る（P）");
};
experience = new TokenFireExperienceOverlay(shell, (open) => {
  if (open) stopDirectInteraction();
  setSurfaceOpen(open);
});
experience.setConnectionLabel(connectionLabel);
const audio = new ExperienceAudioDirector(new TokenFireAudioDirector(), {
  allowEventSound: () => developmentFixture === null && attention.allowEventSound(),
  isQuiet: readEffectiveQuiet,
});
const renderer = await PixiRenderer.create(canvas, () =>
  readPresentationMotionPolicy(settings.get(), readEffectiveQuiet()),
);
stageLoading.classList.add("is-opening");
window.setTimeout(() => stageLoading.remove(), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 640);
const controller = new AppController(
  source,
  renderer,
  audio,
  experience,
  persistence,
  environment,
  attention,
  packEvents,
  replay,
  view,
  () => interaction?.isActive() ?? false,
  () => {
    if (developmentFixture) applyDevelopmentFixture?.(developmentFixture);
  },
  readEffectiveQuiet,
);
interaction = new InteractionController(shell, () => controller.getWorld(), controller.getCharacterDirector());
let briefing!: OpeningBriefing;
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
    setSurfaceOpen(open);
  },
  () => briefing.show(),
);
briefing = new OpeningBriefing(
  shell,
  () => settings.update({ openingBriefingSeen: true }),
  (open) => {
    if (open) stopDirectInteraction();
    setSurfaceOpen(open);
  },
);
controller.subscribe((world, snapshot) => {
  if (developmentFixture) applyDevelopmentFixture?.(developmentFixture);
  const scene = readWorldScene(world, snapshot);
  if (interaction?.isActive() && (scene === "approval" || scene === "kirari" || scene === "zero-output")) stopDirectInteraction();
  interaction?.update(world, snapshot);
  controlCenter.update(world, snapshot);
  shell.dataset.attention = settings.get().attention.mode;
  shell.classList.toggle("is-quiet", readEffectiveQuiet());
  shell.classList.toggle("reduce-flash", settings.get().attention.reduceFlash);
});
controller.start();
if (!developmentFixture && !settings.get().openingBriefingSeen) requestAnimationFrame(() => briefing.show());
if (developmentFixture) {
  sourceButton.disabled = true;
  const sourceLabel = sourceButton.querySelector<HTMLElement>("span");
  if (sourceLabel) sourceLabel.textContent = "固定Fixture";
  setMenuMeta(sourceButton, developmentFixture.scene.toUpperCase());
  sourceButton.setAttribute("aria-label", `開発fixture · ${developmentFixture.scene}`);
} else if (!isDesktop) {
  controller.setMode("demo");
  sourceButton.disabled = true;
  const sourceLabel = sourceButton.querySelector<HTMLElement>("span");
  if (sourceLabel) sourceLabel.textContent = "Codex監視";
  setMenuMeta(sourceButton, "デスクトップ版で利用可能");
  sourceButton.setAttribute("aria-label", "Codex監視はデスクトップ版で利用可能");
  sourceButton.title = "Codex監視はデスクトップ版で利用できます";
}

const renderSoundButton = (): void => {
  if (developmentFixture) {
    soundButton.disabled = true;
    setMenuMeta(soundButton, "固定Fixtureでは無音");
    soundButton.setAttribute("aria-label", "サウンド · 固定Fixtureでは無音");
    soundButton.setAttribute("aria-pressed", "false");
    soundButton.title = "固定Fixtureではサウンドを再生しません";
    return;
  }
  soundButton.disabled = !audio.supported;
  setMenuMeta(soundButton, audio.supported ? (audio.enabled ? "ON" : "OFF") : "利用不可");
  soundButton.setAttribute("aria-label", audio.supported ? `サウンド · ${audio.enabled ? "ON" : "OFF"}` : "サウンド · 利用不可");
  soundButton.setAttribute("aria-pressed", String(audio.enabled));
  soundButton.title = !audio.supported ? "この環境ではサウンドを利用できません" : audio.enabled ? "サウンドをミュート（M）" : "サウンドを有効化（M）";
};

const renderQuietButton = (): void => {
  const quiet = readEffectiveQuiet();
  setToolbarLabel(quietButton, quiet ? "再開" : "幕間");
  quietButton.setAttribute("aria-label", quiet ? "WAKE · 幕間を終了（Q）" : "QUIET · 30分の幕間（Q）");
  quietButton.setAttribute("aria-pressed", String(quiet));
};
renderSoundButton();
renderQuietButton();
settings.addEventListener("change", renderQuietButton);

const unlockAudio = (): void => {
  if (!developmentFixture) void audio.unlock();
};
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio);

playButton.addEventListener("click", () => {
  toolbar.classList.remove("is-inviting");
  const enabled = interaction?.toggle() ?? false;
  playButton.setAttribute("aria-pressed", String(enabled));
  setToolbarLabel(playButton, enabled ? "完了" : "遊ぶ");
  playButton.setAttribute("aria-label", enabled ? "PLAYを終了（P）" : "PLAY · キャラクターへ触る（P）");
  if (enabled && !settings.get().playIntroSeen) showPlayIntro(true);
});
ledgerButton.addEventListener("click", () => {
  closeMenu();
  experience.toggleRealityCheck(false);
  controlCenter.toggle();
});
quietButton.addEventListener("click", () => {
  if (developmentFixture) return;
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
  setMenuMeta(sizeButton, `${sizes[currentSize].width} × ${sizes[currentSize].height}`);
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
  if (developmentFixture) return;
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

const updateLayoutMode = (): void => {
  shell.dataset.layout = readStageLayoutMode(shell.clientWidth);
};
const layoutObserver = new ResizeObserver(updateLayoutMode);
layoutObserver.observe(shell);
updateLayoutMode();

window.addEventListener("beforeunload", () => {
  layoutObserver.disconnect();
  controller.stop();
}, { once: true });
window.addEventListener("keydown", (event) => {
  if (shouldIgnoreGlobalShortcut(event, shell, !menu.hidden)) return;
  const key = event.key.toLowerCase();
  if (key === "d" && isDesktop && !developmentFixture) controller.setMode(currentSource === "codex" ? "demo" : "codex");
  if (key === "m" && !event.repeat && !developmentFixture) void audio.toggle().then(renderSoundButton);
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
  const open = force ?? Boolean(menu.hidden);
  menu.hidden = !open;
  menu.inert = !open;
  menu.toggleAttribute("inert", !open);
  menuButton.setAttribute("aria-expanded", String(open));
  setSurfaceOpen(open);
  if (open) menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  else if (document.activeElement && menu.contains(document.activeElement)) menuButton.focus();
}

function setSurfaceOpen(open: boolean): void {
  shell.classList.toggle("has-overlay", open);
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
