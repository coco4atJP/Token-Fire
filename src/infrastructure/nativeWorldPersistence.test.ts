import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createWorld } from "../domain/world";
import { createNativeWorldPersistence } from "./nativeWorldPersistence";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("native世界保存境界", () => {
  beforeEach(() => { localStorage.clear(); vi.mocked(invoke).mockReset(); });
  it("native読込完了後にproject単位のIPCだけを書き込む", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]).mockResolvedValue(undefined);
    const persistence = await createNativeWorldPersistence();
    const world = createWorld({ projectKey: "native" });
    persistence.save(world); await persistence.flush();
    expect(invoke).toHaveBeenNthCalledWith(1, "read_world_projects");
    expect(invoke).toHaveBeenNthCalledWith(2, "write_world_project", {
      key: "native", data: expect.any(String),
    });
    expect(localStorage.length).toBe(0);
  });
  it("native読込失敗はWebViewへfallbackせず起動呼出し元へ返す", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("read denied"));
    await expect(createNativeWorldPersistence()).rejects.toThrow("read denied");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
  });
});
