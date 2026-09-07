/** modal・menu・入力編集中に、window shortcutが背景操作へ抜けるのを防ぐ。 */
export const shouldIgnoreGlobalShortcut = (
  event: KeyboardEvent,
  shell: HTMLElement,
  menuOpen: boolean,
): boolean => {
  if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return true;
  if (event.key === "Escape") return false;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"))) return true;
  const dialogOpen = shell.querySelector<HTMLElement>("[aria-modal='true']:not([hidden])") !== null;
  return dialogOpen || menuOpen;
};
