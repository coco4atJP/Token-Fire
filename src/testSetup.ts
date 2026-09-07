// Node自身のStorageではなく、各テストのjsdomが持つStorageを使う。
// Node 26では名前が存在しても未設定のlocalStorageがundefinedになる。
const testDom = (globalThis as typeof globalThis & {
  jsdom?: { window: Window };
}).jsdom;
if (testDom) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: testDom.window.localStorage,
  });
}

if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  });
}
