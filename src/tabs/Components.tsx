import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ComponentsSnapshot } from "../types";
import { humanSize } from "../lib/format";

export default function Components() {
  const [snapshot, setSnapshot] = useState<ComponentsSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const update = async () => {
      try { const next = await invoke<ComponentsSnapshot>("components"); if (active) { setSnapshot(next); setError(""); } }
      catch (e) { if (active) setError(String(e)); }
    };
    void update(); const timer = window.setInterval(update, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const memoryPercent = snapshot?.memory_total ? Math.round(snapshot.memory_used / snapshot.memory_total * 100) : 0;
  return <>
    <div className="metric-grid"><Metric label="Procesador" value={snapshot ? `${snapshot.cpu.toFixed(1)}%` : "…"} percent={snapshot?.cpu || 0} hint="Uso total de CPU"/><Metric label="Memoria" value={snapshot ? `${memoryPercent}%` : "…"} percent={memoryPercent} hint={snapshot ? `${humanSize(snapshot.memory_used)} de ${humanSize(snapshot.memory_total)}` : "Leyendo memoria"}/></div>
    <div className="section-title"><div><div className="eyebrow">ALMACENAMIENTO</div><h2>Unidades montadas</h2></div><span>Actualiza cada 2 s</span></div>
    <div className="disk-list">{snapshot?.disks.map((disk) => { const used = disk.total - disk.available; const percent = disk.total ? used / disk.total * 100 : 0; return <div className="disk-row" key={disk.mount}><div className="disk-title"><span>▣</span><b>{disk.name || disk.mount}</b><code>{disk.mount}</code><strong>{Math.round(percent)}%</strong></div><div className="meter"><i style={{ width: `${percent}%` }}/></div><small>{humanSize(used)} usados · {humanSize(disk.available)} libres</small></div>; })}{!snapshot && !error && <div className="empty">Leyendo sensores del sistema…</div>}</div>
    {error && <div className="error">{error}</div>}
    <div className="notice">Las métricas se leen desde Ubuntu/WSL. Algunas unidades físicas pueden no aparecer igual que en Windows.</div>
  </>;
}

function Metric({ label, value, percent, hint }: { label: string; value: string; percent: number; hint: string }) {
  return <section className="metric-card"><div className="eyebrow">{label.toUpperCase()}</div><strong>{value}</strong><p>{hint}</p><div className="meter"><i style={{ width: `${Math.max(2, Math.min(percent, 100))}%` }}/></div></section>;
}
