use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    sync::Mutex,
    time::UNIX_EPOCH,
};
use sysinfo::{Disks, System};
use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;

static CANCEL_SEARCH: AtomicBool = AtomicBool::new(false);
const SKIP_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".next",
    "dist",
    "build",
    ".cache",
];
const ROOT_HELPER: &str = "/usr/local/bin/fsx-helper";

#[derive(Default)]
struct AppState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    clipboard: Mutex<Option<(Vec<PathBuf>, bool)>>,
}

#[derive(Serialize)]
struct Entry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified: Option<u64>,
}

#[derive(Serialize, Clone)]
struct Project {
    name: String,
    path: String,
    stack: String,
    marker: String,
}

#[derive(Serialize)]
struct Location {
    name: String,
    path: String,
    icon: String,
    group: String,
}

#[derive(Serialize)]
struct TreeEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    children: Vec<TreeEntry>,
}

#[derive(Serialize)]
struct SearchHit {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified: Option<u64>,
}

#[derive(Serialize)]
struct DiskInfo {
    name: String,
    mount: String,
    total: u64,
    available: u64,
}

#[derive(Serialize)]
struct Components {
    cpu: f32,
    memory_total: u64,
    memory_used: u64,
    disks: Vec<DiskInfo>,
}

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "No se pudo encontrar la carpeta personal".to_string())
}

#[tauri::command]
fn home_path() -> Result<String, String> {
    Ok(default_root()?.to_string_lossy().into_owned())
}

fn windows_path_to_wsl(value: &str) -> Option<PathBuf> {
    let normalized = value.trim().trim_matches('"').replace('\\', "/");
    let (drive, rest) = normalized.split_once(":/")?;
    if drive.len() != 1 {
        return None;
    }
    Some(PathBuf::from(format!(
        "/mnt/{}/{}",
        drive.to_lowercase(),
        rest
    )))
}

