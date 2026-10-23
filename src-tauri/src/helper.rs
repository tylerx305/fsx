use serde::Serialize;
use std::{
    env, fs,
    io::{self, Read},
    path::Path,
    process,
};

#[derive(Serialize)]
struct Entry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

fn fail(message: impl AsRef<str>) -> ! {
    eprintln!("{}", message.as_ref());
    process::exit(1);
}

#[cfg(not(windows))]
fn main() {
    if unsafe { libc::geteuid() } != 0 {
        fail("fsx-helper requiere root");
    }
    let mut args = env::args().skip(1);
    let Some(action) = args.next() else {
        fail("uso: fsx-helper <read|write|list> <ruta>")
    };
    let Some(path_arg) = args.next() else {
        fail("falta la ruta del archivo o carpeta")
    };
    if args.next().is_some() {
        fail("se recibieron argumentos inesperados");
    }
    let path = Path::new(&path_arg);

    match action.as_str() {
        "read" => match fs::read_to_string(path) {
            Ok(contents) => print!("{contents}"),
            Err(error) => fail(format!("{}: {error}", path.display())),
        },
        "write" => {
            let mut contents = String::new();
            if let Err(error) = io::stdin().read_to_string(&mut contents) {
                fail(format!("no se pudo leer el contenido: {error}"));
            }
            if let Err(error) = fs::write(path, contents) {
                fail(format!("{}: {error}", path.display()));
            }
            println!("Archivo guardado: {}", path.display());
        }
        "list" => {
            let rows = match fs::read_dir(path) {
                Ok(rows) => rows,
                Err(error) => fail(format!("{}: {error}", path.display())),
            };
            let entries = rows
                .filter_map(Result::ok)
                .filter_map(|row| {
                    let metadata = row.metadata().ok()?;
                    Some(Entry {
                        name: row.file_name().to_string_lossy().into_owned(),
                        path: row.path().to_string_lossy().into_owned(),
                        is_dir: metadata.is_dir(),
                        size: metadata.len(),
                    })
                })
                .collect::<Vec<_>>();
            match serde_json::to_string(&entries) {
                Ok(json) => println!("{json}"),
                Err(error) => fail(error.to_string()),
            }
        }
        _ => fail("acción inválida; usa read, write o list"),
    }
}

#[cfg(windows)]
fn main() {
    eprintln!("fsx-helper es una utilidad exclusiva de Linux; en Windows FSX usa los permisos de tu cuenta.");
    process::exit(1);
}
