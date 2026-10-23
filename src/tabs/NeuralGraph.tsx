import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "../types";

const colors: Record<string, string> = { Rust: "#e99a78", JavaScript: "#e6d16f", Python: "#83b6e8", Go: "#83d8ce", Java: "#c8a0e6", "C/C++": "#b6d889", PHP: "#d99fc7", Ruby: "#ee8585" };

export default function NeuralGraph({ onOpenPath }: { onOpenPath: (path: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { invoke<Project[]>("scan_projects", { root: null, maxDepth: 5 }).then(setProjects).catch((e) => setError(String(e))); }, []);
  const nodes = useMemo(() => projects.slice(0, 32).map((project, i, rows) => {
    const angle = (Math.PI * 2 * i) / Math.max(rows.length, 1) - Math.PI / 2;
    const radius = rows.length > 15 ? 180 : 140;
    return { project, x: 300 + Math.cos(angle) * radius, y: 220 + Math.sin(angle) * radius };
  }), [projects]);
  return <>
    <div className="graph-meta"><span><i/> {nodes.length} proyectos</span><span>Los colores representan el stack técnico</span></div>
    <div className="graph-canvas"><svg viewBox="0 0 600 440" role="img" aria-label="Grafo de proyectos">
      {nodes.map((node, i) => { const target = nodes[(i + 1) % nodes.length]; return target ? <line key={`edge-${node.project.path}`} x1={node.x} y1={node.y} x2={target.x} y2={target.y} stroke="#35433d" strokeWidth="1"/> : null; })}
      {nodes.map(({ project, x, y }) => <g key={project.path} className="graph-node" role="button" tabIndex={0} onClick={() => onOpenPath(project.path)} onKeyDown={(e) => e.key === "Enter" && onOpenPath(project.path)}>
        <circle cx={x} cy={y} r="24" fill="#1d2924" stroke={colors[project.stack] || "#9ae6c5"} strokeWidth="2"/><text x={x} y={y + 4} textAnchor="middle" fill={colors[project.stack] || "#9ae6c5"} fontSize="10" fontWeight="700">{project.stack.slice(0, 2).toUpperCase()}</text><text x={x} y={y + 40} textAnchor="middle" fill="#cbd5cf" fontSize="10">{project.name.length > 17 ? `${project.name.slice(0, 16)}…` : project.name}</text>
      </g>)}
      {!nodes.length && <text x="300" y="220" textAnchor="middle" fill="#8a9690" fontSize="13">{error ? "No se pudo cargar el grafo" : "Buscando proyectos…"}</text>}
    </svg></div>
    <div className="graph-legend">{Object.entries(colors).filter(([stack]) => projects.some((p) => p.stack === stack)).map(([stack, color]) => <span key={stack}><i style={{ background: color }}/>{stack}</span>)}</div>
    {error && <div className="error">{error}</div>}
  </>;
}