#[cfg(not(windows))]
fn windows_profile_dir() -> Option<PathBuf> {
    let from_env = std::env::var("USERPROFILE")
        .ok()
        .and_then(|value| windows_path_to_wsl(&value));
    let path = from_env.or_else(|| {
        let output = Command::new("cmd.exe")
            .args(["/C", "echo %USERPROFILE%"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        windows_path_to_wsl(&String::from_utf8_lossy(&output.stdout))
    })?;
    path.is_dir().then_some(path)
}

#[cfg(windows)]
fn windows_profile_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
}

fn default_root() -> Result<PathBuf, String> {
    Ok(windows_profile_dir().unwrap_or(home_dir()?))
}

#[tauri::command]
fn get_locations() -> Result<Vec<Location>, String> {
    let mut locations = Vec::new();
    #[cfg(not(windows))]
    {
        let this_pc = PathBuf::from("/mnt");
        if this_pc.is_dir() {
            locations.push(Location {
                name: "Este equipo".into(),
                path: this_pc.to_string_lossy().into_owned(),
                icon: "▣".into(),
                group: "Sistema".into(),
            });
        }
    }
    let linux_home = home_dir()?;
    #[cfg(not(windows))]
    locations.push(Location {
        name: "Ubuntu".into(),
        path: linux_home.to_string_lossy().into_owned(),
        icon: "⌂".into(),
        group: "Linux".into(),
    });
    if let Some(profile) = windows_profile_dir() {
        let candidates = [
            ("Carpeta personal", "", "⌂"),
            ("Escritorio", "Desktop", "▤"),
            ("Documentos", "Documents", "▧"),
            ("Descargas", "Downloads", "⇩"),
            ("Imágenes", "Pictures", "▧"),
            ("Música", "Music", "♫"),
            ("Vídeos", "Videos", "▶"),
        ];
        for (name, relative, icon) in candidates {
            let path = if relative.is_empty() {
                profile.clone()
            } else {
                profile.join(relative)
            };
            if path.is_dir() {
                locations.push(Location {
                    name: name.into(),
                    path: path.to_string_lossy().into_owned(),
                    icon: icon.into(),
                    group: "Windows".into(),
                });
            }
        }
    } else {
        #[cfg(not(windows))]
        {
            let users = PathBuf::from("/mnt/c/Users");
            if users.is_dir() {
                locations.push(Location {
                    name: "Usuarios de Windows".into(),
                    path: users.to_string_lossy().into_owned(),
                    icon: "▣".into(),
                    group: "Windows".into(),
                });
            }
        }
    }
    #[cfg(windows)]
    {
        for letter in b'C'..=b'Z' {
            let root = PathBuf::from(format!("{}:\\", letter as char));
            if root.is_dir() {
                locations.push(Location {
                    name: format!("Unidad {}:", letter as char),
                    path: root.to_string_lossy().into_owned(),
                    icon: "▣".into(),
                    group: "Este equipo".into(),
                });
            }
        }
    }
    Ok(locations)
}

fn modified_secs(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

fn entry_from_path(path: &Path) -> Result<Entry, String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(Entry {
        name: path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy()
            .into_owned(),
        path: path.to_string_lossy().into_owned(),
        is_dir: metadata.is_dir(),
        size: if metadata.is_file() {
            metadata.len()
        } else {
            0
        },
        modified: modified_secs(path),
    })
}

#[tauri::command]
fn list_dir(path: Option<String>) -> Result<Vec<Entry>, String> {
    let path = match path.filter(|p| !p.trim().is_empty()) {
        Some(p) => PathBuf::from(p),
        None => default_root()?,
    };
    let rows = fs::read_dir(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut entries = rows
        .filter_map(Result::ok)
        .filter_map(|row| entry_from_path(&row.path()).ok())
        .collect::<Vec<_>>();
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
fn create_folder(parent: String, name: String) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains(char::from(92))
    {
        return Err("Escribe un nombre de carpeta válido".into());
    }
    let destination = PathBuf::from(parent).join(name);
    fs::create_dir(&destination)
        .map_err(|e| format!("No se pudo crear {}: {e}", destination.display()))
}

#[tauri::command]
fn rename_item(path: String, new_name: String) -> Result<(), String> {
    let name = new_name.trim();
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains(char::from(92))
    {
        return Err("Escribe un nombre válido".into());
    }
    let source = PathBuf::from(path);
    let destination = source
        .parent()
        .ok_or("No se pudo encontrar la carpeta contenedora")?
        .join(name);
    if destination.exists() {
        return Err("Ya existe un elemento con ese nombre".into());
    }
    fs::rename(&source, &destination).map_err(|e| format!("No se pudo renombrar: {e}"))
}

#[tauri::command]
fn copy_items(state: State<'_, AppState>, paths: Vec<String>, cut: bool) -> Result<(), String> {
    if paths.is_empty() {
        return Err("Selecciona al menos un elemento".into());
    }
    let sources = paths.into_iter().map(PathBuf::from).collect::<Vec<_>>();
    if sources.iter().any(|p| !p.exists()) {
        return Err("Uno de los elementos ya no existe".into());
    }
    *state
        .clipboard
        .lock()
        .map_err(|_| "No se pudo acceder al portapapeles")? = Some((sources, cut));
    Ok(())
}

fn copy_path(source: &Path, destination: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(source).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        fs::create_dir(destination).map_err(|e| e.to_string())?;
        for row in fs::read_dir(source).map_err(|e| e.to_string())? {
            let row = row.map_err(|e| e.to_string())?;
            copy_path(&row.path(), &destination.join(row.file_name()))?;
        }
        Ok(())
    } else if metadata.file_type().is_symlink() {
        Err("Copiar accesos simbólicos aún no está disponible".into())
    } else {
        fs::copy(source, destination)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn paste_items(state: State<'_, AppState>, destination: String) -> Result<usize, String> {
    let mut clipboard = state
        .clipboard
        .lock()
        .map_err(|_| "No se pudo acceder al portapapeles")?;
    let Some((sources, cut)) = clipboard.clone() else {
        return Err("El portapapeles de FSX está vacío".into());
    };
    let target = PathBuf::from(destination);
    if !target.is_dir() {
        return Err("La carpeta de destino no existe".into());
    }
    for source in &sources {
        let name = source
            .file_name()
            .ok_or("No se pudo leer el nombre del elemento")?;
        let output = target.join(name);
        if output.exists() {
            return Err(format!(
                "Ya existe {} en el destino",
                name.to_string_lossy()
            ));
        }
        if cut {
            match fs::rename(source, &output) {
                Ok(()) => (),
                Err(_) => {
                    copy_path(source, &output)?;
                    if source.is_dir() {
                        fs::remove_dir_all(source)
                    } else {
                        fs::remove_file(source)
                    }
                    .map_err(|e| e.to_string())?;
                }
            }
        } else {
            copy_path(source, &output)?;
        }
    }
    let count = sources.len();
    if cut {
        *clipboard = None;
    }
    Ok(count)
}

#[tauri::command]
fn trash_item(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("El elemento ya no existe".into());
    }
    trash::delete(&path).map_err(|e| format!("No se pudo enviar a la papelera: {e}"))
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    if !target.exists() {
        return Err("El elemento ya no existe".into());
    }
    #[cfg(windows)]
    let result = Command::new("cmd")
        .arg("/C")
        .arg("start")
        .arg("")
        .arg(&target)
        .spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&target).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(&target).spawn();
    result
        .map(|_| ())
        .map_err(|e| format!("No se pudo abrir el elemento: {e}"))
}

fn marker_info(path: &Path) -> Option<(&'static str, &'static str)> {
    for (marker, stack) in [
        ("Cargo.toml", "Rust"),
        ("package.json", "JavaScript"),
        ("pyproject.toml", "Python"),
        ("requirements.txt", "Python"),
        ("go.mod", "Go"),
        ("pom.xml", "Java"),
        ("build.gradle", "Java"),
        ("CMakeLists.txt", "C/C++"),
        ("composer.json", "PHP"),
        ("Gemfile", "Ruby"),
    ] {
        if path.join(marker).is_file() {
            return Some((marker, stack));
        }
    }
    None
}

#[tauri::command]
fn scan_projects(root: Option<String>, max_depth: Option<usize>) -> Result<Vec<Project>, String> {
    let root = match root.filter(|p| !p.trim().is_empty()) {
        Some(p) => PathBuf::from(p),
        None => default_root()?,
    };
    if !root.is_dir() {
        return Err(format!("La carpeta no existe: {}", root.display()));
    }
    let depth = max_depth.unwrap_or(4).clamp(1, 8);
    let mut projects = Vec::new();
    for item in WalkDir::new(&root)
        .max_depth(depth)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0 || !SKIP_NAMES.contains(&e.file_name().to_string_lossy().as_ref())
        })
        .filter_map(Result::ok)
    {
        if !item.file_type().is_dir() {
            continue;
        }
        if let Some((marker, stack)) = marker_info(item.path()) {
            let path = item.path().to_path_buf();
            projects.push(Project {
                name: path
                    .file_name()
                    .unwrap_or(path.as_os_str())
                    .to_string_lossy()
                    .into_owned(),
                path: path.to_string_lossy().into_owned(),
                stack: stack.to_string(),
                marker: marker.to_string(),
            });
        }
    }
    projects.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(projects)
}

