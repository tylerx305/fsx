# FSX

FSX es una aplicación de escritorio para explorar archivos y proyectos. Está construida con Tauri 2, React, TypeScript y Rust.

## Funciones actuales

- Explorar las carpetas del usuario y las unidades disponibles en Windows, además de las carpetas principales del perfil.
- Abrir archivos con la aplicación predeterminada del sistema.
- Crear carpetas, renombrar elementos, copiar/cortar/pegar dentro de FSX y enviar elementos a la Papelera del sistema.
- Seleccionar varios elementos con Ctrl + clic y usar atajos habituales: Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Shift+N, F2 y Supr.
- Filtrar y ordenar archivos por nombre, tamaño y fecha de modificación.
- Detectar proyectos por sus archivos de configuración, filtrar por tecnología y fijar favoritos.
- Ver un árbol del proyecto con tamaños agregados por carpeta.
- Buscar archivos de forma recursiva y cancelar la búsqueda.
- Consultar métricas de CPU, memoria y discos.
- Ver un grafo sencillo de los proyectos detectados.
- En Linux, leer, listar y escribir archivos protegidos mediante `pkexec` y un helper separado.

El portapapeles de archivos (copiar/cortar/pegar) actualmente funciona dentro de FSX. El panel Root es específico de Linux; las operaciones normales de archivos usan los permisos de tu cuenta de Windows.

Las operaciones de administrador en Linux requieren instalar el helper y la política polkit indicados abajo. La escritura reemplaza el contenido completo del archivo elegido.

## Desarrollo en Windows

Para generar la aplicación nativa de Windows, instala las herramientas de desarrollo de Tauri para Windows, Node.js, pnpm y Rust con la cadena MSVC. Después, desde PowerShell en la carpeta del proyecto:

```powershell
pnpm install
pnpm tauri dev
```

Para crear el instalador:

```powershell
pnpm tauri build
```

Los paquetes se guardan bajo `src-tauri/target/release/bundle/`.

## Requisitos para desarrollo en Ubuntu o WSL2

- Ubuntu con soporte para aplicaciones gráficas de WSL si se utiliza WSL2.
- Node.js 20 y pnpm 9.
- Rust y Cargo.
- Dependencias del sistema de Tauri para Linux:

```bash
sudo apt update
sudo apt install -y build-essential curl file git \
  libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf \
  polkitd pkexec inotify-tools
```

## Ejecutar en desarrollo

```bash
pnpm install
pnpm tauri dev
```

## Crear un paquete de producción

```bash
pnpm tauri build
```

Los instaladores de Linux se guardan bajo `src-tauri/target/release/bundle/`. El paquete Tauri estándar no instala automáticamente el helper de administrador.

### Instalar el helper de administrador

Desde la raíz de este repositorio:

```bash
cargo build --release --manifest-path src-tauri/Cargo.toml --bin fsx-helper
sudo install -m 0755 -o root -g root \
  src-tauri/target/release/fsx-helper /usr/local/bin/fsx-helper
sudo install -m 0644 polkit/fsx.policy \
  /usr/share/polkit-1/actions/org.fsx.helper.policy
```

El helper permite leer o escribir archivos y listar carpetas con permisos de administrador, solo después de que el usuario autorice la operación.

## Subir el código a GitHub

El repositorio ignora `node_modules`, `dist` y los resultados de compilación de Rust. Para publicar el código, crea un repositorio vacío en GitHub y sigue los comandos de Git en la guía de inicio rápido de GitHub.
