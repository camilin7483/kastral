# Guía Completa: Convertir y Ejecutar KASTRAL como Aplicación para Linux y Windows (100 % Local y Sin Internet)

**Proyecto:** Kastral — *Convierte. Comprime. Simplifica.*  
**Autor:** Andres Guerrero  
**Arquitectura:** 100 % Local / Offline (Sin API Keys, sin tokens, sin cuentas de Google ni servicios externos)

---

## Garantía de Privacidad y Autonomía Total

Esta aplicación ha sido diseñada para funcionar **completamente en tu equipo local**:
- **No requiere ni solicita ninguna API Key, token ni credencial.**
- **No conecta con cuentas personales de Google ni servicios externos.**
- **No envía tus archivos a ningún servidor externo:** las 17 herramientas (Imágenes, PDF, Documentos, Hojas de Cálculo, Audio, Vídeo y Archivos ZIP) procesan los datos en tu propio equipo, sin salir a Internet.
- **11 herramientas funcionan totalmente sin conexión en el navegador; 6 requieren el servidor local en `http://127.0.0.1:3000`:** comprimir-pdf, pdf-a-imagenes, convertir-audio, convertir-video, comprimir-video y extraer-audio-video (incluida la salida AVIF).

---

## Requisitos Previos en tu PC (Linux o Windows)

Solo necesitas tener instalado **Node.js (versión 18 o superior)** una única vez para construir la aplicación en tu máquina:
- En **Linux (Ubuntu/Debian):**
  ```bash
  sudo apt update && sudo apt install -y nodejs npm
  ```
- En **Windows 10 / 11:**
  Instala Node.js LTS desde el instalador oficial (`node-v20-x64.msi`).

---

## Paso 1: Preparar y Compilar la Aplicación Localmente (Una sola vez)

Abre una terminal en la carpeta raíz del proyecto **Kastral** y ejecuta:

```bash
# 1. Instalar las dependencias locales del proyecto
npm install

# 2. Compilar la versión optimizada de producción (modo standalone)
npm run build
```

Una vez ejecutado `npm run build`, la aplicación queda compilada en tu disco duro y **no volverá a necesitar conexión a Internet nunca más**.

---

## Opción A: Ejecutar como Aplicación Web de Escritorio en Linux

Dentro de esta carpeta `instrucciones/` encontrarás el lanzador **`ejecutar-linux.sh`**.

### Cómo usarlo en Linux:
1. Da permisos de ejecución al script:
   ```bash
   chmod +x instrucciones/ejecutar-linux.sh
   ```
2. Ejecútalo:
   ```bash
   ./instrucciones/ejecutar-linux.sh
   ```
   El script iniciará el motor local en `http://127.0.0.1:3000` y abrirá **Kastral** en una ventana dedicada de escritorio (sin barra de direcciones ni pestañas del navegador).

### Crear un icono de aplicación en el menú de Linux (`~/.local/share/applications/kastral.desktop`):
Crea el archivo `~/.local/share/applications/kastral.desktop` con el siguiente contenido (ajustando `/ruta/a/kastral` a tu carpeta):

```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=Kastral
Comment=Convierte, comprime y simplifica archivos sin Internet — Por Andres Guerrero
Exec=/ruta/a/kastral/instrucciones/ejecutar-linux.sh
Icon=/ruta/a/kastral/public/pwa-512x512.png
Terminal=false
Categories=Utility;Office;Graphics;
```

---

## Opción B: Ejecutar como Aplicación Web de Escritorio en Windows (10 / 11)

Dentro de esta carpeta `instrucciones/` encontrarás el archivo **`ejecutar-windows.bat`**.

### Cómo usarlo en Windows:
1. Haz doble clic sobre **`instrucciones\ejecutar-windows.bat`**.
2. El script levantará automáticamente el servidor local en `http://127.0.0.1:3000` y abrirá **Kastral** en modo ventana de aplicación nativa (`--app=http://127.0.0.1:3000`) usando Microsoft Edge o Chromium instalado en el sistema, funcionando con el servidor local sin necesidad de Internet externa.
3. Puedes hacer clic derecho en `ejecutar-windows.bat` -> **Enviar a -> Escritorio (crear acceso directo)** y asignarle el icono `public\pwa-512x512.png`.

---

## Opción C: Instalar como PWA Offline en Linux y Windows (Con 1 Clic)

Kastral incluye un **Service Worker offline (`public/sw.js`)** y un **Web App Manifest (`app/manifest.ts`)** preconfigurados:
1. Con la aplicación abierta en `http://127.0.0.1:3000`, haz clic en el icono **"Instalar Kastral"** que aparece en el extremo derecho de la barra superior del navegador (en Chrome, Brave, Edge o Chromium tanto en Linux como en Windows).
2. Confirma **"Instalar"**.
3. Kastral quedará instalada como una aplicación independiente en el Menú de Inicio de Windows o en el lanzador de aplicaciones de Linux, con su propio icono naranja del ave geométrica y caché 100 % offline.

---

## Opción D: Empaquetar como Ejecutable `.AppImage` / `.deb` (Linux) y `.exe` (Windows) con Electron

Si deseas distribuir un archivo instalador `.exe` para Windows o `.AppImage` / `.deb` para Linux:

1. Copia el archivo `instrucciones/electron-main.js` a la raíz del proyecto.
2. Instala Electron y Electron Builder como dependencias de desarrollo:
   ```bash
   npm install --save-dev electron electron-builder
   ```
3. Añade en `package.json`:
   ```json
   "main": "electron-main.js",
   "scripts": {
     "desktop:start": "electron .",
     "desktop:linux": "electron-builder --linux AppImage deb",
     "desktop:win": "electron-builder --win nsis portable"
   }
   ```
4. Ejecuta `npm run desktop:linux` en Linux o `npm run desktop:win` en Windows para obtener tu instalador autónomo sin dependencias externas.