fn tree_for(path: &Path, depth: usize) -> TreeEntry {
    let metadata = fs::symlink_metadata(path).ok();
    let is_dir = metadata.as_ref().is_some_and(|m| m.is_dir());
    let mut children = Vec::new();
    let mut size = metadata
        .as_ref()
        .filter(|m| m.is_file())
        .map_or(0, |m| m.len());
    if is_dir && depth > 0 {
        if let Ok(rows) = fs::read_dir(path) {
            for row in rows.filter_map(Result::ok) {
                let child_path = row.path();
                if child_path
                    .file_name()
                    .is_some_and(|n| SKIP_NAMES.contains(&n.to_string_lossy().as_ref()))
                {
                    continue;
                }
                let child = tree_for(&child_path, depth - 1);
                size = size.saturating_add(child.size);
                children.push(child);
            }
        }
        children.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
    }
    TreeEntry {
        name: path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy()
            .into_owned(),
        path: path.to_string_lossy().into_owned(),
        is_dir,
        size,
        children,
    }
}

#[tauri::command]
fn project_tree(path: String, max_depth: Option<usize>) -> Result<TreeEntry, String> {
    let path = PathBuf::from(path);
    if !path.is_dir() {
        return Err(format!("El proyecto no existe: {}", path.display()));
    }
    Ok(tree_for(&path, max_depth.unwrap_or(4).clamp(1, 8)))
}

