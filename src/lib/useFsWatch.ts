import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function useFsWatch(path: string, key: string, recursive: boolean, onChange: () => void) {
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!path) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen<string>("fs-change", (event) => {
          if (event.payload === key) callback.current();
        });
        if (active) await invoke("start_watch", { path, key, recursive });
      } catch (error) { console.warn("FSX watcher:", error); }
    })();
    return () => {
      active = false;
      unlisten?.();
      void invoke("stop_watch", { key }).catch(() => undefined);
    };
  }, [path, key, recursive]);
}
