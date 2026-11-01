# Kastral — Arquitectura, Instalación Local y Guía de Despliegue

**Eslogan:** *Convierte. Comprime. Simplifica.*

Kastral es una plataforma web gratuita de conversión, compresión y optimización de archivos diseñada con una arquitectura desacoplada y segura:

1. **Frontend y Aplicación Web (`app/`, `components/`, `lib/`):** Construido con **Next.js 15 (App Router)**, **React 19**, **TypeScript estricto** y **Tailwind CSS**. Incluye procesamiento directo en el navegador (WebAssembly / HTML5 Canvas / JSZip / pdf-lib / SheetJS) y rutas de servidor integradas (`/api/v1/*`) para que funcione de extremo a extremo en un único comando local o en contenedores.
2. **Backend Independiente en Python (`backend/`):** Servicio **FastAPI + Pydantic + Docker** preparado para desplegarse como microservicio contenedorizado en **Render**, **Fly.io** o **Cloud Run** cuando el frontend se publique como exportación estática o Edge en **Cloudflare Pages**.

---

## 1. Estructura de Directorios

```text
/
├── app/                                # Next.js App Router (Frontend + Rutas SEO + API integrada)
│   ├── api/v1/
│   │   ├── health/route.ts             # Comprobación de salud y motores disponibles
│   │   ├── process/route.ts            # Procesamiento seguro con límites y aislamiento
│   │   ├── tasks/[taskId]/route.ts     # Consulta de estado de tarea asíncrona
│   │   └── download/[taskId]/route.ts  # Descarga verificada del archivo resultante
│   ├── herramientas/[slug]/page.tsx    # 17 páginas individuales de herramientas optimizadas para SEO
│   ├── como-funciona/page.tsx          # Explicación transparente de arquitectura y seguridad
│   ├── privacidad/page.tsx             # Política de privacidad y cookies (AdSense compliant)
│   ├── condiciones/page.tsx            # Condiciones de uso y límites del servicio
│   ├── contacto/page.tsx               # Formulario de soporte y sugerencias con validación
│   ├── sitemap.ts                      # Generador automático de /sitemap.xml
│   ├── robots.ts                       # Generador automático de /robots.txt
│   ├── layout.tsx                      # Metadatos globales, OpenGraph, JSON-LD y tipografía
│   └── page.tsx                        # Página principal con Mesa de Trabajo y Catálogo
├── components/
│   ├── Header.tsx                      # Cabecera de 3 zonas con logo oficial de Kastral
│   ├── Footer.tsx                      # Pie de página editorial con icono K y enlaces legales
│   ├── FileWorkbench.tsx               # Mesa de trabajo interactiva (Drag & Drop, lotes, progreso real)
│   ├── ToolCatalogSection.tsx          # Catálogo filtrable por categorías y buscador en vivo
│   └── AdSenseSlot.tsx                 # Contenedor publicitario desactivable por entorno
├── lib/
│   ├── tools-catalog.ts                # Definición tipada de las 17 herramientas y sus parámetros
│   ├── file-utils.ts                   # Validación de Magic Bytes, saneamiento de rutas y cálculos
│   ├── file-utils.test.ts              # Pruebas unitarias de seguridad y lógica
│   ├── browser-processors.ts           # Motores de ejecución 100 % en navegador
│   └── server-processors.ts            # Motores de servidor (Ghostscript, FFmpeg, Sharp, Mammoth)
└── backend/                            # Servicio independiente en Python + FastAPI + Docker
    ├── Dockerfile                      # Imagen Docker con privilegios mínimos (usuario kastral)
    ├── requirements.txt                # Dependencias Python fijadas
    ├── app/
    │   ├── config.py                   # Configuración centralizada por variables de entorno
    │   ├── security.py                 # Prevención de Path Traversal, Zip Slip y Magic Bytes
    │   ├── processors.py               # Ejecución segura sin shell de Ghostscript, FFmpeg y ZIP
    │   └── main.py                     # API REST documentada con FastAPI y semáforo de concurrencia
    └── tests/
        └── test_security_and_processors.py
```

---

## 2. Ejecución Local y Pruebas

### Requisitos Previos
- **Node.js 20+** y `npm`
- **FFmpeg** y **Ghostscript (`gs`)** instalados en el sistema para las herramientas de servidor de audio, vídeo y compresión PDF.
- *(Opcional)* **Docker** o **Python 3.10+** si deseas levantar el backend FastAPI por separado en el puerto 8000.