#[tauri::command]
fn search_in_path(
    root: Option<String>,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    if query.trim().is_empty() {
        return Err("Escribe algo para buscar".to_string());
    }
    let root = match root.filter(|p| !p.trim().is_empty()) {
        Some(p) => PathBuf::from(p),
        None => default_root()?,
    };
    if !root.is_dir() {
        return Err(format!("La carpeta no existe: {}", root.display()));
    }
    CANCEL_SEARCH.store(false, Ordering::Relaxed);
    let limit = max_results.unwrap_or(1000).clamp(1, 10000);
    let needle = query.to_lowercase();
    let mut hits = Vec::new();
    for item in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0 || !SKIP_NAMES.contains(&e.file_name().to_string_lossy().as_ref())
        })
    {
        if CANCEL_SEARCH.load(Ordering::Relaxed) || hits.len() >= limit {
            break;
        }
        let Ok(item) = item else { continue };
        if !item
            .file_name()
            .to_string_lossy()
            .to_lowercase()
            .contains(&needle)
        {
            continue;
        }
        if let Ok(entry) = entry_from_path(item.path()) {
            hits.push(SearchHit {
                name: entry.name,
                path: entry.path,
                is_dir: entry.is_dir,
                size: entry.size,
                modified: entry.modified,
            });
        }
    }
    Ok(hits)
}

#[tauri::command]
fn cancel_search() {
    CANCEL_SEARCH.store(true, Ordering::Relaxed);
}

#[tauri::command]
fn components() -> Components {
    let mut system = System::new_all();
    system.refresh_all();
    let disks = Disks::new_with_refreshed_list()
        .iter()
        .map(|disk| DiskInfo {
            name: disk.name().to_string_lossy().into_owned(),
            mount: disk.mount_point().to_string_lossy().into_owned(),
            total: disk.total_space(),
            available: disk.available_space(),
        })
        .collect();
    Components {
        cpu: system.global_cpu_usage(),
        memory_total: system.total_memory(),
        memory_used: system.used_memory(),
        disks,
    }
}

fn run_helper(action: &str, path: String, input: Option<String>) -> Result<String, String> {
    let mut child = Command::new("pkexec")
        .arg(ROOT_HELPER)
        .arg(action)
        .arg(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo iniciar pkexec: {e}. Instala primero el helper FSX."))?;
    if let Some(contents) = input {
        let Some(mut stdin) = child.stdin.take() else {
            return Err("No se pudo abrir la entrada del helper".to_string());
        };
        stdin
            .write_all(contents.as_bytes())
            .map_err(|e| format!("No se pudo enviar el contenido al helper: {e}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("No se pudo esperar al helper: {e}"))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            "La operación privilegiada fue cancelada o falló.".to_string()
        } else {
            message
        });
    }
    String::from_utf8(output.stdout)
        .map_err(|e| format!("La respuesta del helper no es UTF-8: {e}"))
}

#[tauri::command]
fn root_read(path: String) -> Result<String, String> {
    run_helper("read", path, None)
}

#[tauri::command]
fn root_write(path: String, content: String) -> Result<String, String> {
    run_helper("write", path, Some(content))
}

#[tauri::command]
fn root_list(path: String) -> Result<String, String> {
    run_helper("list", path, None)
}

#[tauri::command]
fn start_watch(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    key: String,
    recursive: Option<bool>,
) -> Result<(), String> {
    let watch_key = key.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        if result.is_ok() {
            let _ = app.emit("fs-change", watch_key.clone());
        }
    })
    .map_err(|e| format!("No se pudo crear el observador: {e}"))?;
    watcher
        .watch(
            Path::new(&path),
            if recursive.unwrap_or(false) {
                RecursiveMode::Recursive
            } else {
                RecursiveMode::NonRecursive
            },
        )
        .map_err(|e| format!("No se pudo observar {path}: {e}"))?;
    state
        .watchers
        .lock()
        .map_err(|_| "No se pudo acceder al estado de los observadores".to_string())?
        .insert(key, watcher);
    Ok(())
}

#[tauri::command]
fn stop_watch(state: State<'_, AppState>, key: String) -> Result<(), String> {
    state
        .watchers
        .lock()
        .map_err(|_| "No se pudo acceder al estado de los observadores".to_string())?
        .remove(&key);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            home_path,
            get_locations,
            list_dir,
            create_folder,
            rename_item,
            copy_items,
            paste_items,
            trash_item,
            open_path,
            scan_projects,
            project_tree,
            search_in_path,
            cancel_search,
            components,
            root_read,
            root_write,
            root_list,
            start_watch,
            stop_watch
        ])
        .run(tauri::generate_context!())
        .expect("error while running FSX");
}
