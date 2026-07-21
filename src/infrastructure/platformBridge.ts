import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

const isTauri = (): boolean => "__TAURI_INTERNALS__" in window;

export class PlatformBridge {
  async notify(title: string, body: string): Promise<boolean> {
    if (!isTauri()) return false;
    try {
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (!granted) return false;
      sendNotification({ title, body });
      return true;
    } catch {
      return false;
    }
  }

  async setAutostart(enabled: boolean): Promise<boolean> {
    if (!isTauri()) return false;
    try {
      if (enabled) await enable();
      else await disable();
      return await isEnabled();
    } catch {
      return false;
    }
  }

  async getAutostart(): Promise<boolean> {
    if (!isTauri()) return false;
    try {
      return await isEnabled();
    } catch {
      return false;
    }
  }

  async hideWindow(): Promise<void> {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().hide();
    } catch {
      // Browser preview has no native window.
    }
  }

  async showWindow(): Promise<void> {
    if (!isTauri()) return;
    try {
      const windowHandle = getCurrentWindow();
      await windowHandle.show();
      await windowHandle.setFocus();
    } catch {
      // The tray remains usable even if focus is rejected by the OS.
    }
  }

  async registerToggleShortcut(handler: () => void): Promise<void> {
    if (!isTauri()) return;
    const shortcut = "CmdOrControl+Shift+F";
    try {
      if (await isRegistered(shortcut)) await unregister(shortcut);
      await register(shortcut, (event) => {
        if (event.state === "Pressed") handler();
      });
    } catch {
      // A shortcut collision should not prevent the app from starting.
    }
  }
}
