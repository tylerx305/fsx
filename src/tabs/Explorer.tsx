import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Entry, Location } from "../types";
import { dateLabel, humanSize, parentPath, readList } from "../lib/format";
import { useFsWatch } from "../lib/useFsWatch";

type SortKey = "name" | "size" | "modified";
type Menu = { x: number; y: number } | null;
const storedSort = () => { try { return (localStorage.getItem("fsx.explorer.sort") as SortKey) || "name"; } catch { return "name"; } };

export default function Explorer({ initialPath, onPathChange, onConnected }: { initialPath: string; onPathChange: (path: string) => void; onConnected: () => void }) {
  const [path, setPath] = useState(""); const [watchPath, setWatchPath] = useState("");
  const [pinned] = useState<string[]>(readList("fsx.projects.pinned"));
  const [draft, setDraft] = useState(""); const [items, setItems] = useState<Entry[]>([]); const [locations, setLocations] = useState<Location[]>([]);
  const [filter, setFilter] = useState(""); const [sort, setSort] = useState<SortKey>(storedSort); const [ascending, setAscending] = useState(true);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [selected, setSelected] = useState<string[]>([]); const [clipboardMode, setClipboardMode] = useState(""); const [menu, setMenu] = useState<Menu>(null);

  const load = useCallback(async (next: string) => {
    setBusy(true); setError("");
    try {
      const resolved = next || await invoke<string>("home_path");
      const rows = await invoke<Entry[]>("list_dir", { path: resolved });
      setItems(rows); setPath(resolved); setDraft(resolved); setWatchPath(resolved); setSelected([]); setMenu(null); onPathChange(resolved); onConnected();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }, [onConnected, onPathChange]);

  useEffect(() => { void load(initialPath); }, [load, initialPath]);
  useEffect(() => { void invoke<Location[]>("get_locations").then(setLocations).catch((e) => setError(String(e))); }, []);
  useFsWatch(watchPath, "explorer", false, () => { void load(path); });
  useEffect(() => { try { localStorage.setItem("fsx.explorer.sort", sort); } catch { /* storage can be disabled */ } }, [sort]);

  const visible = useMemo(() => items.filter((item) => item.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
    .sort((a, b) => { if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      const compared = sort === "name" ? a.name.localeCompare(b.name) : sort === "size" ? a.size - b.size : (a.modified || 0) - (b.modified || 0);
      return ascending ? compared : -compared;
    }), [items, filter, sort, ascending]);

  function chooseSort(key: SortKey) { if (key === sort) setAscending((v) => !v); else { setSort(key); setAscending(true); } }
  function select(entry: Entry, additive: boolean) {
    setSelected((current) => additive ? current.includes(entry.path) ? current.filter((p) => p !== entry.path) : [...current, entry.path] : [entry.path]);
  }
  async function act(command: string, args: Record<string, unknown> = {}) {
    try { await invoke(command, args); setError(""); setMenu(null); await load(path); }
    catch (e) { setError(String(e)); }
  }
  async function createFolder() { const name = window.prompt("Nombre de la carpeta nueva:"); if (name?.trim()) await act("create_folder", { parent: path, name }); }
  async function rename() { if (selected.length !== 1) return; const entry = items.find((e) => e.path === selected[0]); if (!entry) return; const name = window.prompt("Nuevo nombre:", entry.name); if (name?.trim() && name !== entry.name) await act("rename_item", { path: entry.path, newName: name }); }
  async function moveToTrash() {
    if (!selected.length) return;
    const answer = window.confirm(`¿Enviar ${selected.length === 1 ? "este elemento" : `estos ${selected.length} elementos`} a la Papelera de reciclaje?`);
    if (!answer) return;
    try { for (const target of selected) await invoke("trash_item", { path: target }); setError(""); await load(path); }
    catch (e) { setError(String(e)); await load(path); }
  }
  async function clipboard(cut: boolean) {
    try { await invoke("copy_items", { paths: selected, cut }); setClipboardMode(cut ? "Cortar" : "Copiar"); setError(""); }
    catch (e) { setError(String(e)); }
  }
  async function paste() {
    try { await invoke("paste_items", { destination: path }); setClipboardMode(""); setError(""); await load(path); }
    catch (e) { setError(String(e)); }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); void clipboard(false); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") { event.preventDefault(); void clipboard(true); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") { event.preventDefault(); void paste(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelected(visible.map((entry) => entry.path)); }
      else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "n") { event.preventDefault(); void createFolder(); }
      else if (event.key === "F2") { event.preventDefault(); void rename(); }
      else if (event.key === "Delete") { event.preventDefault(); void moveToTrash(); }
      else if (event.key === "Escape") { setSelected([]); setMenu(null); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  return <>
    <div className="location-grid" aria-label="Carpetas principales">{locations.map((location) => <button className="location-card" key={location.path} title={location.path} onClick={() => void load(location.path)}><span className={`location-icon ${location.name.includes("equipo") || location.name.startsWith("Unidad") ? "computer" : ""}`}>{location.icon}</span><span><b>{location.name}</b><small>{location.group}</small></span></button>)}</div>
    {pinned.length > 0 && <div className="pinned-paths"><span>Fijados</span>{pinned.map((target) => <button key={target} title={target} onClick={() => void load(target)}>★ {target.split(/[\\/]/).filter(Boolean).pop() || target}</button>)}</div>}
    <div className="toolbar explorer-toolbar">
      <button className="small-action" title="Carpeta anterior" onClick={() => void load(parentPath(path))}>←</button>
      <div className="path-box"><span>⌕</span><input aria-label="Ruta" placeholder="Escribe una ruta…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load(draft)}/><button onClick={() => void load(draft)}>Ir</button></div>
      <label className="filter-box"><span>⌕</span><input aria-label="Filtrar archivos" placeholder="Filtrar por nombre" value={filter} onChange={(e) => setFilter(e.target.value)}/></label>
    </div>
    <div className="file-actions">
      <button onClick={() => void createFolder()}>＋ Nueva carpeta</button><i/>
      <button disabled={selected.length !== 1} onClick={() => void rename()}>✎ Renombrar</button>
      <button disabled={!selected.length} onClick={() => void clipboard(false)}>▣ Copiar</button><button disabled={!selected.length} onClick={() => void clipboard(true)}>✂ Cortar</button>
      <button disabled={!clipboardMode} onClick={() => void paste()}>▤ Pegar{clipboardMode ? ` (${clipboardMode.toLowerCase()})` : ""}</button>
      <button className="danger-action" disabled={!selected.length} onClick={() => void moveToTrash()}>⌫ Papelera</button>
      {selected.length > 0 && <span className="selection-count">{selected.length} seleccionado{selected.length === 1 ? "" : "s"}</span>}
    </div>
    <div className="summary"><span><b>{visible.length}</b> elementos {busy ? "· cargando…" : ""}</span><span className="summary-right"><i/> Directorio <code>{path || "Inicio"}</code></span></div>
    <div className="file-table" onClick={(event) => { if (event.target === event.currentTarget) setSelected([]); }}>
      <div className="table-head"><button onClick={() => chooseSort("name")}>Nombre {sort === "name" ? (ascending ? "↑" : "↓") : "↕"}</button><span>Tipo</span><button onClick={() => chooseSort("size")}>Tamaño {sort === "size" ? (ascending ? "↑" : "↓") : "↕"}</button><button onClick={() => chooseSort("modified")}>Modificado {sort === "modified" ? (ascending ? "↑" : "↓") : "↕"}</button></div>
      {visible.map((entry) => <button className={`file-row ${selected.includes(entry.path) ? "file-row-selected" : ""}`} key={entry.path} onDoubleClick={() => entry.is_dir ? void load(entry.path) : void act("open_path", { path: entry.path })} onClick={(e) => select(entry, e.ctrlKey || e.metaKey)} onContextMenu={(e) => { e.preventDefault(); if (!selected.includes(entry.path)) setSelected([entry.path]); setMenu({ x: e.clientX, y: e.clientY }); }}>
        <span className="file-name"><span className={entry.is_dir ? "file-icon folder" : "file-icon"}>{entry.is_dir ? "▰" : "▤"}</span><span>{entry.name}</span></span><span className="muted">{entry.is_dir ? "Carpeta" : entry.name.split(".").pop()?.toUpperCase() || "Archivo"}</span><span className="muted">{entry.is_dir ? "—" : humanSize(entry.size)}</span><span className="muted">{dateLabel(entry.modified)}</span>
      </button>)}
      {!busy && visible.length === 0 && <div className="empty">{error ? "No se pudo abrir esta carpeta." : "Esta carpeta no contiene elementos que coincidan."}</div>}
    </div>
    {menu && <div className="context-backdrop" onClick={() => setMenu(null)}><div className="context-menu" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 260) }} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => { void clipboard(false); setMenu(null); }}>Copiar <kbd>Ctrl+C</kbd></button><button onClick={() => { void clipboard(true); setMenu(null); }}>Cortar <kbd>Ctrl+X</kbd></button><button onClick={() => void paste()}>Pegar <kbd>Ctrl+V</kbd></button><hr/><button disabled={selected.length !== 1} onClick={() => void rename()}>Renombrar <kbd>F2</kbd></button><button onClick={() => void moveToTrash()}>Enviar a la Papelera <kbd>Supr</kbd></button><hr/><button onClick={() => void createFolder()}>Nueva carpeta</button>
    </div></div>}
    {error && <div className="error">{error}</div>}
    <div className="notice">Doble clic para abrir · Ctrl + clic o Ctrl+A para seleccionar varios · Supr envía a la Papelera.</div>
  </>;
}
