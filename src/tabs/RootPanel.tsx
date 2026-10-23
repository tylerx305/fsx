import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Operation = "read" | "list" | "write";

export default function RootPanel() {
  const [operation, setOperation] = useState<Operation>("read");
  const [path, setPath] = useState("/etc/hostname");
  const [content, setContent] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!path.trim()) { setError("Escribe una ruta primero."); return; }
    if (operation === "write" && !window.confirm(`¿Confirmas reemplazar el contenido de ${path}?`)) return;
    setBusy(true); setError(""); setResult("");
    try {
      if (operation === "read") setResult(await invoke<string>("root_read", { path }));
      else if (operation === "write") setResult(await invoke<string>("root_write", { path, content }));
      else {
        const json = await invoke<string>("root_list", { path });
        setResult(JSON.stringify(JSON.parse(json), null, 2));
      }
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  return <>
    <div className="root-form">
      <div className="root-intro"><div className="root-symbol">⬡</div><div><div className="eyebrow">PERMISOS ADMINISTRATIVOS</div><h2>Operaciones protegidas</h2><p>Cada operación pide autorización del sistema mediante pkexec. La escritura pide una confirmación adicional antes de reemplazar el archivo.</p></div></div>
      <div className="root-controls"><label>Operación<select value={operation} onChange={(e) => { setOperation(e.target.value as Operation); setResult(""); setError(""); }}><option value="read">Leer archivo</option><option value="list">Listar carpeta</option><option value="write">Escribir archivo</option></select></label><label>Ruta absoluta<input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/etc/hostname"/></label><button className="primary-action" onClick={() => void run()} disabled={busy}>{busy ? "Esperando autorización…" : "Ejecutar"}</button></div>
      {operation === "write" && <label className="root-editor-label">Contenido nuevo<textarea className="root-editor" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escribe el contenido que guardará el archivo"/></label>}
      {error && <div className="error">{error}<div className="root-install">Si ves que falta el helper, abre otra terminal de Ubuntu y ejecuta:<pre>{"cd \"/mnt/c/Users/angel_euvgwfb/Documents/ChatGPT/EXPLORADOR DE ARCHIVOS TYLER\"\ncargo build --release --manifest-path src-tauri/Cargo.toml --bin fsx-helper\nsudo install -m 0755 -o root -g root src-tauri/target/release/fsx-helper /usr/local/bin/fsx-helper\nsudo install -m 0644 polkit/fsx.policy /usr/share/polkit-1/actions/org.fsx.helper.policy"}</pre></div></div>}
      {result && <><div className="root-result-label">{operation === "write" ? "Resultado" : "Contenido"}</div><pre className="root-result">{result}</pre></>}
    </div>
    <div className="notice">Usa solo rutas que quieras inspeccionar o modificar. La acción de escritura sustituye el contenido completo del archivo.</div>
  </>;
}
