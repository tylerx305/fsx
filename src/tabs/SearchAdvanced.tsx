import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SearchHit } from "../types";
import { dateLabel, humanSize } from "../lib/format";

export default function SearchAdvanced() {
  const [root, setRoot] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [sortNewest, setSortNewest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const results = useMemo(() => [...hits].sort((a, b) => sortNewest ? (b.modified || 0) - (a.modified || 0) : a.name.localeCompare(b.name)), [hits, sortNewest]);

  async function search() {
    if (!query.trim()) { setError("Escribe el nombre o parte del nombre que quieres encontrar."); return; }
    setBusy(true); setError(""); setHits([]);
    try { setHits(await invoke<SearchHit[]>("search_in_path", { root: root || null, query, maxResults: 2000 })); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function cancel() {
    try { await invoke("cancel_search"); } catch (e) { setError(String(e)); }
  }

  return <>
    <div className="search-form"><label>Carpeta inicial<input placeholder="Vacío = carpeta personal" value={root} onChange={(e) => setRoot(e.target.value)}/></label><label>Nombre contiene<input placeholder="Ejemplo: .toml" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()}/></label><button className="primary-action" onClick={() => void search()} disabled={busy}>{busy ? "Buscando…" : "Buscar"}</button><button className="small-action" onClick={() => void cancel()} disabled={!busy}>Cancelar</button></div>
    <div className="summary"><span><b>{results.length}</b> resultados {busy ? "· búsqueda activa" : ""}</span><button className="text-action" onClick={() => setSortNewest((v) => !v)}>Ordenar por {sortNewest ? "nombre" : "modificado ↓"}</button></div>
    <div className="file-table"><div className="table-head search-head"><span>Nombre</span><span>Ruta</span><span>Tamaño</span><span>Modificado</span></div>
      {results.map((hit) => <div className="search-row" key={hit.path}><span className="file-name"><span className={hit.is_dir ? "file-icon folder" : "file-icon"}>{hit.is_dir ? "▰" : "▤"}</span><b>{hit.name}</b></span><span className="muted path-cell" title={hit.path}>{hit.path}</span><span className="muted">{humanSize(hit.size)}</span><span className="muted">{dateLabel(hit.modified)}</span></div>)}
      {!busy && results.length === 0 && <div className="empty">Los resultados de la búsqueda aparecerán aquí.</div>}
    </div>
    {error && <div className="error">{error}</div>}
    <div className="notice">La búsqueda es recursiva y omite carpetas generadas grandes como node_modules, target y .git.</div>
  </>;
}
