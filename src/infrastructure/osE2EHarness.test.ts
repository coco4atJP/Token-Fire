import { beforeEach, describe, expect, it } from "vitest";
import { collectOsE2ESnapshot } from "./osE2EHarness";

describe("OS E2E snapshot", () => {
  beforeEach(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.innerHTML = `
      <main class="shell is-quiet">
        <button id="quiet-button" aria-pressed="true"></button>
        <button id="play-button" aria-pressed="false"></button>
        <canvas id="world" width="1120" height="700"></canvas>
        <section class="control-center">
          <button role="tab" data-tab="replays" aria-selected="true"></button>
          <article class="replay-item"><span data-replay-thumbnail="one" aria-busy="false"></span></article>
        </section>
      </main>`;
  });

  it("records the keyboard-visible presentation contract without domain data", () => {
    const snapshot = collectOsE2ESnapshot("keydown", "q", {
      platform: "windows",
      scaleFactor: 1.5,
      innerWidth: 560,
      innerHeight: 350,
      visible: true,
      focused: true,
    });

    expect(snapshot).toMatchObject({
      schema: 1,
      reason: "keydown",
      key: "q",
      transparentCss: true,
      quiet: true,
      quietClass: true,
      controlCenterOpen: true,
      activeTab: "replays",
      replayItems: 1,
      replayThumbnails: 1,
    });
    expect(JSON.stringify(snapshot)).not.toContain("totalTokensBurned");
  });
});
