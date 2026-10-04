import { invoke } from "@tauri-apps/api/core";
import { BrowserWorldPersistence, type ProjectStorage } from "./worldPersistence";

/** Tauri起動時に読込を完了してからcontrollerを作る。失敗時はWebView保存へ逃がさない。 */
export const createNativeWorldPersistence = async (): Promise<BrowserWorldPersistence> => {
  const records = await invoke<string[]>("read_world_projects");
  const storage: ProjectStorage = {
    read: () => records,
    write: (key, data) => invoke<void>("write_world_project", { key, data }),
  };
  return new BrowserWorldPersistence(storage);
};
