import {
  StageViewport,
  type StagePoint,
  type StageRect,
} from "./stageViewport";

export type StageLayoutMode = "compact" | "diorama" | "wide";

export const COMPACT_LAYOUT_MAX_WIDTH = 519;
export const WIDE_LAYOUT_MIN_WIDTH = 720;

export const readStageLayoutMode = (width: number): StageLayoutMode => {
  if (width < 520) return "compact";
  if (width < WIDE_LAYOUT_MIN_WIDTH) return "diorama";
  return "wide";
};

/**
 * Pixi、DOM Overlay、PLAY操作面が共有する表示契約。
 * breakpointと舞台投影をpresentation内で一度だけ決め、domainへ画面寸法を漏らさない。
 */
export class SceneLayout {
  readonly mode: StageLayoutMode;
  readonly viewport: StageViewport;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.mode = readStageLayoutMode(width);
    this.viewport = new StageViewport(Math.max(1, width), Math.max(1, height));
  }

  static measure(element: Element): SceneLayout {
    return new SceneLayout(
      Math.max(1, element.clientWidth),
      Math.max(1, element.clientHeight),
    );
  }

  project(point: StagePoint): StagePoint {
    return this.viewport.project(point);
  }

  projectRect(rect: StageRect): StageRect {
    return this.viewport.projectRect(rect);
  }

  unproject(clientX: number, clientY: number, bounds: DOMRect): StagePoint {
    return this.viewport.unproject(clientX, clientY, bounds);
  }
}
