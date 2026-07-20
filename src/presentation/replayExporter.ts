import type { ReplayFrame, ReplaySession } from "../domain/experienceData";

export const exportReplayData = (replay: ReplaySession): void => {
  downloadBlob(new Blob([JSON.stringify(replay, null, 2)], { type: "application/json" }), `${safeName(replay.title)}.token-fire.json`);
};

export const exportReplayVideo = async (replay: ReplaySession): Promise<"video" | "data"> => {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext("2d");
  if (!context || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
    exportReplayData(replay);
    return "data";
  }

  const stream = canvas.captureStream(30);
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) {
    exportReplayData(replay);
    return "data";
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  recorder.start(250);

  const videoDuration = Math.max(7, Math.min(18, 7 + replay.frames.length / 75));
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const draw = (now: number): void => {
      const progress = Math.min(1, (now - started) / (videoDuration * 1000));
      const frameIndex = Math.min(replay.frames.length - 1, Math.floor(progress * replay.frames.length));
      renderReplayFrame(context, canvas, replay, replay.frames[Math.max(0, frameIndex)], progress);
      if (progress < 1) requestAnimationFrame(draw);
      else resolve();
    };
    requestAnimationFrame(draw);
  });

  recorder.stop();
  await stopped;
  for (const track of stream.getTracks()) track.stop();
  downloadBlob(new Blob(chunks, { type: mimeType }), `${safeName(replay.title)}.webm`);
  return "video";
};

const renderReplayFrame = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  replay: ReplaySession,
  frame: ReplayFrame,
  progress: number,
): void => {
  const active = frame.active || frame.heat > 0.32;
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  if (active) {
    sky.addColorStop(0, `rgb(${60 + Math.round(frame.heat * 75)}, 45, 53)`);
    sky.addColorStop(1, "#59452f");
  } else {
    sky.addColorStop(0, "#79b4c8");
    sky.addColorStop(1, "#587d54");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = active ? "#6b563d" : "#668355";
  ctx.beginPath();
  ctx.ellipse(450, 455, 520, 150, 0, 0, Math.PI * 2);
  ctx.fill();

  drawReplayTrees(ctx, frame);
  drawReplayFactory(ctx, frame, progress);
  drawReplayLake(ctx, frame);

  ctx.fillStyle = "rgba(20,18,20,.78)";
  ctx.fillRect(34, 28, 892, 78);
  ctx.fillStyle = "#ffd36b";
  ctx.font = "700 25px system-ui, sans-serif";
  ctx.fillText(replay.projectLabel, 58, 62);
  ctx.fillStyle = "#f4ead8";
  ctx.font = "600 17px ui-monospace, monospace";
  ctx.fillText(`${frame.taskTokens.toLocaleString()} TOK · ENERGY ${frame.energyLevel + 1}/24 · FACTORY ${frame.growthLevel + 1}/24`, 58, 90);

  ctx.fillStyle = "rgba(20,18,20,.72)";
  ctx.fillRect(34, 478, 892, 38);
  ctx.fillStyle = active ? "#ffc24a" : "#c9f0d4";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText(frame.event ? String(frame.event).toUpperCase() : active ? "TOKEN INCINERATION" : "PLANTATION CHILL", 52, 503);

  const barWidth = 860 * progress;
  ctx.fillStyle = "rgba(255,255,255,.16)";
  ctx.fillRect(50, 526, 860, 5);
  ctx.fillStyle = active ? "#f2aa3f" : "#9bd3a5";
  ctx.fillRect(50, 526, barWidth, 5);
};

const drawReplayTrees = (ctx: CanvasRenderingContext2D, frame: ReplayFrame): void => {
  for (let index = 0; index < frame.trees.length; index += 1) {
    const column = index % 14;
    const row = Math.floor(index / 14);
    const x = 55 + column * 37 + row * 8;
    const y = 398 - row * 88 + Math.sin(index * 1.7) * 4;
    const stage = frame.trees[index];
    ctx.strokeStyle = "#4a3023";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y + 28);
    ctx.lineTo(x, y - 5);
    ctx.stroke();
    if (stage === "c") {
      ctx.fillStyle = "#302825";
      ctx.fillRect(x - 8, y - 14, 16, 13);
    } else if (stage === "b") {
      ctx.fillStyle = "#ff8a2a";
      ctx.beginPath();
      ctx.arc(x, y - 18, 17, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = stage === "s" ? "#8fc46b" : "#4f995e";
      ctx.beginPath();
      ctx.arc(x, y - 17, stage === "s" ? 10 : 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

const drawReplayFactory = (ctx: CanvasRenderingContext2D, frame: ReplayFrame, progress: number): void => {
  const x = 655;
  const y = 365;
  ctx.fillStyle = "#3c3c40";
  ctx.fillRect(x, y - 135, 190, 135);
  ctx.fillStyle = `rgba(255,126,38,${0.35 + frame.heat * 0.65})`;
  ctx.fillRect(x + 65, y - 65, 62, 55);
  const chimneys = 1 + Math.floor(frame.growthLevel / 5);
  for (let index = 0; index < chimneys; index += 1) {
    const height = 75 + (index % 3) * 18 + frame.growthLevel * 1.4;
    ctx.fillStyle = "#55565a";
    ctx.fillRect(x + 18 + index * 32, y - 135 - height, 22, height);
    if (frame.active) {
      ctx.fillStyle = `rgba(68,58,61,${0.35 + frame.pollution * 0.55})`;
      ctx.beginPath();
      ctx.arc(x + 29 + index * 32 + Math.sin(progress * 25 + index) * 9, y - 150 - height, 18 + frame.pollution * 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

const drawReplayLake = (ctx: CanvasRenderingContext2D, frame: ReplayFrame): void => {
  ctx.fillStyle = frame.heat > 0.7 ? "rgba(115,125,117,.8)" : "rgba(69,163,191,.88)";
  ctx.beginPath();
  ctx.ellipse(850, 420, 90, Math.max(15, 54 * frame.water), 0, 0, Math.PI * 2);
  ctx.fill();
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const safeName = (name: string): string =>
  name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "token-fire-replay";
