export const STAGE_WIDTH = 320;
export const STAGE_HEIGHT = 192;

export interface StagePoint {
  x: number;
  y: number;
}

export interface StageRect extends StagePoint {
  width: number;
  height: number;
}

/**
 * PixiとDOM操作面が共有する320×192のcontain投影。
 * ウィンドウの余白や縦横比はpresentation境界で吸収し、domain座標へ漏らさない。
 */
export class StageViewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
    this.offsetX = (width - STAGE_WIDTH * this.scale) / 2;
    this.offsetY = (height - STAGE_HEIGHT * this.scale) / 2;
  }

  static measure(element: Element): StageViewport {
    const rect = element.getBoundingClientRect();
    return new StageViewport(Math.max(1, rect.width), Math.max(1, rect.height));
  }

  project(point: StagePoint): StagePoint {
    return {
      x: this.offsetX + point.x * this.scale,
      y: this.offsetY + point.y * this.scale,
    };
  }

  projectRect(rect: StageRect): StageRect {
    const point = this.project(rect);
    return {
      ...point,
      width: rect.width * this.scale,
      height: rect.height * this.scale,
    };
  }

  unproject(clientX: number, clientY: number, bounds: DOMRect): StagePoint {
    return {
      x: (clientX - bounds.left - this.offsetX) / this.scale,
      y: (clientY - bounds.top - this.offsetY) / this.scale,
    };
  }
}