### Comandos para Ejecutar el Proyecto Completo
```bash
# 1. Instalar dependencias de Node.js
npm install

# 2. Copiar variables de entorno de ejemplo
cp .env.example .env.local

# 3. Ejecutar las pruebas unitarias y de integración (Frontend + Motores de Servidor + Backend Python)
npx --yes tsx --test lib/file-utils.test.ts
python3 -m unittest backend/tests/test_security_and_processors.py

# 4. Iniciar el servidor de desarrollo en http://localhost:3000
npm run dev
```

### Ejecutar el Backend FastAPI con Docker (Opcional)
```bash
docker build -t kastral-backend ./backend
docker run --rm -p 8000:8000 --env-file .env.example kastral-backend
```
Si levantas el contenedor FastAPI en el puerto `8000`, define `NEXT_PUBLIC_API_URL="http://localhost:8000"` en `.env.local` para que el frontend envíe las tareas pesadas al contenedor Docker. Si `NEXT_PUBLIC_API_URL` está vacío, el frontend utiliza automáticamente las rutas `/api/v1/*` integradas en el servidor Next.js.

---

## 3. Guía de Despliegue (Cloudflare Pages + Render)

### A. Despliegue del Frontend en Cloudflare Pages
1. Conecta tu repositorio de GitHub/GitLab en **Cloudflare Pages**.
2. Utiliza `@opennextjs/cloudflare` o la exportación de páginas pre-renderizadas (`generateStaticParams` ya está implementado en `/herramientas/[slug]` para generar las 17 rutas de herramientas en tiempo de compilación).
3. Configura las siguientes variables de entorno en Cloudflare Pages:
   - `NEXT_PUBLIC_SITE_URL`: `https://tu-dominio.com`
   - `NEXT_PUBLIC_API_URL`: `https://tu-servicio-backend.onrender.com`
   - `NEXT_PUBLIC_DISABLE_ADS`: `true` *(mantener en `true` hasta que AdSense apruebe el dominio)*

### B. Despliegue del Backend en Render (Docker)
1. En **Render**, selecciona **New + → Web Service** y conecta el repositorio.
2. En **Root Directory**, especifica `backend`.
3. En **Runtime**, selecciona **Docker** (utilizará `backend/Dockerfile`).
4. Configura la ruta de comprobación de salud (**Health Check Path**): `/api/v1/health`.
5. Define las variables de entorno:
   - `ALLOWED_ORIGINS`: `https://tu-dominio.com`
   - `MAX_FILE_SIZE_MB`: `50`
   - `MAX_CONCURRENT_TASKS`: `2`
   - `TASK_TIMEOUT_SECONDS`: `60`
   - `TEMP_CLEANUP_MINUTES`: `15`

---

## 4. Limitaciones del Alojamiento Gratuito

Para operar de forma honesta y estable en planes gratuitos (como Render Free con 512 MB de RAM y disco efímero):
- **Prioridad al navegador:** Las herramientas de unir/dividir/extraer PDF, imágenes a PDF, crear/extraer ZIP, hojas de cálculo XLSX/CSV y conversión de imágenes PNG/JPG/WebP se ejecutan **en el navegador del usuario**, consumiendo **0 MB de RAM en el servidor**.
- **Concurrencia limitada:** El servidor limita las tareas simultáneas (`MAX_CONCURRENT_TASKS=2`) para evitar errores *Out Of Memory (OOM)* cuando varios usuarios comprimen vídeo o PDFs al mismo tiempo.
- **Tamaño y duración acotados:** Los archivos de vídeo y PDF procesados en el servidor tienen un límite de 50 MB y 60 segundos de tiempo máximo de CPU por tarea.
- **Suspensión por inactividad (Cold Start):** En el plan gratuito de Render, el contenedor entra en reposo tras 15 minutos sin tráfico y puede tardar entre 20 y 40 segundos en responder a la primera solicitud de servidor (las herramientas locales en el navegador siguen funcionando al instante).

---

## 5. Configuración de Google AdSense y Search Console

1. **Google Search Console:**
   - Registra tu propiedad de dominio en Search Console.
   - Envía el mapa del sitio generado automáticamente en `https://tu-dominio.com/sitemap.xml`.
2. **Google AdSense:**
   - Solicita la revisión del sitio en Google AdSense asegurándote de que las páginas `/privacidad`, `/condiciones`, `/como-funciona` y `/contacto` sean accesibles públicamente.
   - Una vez que Google apruebe tu cuenta, actualiza las variables de entorno:
     ```env
     NEXT_PUBLIC_DISABLE_ADS="false"
     NEXT_PUBLIC_ADSENSE_APPROVED="true"
     NEXT_PUBLIC_ADSENSE_CLIENT_ID="ca-pub-XXXXXXXXXXXXXXXX"
     ```
   - Incluye el script oficial de AdSense en tu dominio o mediante el gestor de scripts de Cloudflare cuando la cuenta esté activa.
