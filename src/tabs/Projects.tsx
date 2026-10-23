import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Project, TreeEntry } from "../types";
import { humanSize, readList } from "../lib/format";
import { useFsWatch } from "../lib/useFsWatch";

function Tree({ node, level = 0 }: { node: TreeEntry; level?: number }) {
  const [open, setOpen] = useState(level < 1);
  return <div>
    <button className="tree-row" style={{ paddingLeft: `${12 + level * 17}px` }} onClick={() => node.is_dir && setOpen((value) => !value)}>
      <span className="tree-caret">{node.is_dir ? open ? "⌄" : "›" : ""}</span><span className={node.is_dir ? "tree-folder" : "tree-file"}>{node.is_dir ? "▰" : "·"}</span><span className="tree-label">{node.name}</span><span className="tree-size">{humanSize(node.size)}</span>
    </button>
    {open && node.children.map((child) => <Tree key={child.path} node={child} level={level + 1}/>) }
  </div>;
}

export default function Projects() {
  const [root, setRoot] = useState("");
  const [draft, setDraft] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [tree, setTree] = useState<TreeEntry | null>(null);
  const [stack, setStack] = useState("Todos");
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<string[]>(readList("fsx.projects.pinned"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const scan = async (nextRoot = draft) => {
    setBusy(true); setError("");
    try {
      const found = await invoke<Project[]>("scan_projects", { root: nextRoot || null, maxDepth: 5 });
      setProjects(found); setRoot(nextRoot); setSelected(null); setTree(null);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void scan(""); }, []);

  const visible = useMemo(() => projects.filter((p) => (stack === "Todos" || p.stack === stack)
    && `${p.name} ${p.path}`.toLowerCase().includes(query.toLowerCase())), [projects, stack, query]);

  async function openProject(project: Project) {
    setSelected(project); setTree(null); setError("");
    try { setTree(await invoke<TreeEntry>("project_tree", { path: project.path, maxDepth: 5 })); }
    catch (e) { setError(String(e)); }
  }

  const refreshSelected = useCallback(() => {
    if (selected) void invoke<TreeEntry>("project_tree", { path: selected.path, maxDepth: 5 }).then(setTree).catch((e) => setError(String(e)));
  }, [selected]);
  useFsWatch(selected?.path || "", "selected-project", true, refreshSelected);

  function togglePin(project: Project) {
    const next = pinned.includes(project.path) ? pinned.filter((p) => p !== project.path) : [...pinned, project.path];
    setPinned(next); try { localStorage.setItem("fsx.projects.pinned", JSON.stringify(next)); } catch { /* storage can be disabled */ }
  }

  return <>
    <div className="toolbar"><div className="path-box"><span>⌕</span><input placeholder="Carpeta donde buscar proyectos…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void scan(draft)}/><button onClick={() => void scan(draft)}>Escanear</button></div><label className="filter-box"><span>⌕</span><input placeholder="Filtrar proyectos" value={query} onChange={(e) => setQuery(e.target.value)}/></label></div>
    <div className="project-layout">
      <section className="project-list"><div className="project-toolbar"><span>{busy ? "Buscando…" : `${visible.length} proyectos`}</span><select aria-label="Filtrar stack" value={stack} onChange={(e) => setStack(e.target.value)}><option>Todos</option>{[...new Set(projects.map((p) => p.stack))].sort().map((s) => <option key={s}>{s}</option>)}</select></div>
        {visible.map((project) => <div className={selected?.path === project.path ? "project-card selected" : "project-card"} key={project.path}>
          <button className="project-main" onClick={() => void openProject(project)}><span className="stack-badge">{project.stack.slice(0, 2).toUpperCase()}</span><span className="project-info"><b>{project.name}</b><small>{project.path}</small></span></button>
          <button className="pin-button" title="Fijar proyecto" onClick={() => togglePin(project)}>{pinned.includes(project.path) ? "★" : "☆"}</button>
        </div>)}
        {!busy && visible.length === 0 && <div className="empty">No se encontraron proyectos con esos filtros.</div>}
      </section>
      <section className="project-detail">{selected ? <><div className="detail-heading"><div><div className="eyebrow">{selected.stack} · {selected.marker}</div><h2>{selected.name}</h2><p>{selected.path}</p></div><span className="size-pill">{tree ? humanSize(tree.size) : "Calculando…"}</span></div><div className="tree-view">{tree ? <Tree node={tree}/> : <div className="empty">Cargando árbol de archivos…</div>}</div></> : <div className="empty detail-empty">Selecciona un proyecto para ver su árbol y el tamaño por carpeta.</div>}</section>
    </div>
    {error && <div className="error">{error}</div>}
    <div className="notice">Escaneo: {root || "tu carpeta personal en Ubuntu"}. Se omiten node_modules, target, .git y carpetas generadas.</div>
  </>;
}
