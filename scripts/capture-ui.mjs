#!/usr/bin/env node
/**
 * Token-Fire visual acceptance capture.
 *
 * - launches an installed Chrome in headless mode through CDP
 * - renders the development fixture at DPR 2
 * - stores the native @2x frame and a 1 image px / 1 CSS px frame
 * - fails on browser console errors, wrong image dimensions, or unstable pixels
 *
 * Examples:
 *   node scripts/capture-ui.mjs
 *   node scripts/capture-ui.mjs --scenes mera,approval --viewports 560x350
 *   node scripts/capture-ui.mjs --verify-determinism --scenes mera --viewports 560x350
 *   node scripts/capture-ui.mjs --baseline artifacts/ui-audit/improvement-v1-baseline
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")
    ? argv[index + 1]
    : fallback;
};
const hasFlag = (name) => argv.includes(`--${name}`);

const ALL_SCENES = ["poka", "mera", "gogo", "approval", "kirari", "zero-output", "meguri"];
const DEFAULT_VIEWPORTS = ["380x240", "560x350", "800x480"];
const parseList = (value) => value.split(",").map((entry) => entry.trim()).filter(Boolean);
const parseViewport = (value) => {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) throw new Error(`invalid viewport: ${value}`);
  return { label: value, width: Number(match[1]), height: Number(match[2]) };
};

const options = {
  baseUrl: argument("url", "http://127.0.0.1:1420"),
  out: resolve(argument("out", "artifacts/ui-audit/improvement-v1")),
  baseline: argument("baseline", null),
  scenes: parseList(argument("scenes", ALL_SCENES.join(","))),
  viewports: parseList(argument("viewports", DEFAULT_VIEWPORTS.join(","))).map(parseViewport),
  time: argument("time", "dusk"),
  growth: Number(argument("growth", "18")),
  elapsed: Number(argument("elapsed", "120")),
  verifyDeterminism: hasFlag("verify-determinism"),
  measurePerformance: hasFlag("measure-performance"),
  noServer: hasFlag("no-server"),
  failOnDiff: hasFlag("fail-on-diff"),
};
if (options.baseline) options.baseline = resolve(options.baseline);

for (const scene of options.scenes) {
  if (!ALL_SCENES.includes(scene)) throw new Error(`unknown fixture scene: ${scene}`);
}
if (!Number.isInteger(options.growth) || options.growth < 0 || options.growth > 23) {
  throw new Error(`growth must be an integer from 0 through 23: ${options.growth}`);
}

const CHROME_CANDIDATES = [
  process.env.TOKEN_FIRE_CHROME_PATH,
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : null,
  process.env["PROGRAMFILES(X86)"] ? join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe") : null,
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : null,
  process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe") : null,
].filter(Boolean);
const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!chromePath) {
  throw new Error("Chrome/Chromium was not found. Set TOKEN_FIRE_CHROME_PATH to its executable.");
}

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pngSize = (bytes) => {
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") throw new Error("capture is not a PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const waitForUrl = async (url, attempts = 120) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Vite is still starting.
    }
    await sleep(100);
  }
  return false;
};

let viteProcess = null;
const ensureServer = async () => {
  if (await waitForUrl(options.baseUrl, 2)) return;
  if (options.noServer) throw new Error(`capture URL is unavailable: ${options.baseUrl}`);
  const url = new URL(options.baseUrl);
  viteProcess = spawn("npm", ["run", "dev", "--", "--host", url.hostname, "--port", url.port || "1420", "--strictPort"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let startupError = "";
  viteProcess.stderr.on("data", (chunk) => { startupError += String(chunk); });
  if (!(await waitForUrl(options.baseUrl))) {
    throw new Error(`Vite did not become ready.\n${startupError}`);
  }
};

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveRequest, rejectRequest) => {
      const timeout = setTimeout(() => {
        if (this.pending.delete(id)) rejectRequest(new Error(`${method} timed out`));
      }, 30_000);
      this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timeout });
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "evaluation failed");
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

const connect = async (port) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl);
      if (target) {
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolveSocket, rejectSocket) => {
          socket.addEventListener("open", resolveSocket, { once: true });
          socket.addEventListener("error", rejectSocket, { once: true });
        });
        return new CDP(socket);
      }
    } catch {
      // Chrome is still exposing the debugging target.
    }
    await sleep(100);
  }
  throw new Error("could not attach to the Chrome page target");
};

const launchChrome = async () => {
  const profile = mkdtempSync(join(tmpdir(), "token-fire-capture-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-breakpad",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=Translate,BackForwardCache",
    "--disable-renderer-backgrounding",
    "--hide-scrollbars",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  chrome.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const portFile = join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(portFile)) {
      const port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
      if (port) return { chrome, cdp: await connect(port), profile };
    }
    await sleep(100);
  }
  chrome.kill("SIGTERM");
  throw new Error(`Chrome did not expose a DevTools port.\n${stderr}`);
};

const stopProcess = async (process) => {
  if (process.exitCode !== null || process.signalCode !== null) return;
  await new Promise((resolveExit) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolveExit();
    };
    process.once("exit", finish);
    process.kill("SIGTERM");
    setTimeout(finish, 3_000);
  });
};

const consoleErrors = [];
const normalizeConsoleArgument = (argumentValue) => argumentValue.value ?? argumentValue.description ?? argumentValue.type;

const captureFrame = async (cdp, scale, clip = { x: 0, y: 0, width: currentViewport.width, height: currentViewport.height }) => {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { ...clip, scale },
  });
  return Buffer.from(result.data, "base64");
};

const comparePngPixels = async (cdp, first, second, includeDiff = false) => cdp.evaluate(`(async () => {
  const decode = async (base64) => {
    const response = await fetch('data:image/png;base64,' + base64);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
  };
  const a = await decode(${JSON.stringify(first.toString("base64"))});
  const b = await decode(${JSON.stringify(second.toString("base64"))});
  if (a.width !== b.width || a.height !== b.height) return { mismatch: -1, maxDelta: 255, bounds: null, diffDataUrl: null };
  let mismatch = 0;
  let maxDelta = 0;
  let minX = a.width;
  let minY = a.height;
  let maxX = -1;
  let maxY = -1;
  const diff = ${includeDiff ? "new Uint8ClampedArray(a.data.length)" : "null"};
  for (let index = 0; index < a.data.length; index += 1) {
    const delta = Math.abs(a.data[index] - b.data[index]);
    if (delta > 0) {
      mismatch += 1;
      const pixel = Math.floor(index / 4);
      const x = pixel % a.width;
      const y = Math.floor(pixel / a.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (delta > maxDelta) maxDelta = delta;
  }
  let diffDataUrl = null;
  if (diff) {
    for (let pixel = 0; pixel < a.width * a.height; pixel += 1) {
      const offset = pixel * 4;
      const delta = Math.max(
        Math.abs(a.data[offset] - b.data[offset]),
        Math.abs(a.data[offset + 1] - b.data[offset + 1]),
        Math.abs(a.data[offset + 2] - b.data[offset + 2]),
        Math.abs(a.data[offset + 3] - b.data[offset + 3]),
      );
      if (delta > 0) {
        diff[offset] = 255;
        diff[offset + 1] = Math.max(0, 96 - delta);
        diff[offset + 2] = 170;
        diff[offset + 3] = Math.max(96, delta);
      } else {
        const gray = Math.round((a.data[offset] + a.data[offset + 1] + a.data[offset + 2]) / 12);
        diff[offset] = gray;
        diff[offset + 1] = gray;
        diff[offset + 2] = gray;
        diff[offset + 3] = 72;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = a.width;
    canvas.height = a.height;
    canvas.getContext('2d').putImageData(new ImageData(diff, a.width, a.height), 0, 0);
    diffDataUrl = canvas.toDataURL('image/png');
  }
  return { mismatch, maxDelta, bounds: mismatch ? { minX, minY, maxX, maxY } : null, diffDataUrl };
})()`);

let currentViewport = options.viewports[0];
const main = async () => {
  await ensureServer();
  mkdirSync(options.out, { recursive: true });
  const { chrome, cdp, profile } = await launchChrome();
  cdp.on("Runtime.consoleAPICalled", (params) => {
    if (params.type === "error" || params.type === "assert") {
      consoleErrors.push(params.args.map(normalizeConsoleArgument).join(" "));
    }
  });
  cdp.on("Runtime.exceptionThrown", (params) => {
    consoleErrors.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? "uncaught exception");
  });
  cdp.on("Log.entryAdded", (params) => {
    if (params.entry?.level === "error") consoleErrors.push(params.entry.text);
  });
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Log.enable"),
  ]);

  const manifest = [];
  try {
    for (const viewport of options.viewports) {
      currentViewport = viewport;
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 2,
        mobile: false,
        screenWidth: viewport.width,
        screenHeight: viewport.height,
      });
      for (const scene of options.scenes) {
        const query = new URLSearchParams({
          tfFixture: scene,
          tfTime: options.time,
          tfGrowth: String(options.growth),
          tfWidth: String(viewport.width),
          tfHeight: String(viewport.height),
          tfElapsed: String(options.elapsed),
          tfCapture: "1",
        });
        const pageUrl = `${options.baseUrl}/?${query}`;
        consoleErrors.length = 0;
        await cdp.send("Page.navigate", { url: pageUrl });
        for (let attempt = 0; attempt < 180; attempt += 1) {
          const ready = await cdp.evaluate(`(() => {
            const canvas = document.querySelector('canvas');
            const loading = document.querySelector('.stage-loading');
            return document.readyState === 'complete'
              && !!canvas
              && canvas.width > 0
              && (!loading || !loading.isConnected)
              && document.fonts.status === 'loaded'
              && !!window.__tokenFireCapture
              && window.__tokenFireCapture.elapsed() === ${JSON.stringify(options.elapsed)};
          })()`).catch(() => false);
          if (ready) break;
          if (attempt === 179) throw new Error(`${scene} ${viewport.label}: page did not become capture-ready`);
          await sleep(50);
        }
        await cdp.evaluate("window.__tokenFireCapture.render()");
        await cdp.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");

        const native = await captureFrame(cdp, 1);
        const normalized = await captureFrame(cdp, 0.5);
        const expectedNative = { width: viewport.width * 2, height: viewport.height * 2 };
        const expectedNormalized = { width: viewport.width, height: viewport.height };
        const nativeSize = pngSize(native);
        const normalizedSize = pngSize(normalized);
        if (nativeSize.width !== expectedNative.width || nativeSize.height !== expectedNative.height) {
          throw new Error(`${scene} ${viewport.label}: @2x PNG is ${nativeSize.width}x${nativeSize.height}`);
        }
        if (normalizedSize.width !== expectedNormalized.width || normalizedSize.height !== expectedNormalized.height) {
          throw new Error(`${scene} ${viewport.label}: normalized PNG is ${normalizedSize.width}x${normalizedSize.height}`);
        }
        if (consoleErrors.length > 0) {
          throw new Error(`${scene} ${viewport.label}: browser error(s)\n${consoleErrors.join("\n")}`);
        }
        const uiContract = await cdp.evaluate(`(() => {
          const visible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          };
          const tickerText = [...document.querySelectorAll('.stage-ticker strong, .stage-ticker span, .stage-ticker small')].filter(visible);
          const controls = [...document.querySelectorAll('.toolbar button')].filter(visible);
          return {
            viewportOverflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            viewportOverflowY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
            tickerTextMinPx: Math.min(...tickerText.map((element) => parseFloat(getComputedStyle(element).fontSize))),
            tickerTextClipped: tickerText.filter((element) => element.scrollWidth > element.clientWidth + 0.5).length,
            toolbarMinWidthPx: Math.min(...controls.map((element) => element.getBoundingClientRect().width)),
            toolbarMinHeightPx: Math.min(...controls.map((element) => element.getBoundingClientRect().height)),
          };
        })()`);
        if (
          uiContract.viewportOverflowX !== 0
          || uiContract.viewportOverflowY !== 0
          || uiContract.tickerTextMinPx < 12
          || uiContract.tickerTextClipped !== 0
          || uiContract.toolbarMinWidthPx < 32
          || uiContract.toolbarMinHeightPx < 32
        ) throw new Error(`${scene} ${viewport.label}: UI contract failed ${JSON.stringify(uiContract)}`);

        const stem = `scene-${scene}-${viewport.label}`;
        writeFileSync(join(options.out, `${stem}@2x.png`), native);
        writeFileSync(join(options.out, `${stem}.png`), normalized);
        let baselineDiff = null;
        if (options.baseline) {
          const baselinePath = join(options.baseline, `${stem}.png`);
          if (!existsSync(baselinePath)) throw new Error(`${scene} ${viewport.label}: baseline is missing ${baselinePath}`);
          const comparison = await comparePngPixels(cdp, readFileSync(baselinePath), normalized, true);
          const { diffDataUrl, ...diffMetrics } = comparison;
          baselineDiff = diffMetrics;
          if (diffDataUrl) {
            writeFileSync(join(options.out, `${stem}-diff.png`), Buffer.from(diffDataUrl.split(",")[1], "base64"));
          }
          if (options.failOnDiff && comparison.mismatch !== 0) {
            throw new Error(`${scene} ${viewport.label}: baseline differs in ${comparison.mismatch} channel values (max delta ${comparison.maxDelta}, bounds ${JSON.stringify(comparison.bounds)})`);
          }
        }
        let deterministicPixels = null;
        if (options.verifyDeterminism) {
          const firstDataUrl = await cdp.evaluate("window.__tokenFireCapture.render()");
          const repeatedDataUrl = await cdp.evaluate("window.__tokenFireCapture.render()");
          const pixiFirst = Buffer.from(firstDataUrl.split(",")[1], "base64");
          const pixiRepeated = Buffer.from(repeatedDataUrl.split(",")[1], "base64");
          deterministicPixels = await comparePngPixels(cdp, pixiFirst, pixiRepeated);
          if (deterministicPixels.mismatch !== 0) {
            writeFileSync(join(options.out, `${stem}-pixi@2x.png`), pixiFirst);
            writeFileSync(join(options.out, `${stem}-pixi-repeat@2x.png`), pixiRepeated);
            throw new Error(`${scene} ${viewport.label}: repeated render differs in ${deterministicPixels.mismatch} channel values (max delta ${deterministicPixels.maxDelta}, bounds ${JSON.stringify(deterministicPixels.bounds)})`);
          }
        }
        const performanceMetrics = options.measurePerformance
          ? await cdp.evaluate("window.__tokenFireCapture.measure(120)")
          : null;
        manifest.push({
          scene,
          viewport: viewport.label,
          dpr: 2,
          normalizedSha256: sha256(normalized),
          nativeSha256: sha256(native),
          consoleErrors: 0,
          deterministicPixels,
          baselineDiff,
          performance: performanceMetrics,
          uiContract,
        });
        process.stdout.write(`PASS ${scene.padEnd(11)} ${viewport.label}\n`);
      }
    }
    writeFileSync(join(options.out, "capture-manifest.json"), `${JSON.stringify({
      capturedAt: new Date().toISOString(),
      chrome: chromePath,
      contract: "DPR 2 rendered; @2x native plus 1 image px / 1 CSS px normalized",
      time: options.time,
      growth: options.growth,
      elapsed: options.elapsed,
      determinismChecked: options.verifyDeterminism,
      baseline: options.baseline,
      failOnDiff: options.failOnDiff,
      captures: manifest,
    }, null, 2)}\n`);
  } finally {
    cdp.close();
    await stopProcess(chrome);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 120 });
    } catch (error) {
      console.warn(`Chrome profile cleanup was deferred: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

main()
  .then(() => {
    viteProcess?.kill("SIGTERM");
    process.stdout.write(`Captured ${options.scenes.length * options.viewports.length} scene/viewport pair(s) to ${options.out}\n`);
  })
  .catch((error) => {
    viteProcess?.kill("SIGTERM");
    console.error(error);
    process.exitCode = 1;
  });
