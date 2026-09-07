import { invoke } from "@tauri-apps/api/core";
import type { PlatformBridge } from "./platformBridge";

interface NativeWindowSnapshot {
  platform: string;
  scaleFactor: number;
  innerWidth: number;
  innerHeight: number;
  visible: boolean;
  focused: boolean;
}

interface OptionalPlatformChecks {
  autostartInitial: boolean;
  autostartEnabled: boolean;
  autostartRestored: boolean;
  hideShowCompleted: boolean;
  notificationSent: boolean;
}

const transparent = (value: string): boolean => value === "transparent" || value === "rgba(0, 0, 0, 0)";

export const collectOsE2ESnapshot = (
  reason: string,
  key: string | null,
  native: NativeWindowSnapshot | null,
  optional: OptionalPlatformChecks | null = null,
): Record<string, unknown> => {
  const shell = document.querySelector<HTMLElement>(".shell");
  const canvas = document.querySelector<HTMLCanvasElement>("#world");
  const controlCenter = document.querySelector<HTMLElement>(".control-center");
  const selectedTab = document.querySelector<HTMLElement>(".control-center [role=tab][aria-selected=true]");
  const htmlBackground = getComputedStyle(document.documentElement).backgroundColor;
  const bodyBackground = getComputedStyle(document.body).backgroundColor;
  const shellRect = shell?.getBoundingClientRect();

  return {
    schema: 1,
    at: new Date().toISOString(),
    reason,
    key,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
    devicePixelRatio: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    shell: shellRect ? { width: shellRect.width, height: shellRect.height } : null,
    canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
    transparentCss: transparent(htmlBackground) && transparent(bodyBackground),
    htmlBackground,
    bodyBackground,
    quiet: document.querySelector("#quiet-button")?.getAttribute("aria-pressed") === "true",
    quietClass: shell?.classList.contains("is-quiet") ?? false,
    play: document.querySelector("#play-button")?.getAttribute("aria-pressed") === "true",
    controlCenterOpen: Boolean(controlCenter && !controlCenter.hidden),
    activeTab: selectedTab?.dataset.tab ?? null,
    replayItems: document.querySelectorAll(".replay-item").length,
    replayThumbnails: document.querySelectorAll("[data-replay-thumbnail]").length,
    replayThumbnailsReady: document.querySelectorAll("[data-replay-thumbnail][aria-busy=false]").length,
    activeElement: document.activeElement instanceof HTMLElement
      ? document.activeElement.getAttribute("aria-label") ?? document.activeElement.dataset.tab ?? document.activeElement.tagName
      : null,
    native,
    optional,
  };
};

const readNativeSnapshot = async (): Promise<NativeWindowSnapshot | null> => {
  try {
    return await invoke<NativeWindowSnapshot>("os_e2e_platform_snapshot");
  } catch {
    return null;
  }
};

const writeSnapshot = async (
  reason: string,
  key: string | null,
  optional: OptionalPlatformChecks | null = null,
): Promise<void> => {
  const report = collectOsE2ESnapshot(reason, key, await readNativeSnapshot(), optional);
  await invoke("write_os_e2e_report", { report: JSON.stringify(report) });
};

const withTimeout = async <T>(work: Promise<T>, fallback: T, milliseconds = 4_000): Promise<T> => {
  let timeout = 0;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => { timeout = window.setTimeout(() => resolve(fallback), milliseconds); }),
    ]);
  } finally {
    window.clearTimeout(timeout);
  }
};

const setAutostartWithRetry = async (platform: PlatformBridge, enabled: boolean): Promise<boolean> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = await withTimeout(platform.setAutostart(enabled), !enabled);
    if (observed === enabled) return observed;
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  return withTimeout(platform.getAutostart(), !enabled);
};

const runOptionalPlatformChecks = async (platform: PlatformBridge): Promise<void> => {
  const autostartInitial = await withTimeout(platform.getAutostart(), false);
  const autostartEnabled = await setAutostartWithRetry(platform, true);
  const autostartRestored = await setAutostartWithRetry(platform, autostartInitial);
  await platform.hideWindow();
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  await platform.showWindow();
  const notificationSent = await withTimeout(
    platform.notify("Token-Fire OS E2E", "hosted runner notification contract"),
    false,
  );
  await writeSnapshot("platform-checks", null, {
    autostartInitial,
    autostartEnabled,
    autostartRestored: autostartRestored === autostartInitial,
    hideShowCompleted: true,
    notificationSent,
  });
};

export const installOsE2EHarness = (platform: PlatformBridge): void => {
  let pending = Promise.resolve();
  const queue = (reason: string, key: string | null, delay = 350): void => {
    window.setTimeout(() => {
      pending = pending.then(() => writeSnapshot(reason, key));
    }, delay);
  };

  window.addEventListener("keydown", (event) => queue("keydown", event.key), { capture: true });
  document.addEventListener("visibilitychange", () => queue("visibilitychange", null, 100));
  queue("startup", null, 1_200);
  window.setTimeout(() => { void runOptionalPlatformChecks(platform); }, 1_800);
};
