import { useCallback, useState } from "react";
import Explorer from "./tabs/Explorer";
import Projects from "./tabs/Projects";
import SearchAdvanced from "./tabs/SearchAdvanced";
import Components from "./tabs/Components";
import NeuralGraph from "./tabs/NeuralGraph";
import RootPanel from "./tabs/RootPanel";

type Tab = "Explorador" | "Proyectos" | "Búsqueda" | "Componentes" | "Red neuronal" | "Root";
const tabs: { name: Tab; icon: string }[] = [
  { name: "Explorador", icon: "▦" }, { name: "Proyectos", icon: "◫" },
  { name: "Búsqueda", icon: "⌕" }, { name: "Componentes", icon: "◉" },
  { name: "Red neuronal", icon: "✳" }, { name: "Root", icon: "⬡" },
];
const subtitles: Record<Tab, string> = {
  Explorador: "Tus archivos, en un solo lugar.",
  Proyectos: "Encuentra proyectos y explora su estructura.",
  Búsqueda: "Busca archivos por nombre en un árbol de carpetas.",
  Componentes: "Uso de procesador, memoria y almacenamiento.",
  "Red neuronal": "Relaciones entre proyectos detectados en el sistema.",
  Root: "Operaciones de sistema con autorización explícita.",
};

export default function App() {
  const [tab, setTab] = useState<Tab>("Explorador");
  const [path, setPath] = useState("");
  const [connected, setConnected] = useState(false);
  const markConnected = useCallback(() => setConnected(true), []);

  return <div className="shell">
    <aside className="rail"><div className="brand">F<span>X</span></div><div className="rail-mark">⌘</div><div className="rail-bottom">TY</div></aside>
    <section className="workspace">
      <header className="topbar"><div className="window-dots"><i/><i/><i/></div><div className="breadcrumb"><span>FSX</span><b>›</b><strong>{tab === "Explorador" ? path || "Inicio" : tab}</strong></div><div className="top-status"><span className={connected ? "live-dot" : "demo-dot"}/>{connected ? "Sistema conectado" : "Conectando…"}</div></header>
      <nav className="tabs">{tabs.map((item) => <button className={item.name === tab ? "tab active" : "tab"} key={item.name} onClick={() => setTab(item.name)}><span className="tab-icon">{item.icon}</span>{item.name}</button>)}</nav>
      <main className="content">
        <div className="page-heading"><div><div className="eyebrow">FSX / SISTEMA DE ARCHIVOS</div><h1>{tab}</h1><p>{subtitles[tab]}</p></div>{tab === "Explorador" && <button className="icon-button" title="Actualizar" onClick={() => window.location.reload()}>↻</button>}</div>
        {tab === "Explorador" && <Explorer initialPath={path} onPathChange={setPath} onConnected={markConnected}/>}
        {tab === "Proyectos" && <Projects/>}
        {tab === "Búsqueda" && <SearchAdvanced/>}
        {tab === "Componentes" && <Components/>}
        {tab === "Red neuronal" && <NeuralGraph onOpenPath={(target) => { setPath(target); setTab("Explorador"); }}/>}
        {tab === "Root" && <RootPanel/>}
      </main>
      <footer><span><i className={connected ? "live-dot" : "demo-dot"}/>{connected ? "FSX conectado" : "FSX"}</span><span>FSX <b>0.1.0</b></span></footer>
    </section>
  </div>;
}
