const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const readFocusableElements = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.tabIndex >= 0 && !element.hidden && !element.closest("[hidden], [inert]"));

/**
 * dialog内だけでTab移動を循環させる。見た目やpanel実装には依存しないため、
 * Ledger、Soto Note、初回説明で同じkeyboard境界を共有できる。
 */
export const trapTabKey = (root: HTMLElement, event: KeyboardEvent): boolean => {
  if (event.key !== "Tab") return false;
  const focusable = readFocusableElements(root);
  if (focusable.length === 0) {
    event.preventDefault();
    root.focus();
    return true;
  }

  const first = focusable[0];
  const last = focusable.at(-1) ?? first;
  const active = document.activeElement;
  if (!focusable.includes(active as HTMLElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
};
