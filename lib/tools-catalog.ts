export type ToolCategory = 'imagen' | 'pdf' | 'documentos' | 'audio' | 'video' | 'archivos';

export type ExecutionEngine = 'browser' | 'server' | 'hybrid';

export interface ToolParameterOption {
  label: string;
  value: string;
}

export interface ToolParameter {
  id: string;
  label: string;
  type: 'select' | 'number' | 'range' | 'text' | 'boolean';
  defaultValue: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: ToolParameterOption[];
  description?: string;
}

export interface ToolFAQ {
  question: string;
  answer: string;
}

export interface KastralTool {
  slug: string;
  title: string;
  shortTitle: string;
  category: ToolCategory;
  categoryLabel: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  engine: ExecutionEngine;
  engineBadge: string;
  engineNotice: string;
  acceptedExtensions: string[];
  acceptedMimeTypes: string[];
  outputFormats: string[];
  defaultOutputFormat: string;
  maxFileSizeMB: number;
  maxBatchFiles: number;
  supportsMultiple: boolean;
  mergesIntoSingleOutput?: boolean;
  parameters: ToolParameter[];
  steps: string[];
  limitations: string[];
  faqs: ToolFAQ[];
  relatedSlugs: string[];
  popular?: boolean;
}

export const CATEGORY_LABELS: Record<ToolCategory, { name: string; description: string }> = {
  imagen: {
    name: 'Imágenes',
    description: 'Conversión entre PNG, JPEG, WebP, AVIF, GIF y BMP con control exacto de calidad y dimensiones.',
  },
  pdf: {
    name: 'PDF',
    description: 'Comprime, combina, divide, extrae páginas y convierte entre documentos PDF e imágenes.',
  },
  documentos: {
    name: 'Documentos',
    description: 'Transforma archivos DOCX, XLSX, CSV, TXT y RTF en formatos listos para publicar o editar.',
  },
  audio: {
    name: 'Audio',
    description: 'Convierte pistas entre MP3, WAV, AAC, FLAC y OGG ajustando el bitrate con FFmpeg.',
  },
  video: {
    name: 'Vídeo',
    description: 'Comprime vídeo, cambia entre MP4, WebM y MKV, redimensiona o extrae la pista de audio.',
  },
  archivos: {
    name: 'Comprimidos',
    description: 'Empaqueta múltiples archivos o carpetas en un único ZIP o inspecciona y extrae su contenido.',
  },
};

export const KASTRAL_TOOLS: KastralTool[] = [
  // ================= IMÁGENES =================
  {
    slug: 'convertir-imagen',
    title: 'Convertidor de Imágenes (PNG, JPG, WebP, AVIF)',
    shortTitle: 'Convertir Imagen',
    category: 'imagen',
    categoryLabel: 'Imágenes',
    description:
      'Convierte imágenes entre PNG, JPEG, WebP y AVIF con ajuste preciso de calidad y procesamiento por lotes. También acepta GIF y BMP como entrada.',
    metaTitle: 'Convertir Imágenes a PNG, JPG, WebP y AVIF Gratis | Kastral',
    metaDescription:
      'Convierte fotos e imágenes entre PNG, JPEG, WebP y AVIF desde el navegador. Ajusta la calidad, procesa por lotes y descarga al instante.',
    engine: 'hybrid',
    engineBadge: 'Navegador + Servidor Sharp/Pillow',
    engineNotice:
      'PNG, JPEG y WebP pueden procesarse directamente en tu navegador para máxima rapidez o en el servidor para AVIF y lotes pesados.',
    acceptedExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp'],
    acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/bmp'],
    outputFormats: ['webp', 'jpg', 'png', 'avif'],
    defaultOutputFormat: 'webp',
    maxFileSizeMB: 35,
    maxBatchFiles: 20,
    supportsMultiple: true,
    popular: true,
    parameters: [
      {
        id: 'quality',
        label: 'Calidad de salida',
        type: 'range',
        defaultValue: 85,
        min: 10,
        max: 100,
        step: 5,
        unit: '%',
        description: 'Aplica a formatos con compresión con pérdida (JPG, WebP, AVIF).',
      },
      {
        id: 'executionMode',
        label: 'Modo de ejecución',
        type: 'select',
        defaultValue: 'auto',
        options: [
          { label: 'Automático (Navegador para WebP/JPG/PNG, Servidor para AVIF)', value: 'auto' },
          { label: 'Forzar servidor (Motor de alta precisión)', value: 'server' },
        ],
      },
    ],
    steps: [
      'Arrastra una o varias imágenes en formato PNG, JPG, WebP, AVIF, GIF o BMP.',
      'Selecciona el formato de salida deseado y ajusta el nivel de calidad si corresponde.',
      'Pulsa en Procesar archivos y descarga cada imagen individualmente o todas juntas en un archivo ZIP.',
    ],
    limitations: [
      'Al convertir imágenes GIF animadas a formatos estáticos (PNG, JPG), se conserva únicamente el primer fotograma.',
      'Los formatos GIF y BMP se admiten como entrada, pero no como salida: la salida puede ser PNG, JPG, WebP o AVIF.',
    ],
    faqs: [
      {
        question: '¿Qué diferencia hay entre WebP y AVIF?',
        answer:
          'Ambos son formatos modernos pensados para la web. AVIF suele lograr archivos hasta un 20 % más ligeros que WebP con la misma calidad visual, aunque tarda ligeramente más en codificarse.',
      },
      {
        question: '¿Se pierden las transparencias al convertir a JPG?',
        answer:
          'Sí. El estándar JPEG no admite canal alfa (transparencia). Las zonas transparentes se rellenan automáticamente con fondo blanco limpio. Si necesitas conservar la transparencia, elige PNG, WebP o AVIF.',
      },
    ],
    relatedSlugs: ['comprimir-imagen', 'redimensionar-imagen', 'imagenes-a-pdf'],
  },
  {
    slug: 'comprimir-imagen',
    title: 'Comprimir Imágenes sin Perder Nitidez',
    shortTitle: 'Comprimir Imagen',
    category: 'imagen',
    categoryLabel: 'Imágenes',
    description:
      'Reduce el peso en kilobytes o megabytes de tus fotografías PNG, JPEG, WebP y AVIF optimizando la cuantización y eliminando metadatos innecesarios.',
    metaTitle: 'Comprimir Imágenes JPG, PNG y WebP Gratis Online | Kastral',
    metaDescription:
      'Optimiza y reduce el peso de tus imágenes JPG, PNG, WebP y AVIF manteniendo la nitidez visual. Compara el tamaño original y final al instante.',
    engine: 'hybrid',
    engineBadge: 'Optimización Local y Servidor',
    engineNotice:
      'La compresión se realiza optimizando las tablas de color y el factor de calidad. Puedes comparar exactamente el ahorro de peso antes de descargar.',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.avif'],
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    outputFormats: ['keep', 'webp', 'jpg', 'avif'],
    defaultOutputFormat: 'keep',
    maxFileSizeMB: 35,
    maxBatchFiles: 20,
    supportsMultiple: true,
    popular: true,
    parameters: [
      {
        id: 'quality',
        label: 'Nivel de compresión (Calidad)',
        type: 'range',
        defaultValue: 75,
        min: 15,
        max: 95,
        step: 5,
        unit: '%',
        description: 'Valores entre 70 % y 80 % ofrecen la mejor reducción de peso sin pérdida perceptible.',
      },
      {
        id: 'maxWidth',
        label: 'Ancho máximo opcional (px)',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 8000,
        step: 100,
        unit: 'px',
        description: 'Deja 0 para mantener las dimensiones originales.',
      },
    ],
    steps: [
      'Selecciona las fotografías o gráficos que deseas aligerar.',
      'Ajusta el porcentaje de calidad (recomendado 75 %) o convierte directamente a WebP para mayor ahorro.',
      'Revisa el porcentaje real de reducción de cada archivo y descarga el resultado.',
    ],
    limitations: [
      'Si subes un archivo ya muy comprimido y eliges una calidad de salida del 95 %, el archivo resultante podría no reducir su tamaño.',
    ],
    faqs: [
      {
        question: '¿Por qué dice "Mantener formato original"?',
        answer:
          'Con la opción "keep", un archivo JPG seguirá siendo JPG y un WebP seguirá siendo WebP tras optimizarse. También puedes cambiarlo a WebP para conseguir una reducción adicional.',
      },
      {
        question: '¿Se borran los metadatos EXIF de ubicación?',
        answer:
          'Sí, al recodificar la imagen se eliminan los metadatos EXIF superfluos (como coordenadas GPS o modelo de cámara) para proteger tu privacidad y ahorrar espacio.',
      },
    ],
    relatedSlugs: ['convertir-imagen', 'redimensionar-imagen', 'comprimir-pdf'],
  },
  {
    slug: 'redimensionar-imagen',
    title: 'Redimensionar Imágenes por Píxeles',
    shortTitle: 'Redimensionar Imagen',
    category: 'imagen',
    categoryLabel: 'Imágenes',
    description:
      'Cambia el ancho y alto exacto de tus imágenes en píxeles manteniendo la proporción original o adaptándolas al tamaño que necesites.',
    metaTitle: 'Redimensionar Imágenes Online en Píxeles Gratis | Kastral',
    metaDescription:
      'Cambia las dimensiones en píxeles de imágenes PNG, JPG y WebP. Mantén la relación de aspecto automáticamente y procesa varios archivos a la vez.',
    engine: 'hybrid',
    engineBadge: 'Escalado Bicúbico / Lanczos',
    engineNotice:
      'Puedes redimensionar tus imágenes localmente en el navegador o mediante el motor del servidor con interpolación Lanczos.',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.avif'],
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    outputFormats: ['keep', 'png', 'jpg', 'webp'],
    defaultOutputFormat: 'keep',
    maxFileSizeMB: 35,
    maxBatchFiles: 20,
    supportsMultiple: true,
    parameters: [
      {
        id: 'width',
        label: 'Nuevo ancho (px)',
        type: 'number',
        defaultValue: 1280,
        min: 16,
        max: 7680,
        step: 10,
        unit: 'px',
        description: 'Ancho objetivo en píxeles.',
      },
      {
        id: 'height',
        label: 'Nuevo alto (px, 0 = proporcional)',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 7680,
        step: 10,
        unit: 'px',
        description: 'Deja 0 para calcular automáticamente según la proporción original.',
      },
      {
        id: 'fit',
        label: 'Modo de ajuste',
        type: 'select',
        defaultValue: 'inside',
        options: [
          { label: 'Ajustar dentro sin recortar (Proporcional)', value: 'inside' },
          { label: 'Recortar para cubrir medidas exactas (Cover)', value: 'cover' },
          { label: 'Forzar medidas exactas (Estirar)', value: 'fill' },
        ],
      },
    ],
    steps: [
      'Añade las imágenes cuyas dimensiones quieras modificar.',
      'Introduce el ancho en píxeles (y el alto si deseas una medida fija).',
      'Procesa el lote y descarga tus imágenes con la resolución exacta.',
    ],
    limitations: [
      'Aumentar las dimensiones de una imagen pequeña no añade detalle real nuevo; puede producir suavizado.',
    ],
    faqs: [
      {
        question: '¿Cómo mantengo la proporción para que la foto no se deforme?',
        answer:
          'Simplemente introduce el ancho deseado y deja el campo de alto en 0 (o elige el modo "Ajustar dentro sin recortar"). La altura se calculará matemáticamente respetando el encuadre original.',
      },
    ],
    relatedSlugs: ['comprimir-imagen', 'convertir-imagen', 'imagenes-a-pdf'],
  },

  // ================= PDF =================
  {
    slug: 'comprimir-pdf',
    title: 'Comprimir Archivos PDF',
    shortTitle: 'Comprimir PDF',
    category: 'pdf',
    categoryLabel: 'PDF',
    description:
      'Reduce el tamaño de documentos PDF optimizando imágenes incrustadas, flujos de objetos y fuentes mediante Ghostscript en el servidor.',
    metaTitle: 'Comprimir PDF Gratis Online — Reducir Tamaño de PDF | Kastral',
    metaDescription:
      'Reduce el peso de tus archivos PDF para enviarlos por correo o subirlos a portales oficiales. Tres niveles reales de compresión con Ghostscript.',
    engine: 'server',
    engineBadge: 'Servidor (Motor Ghostscript)',
    engineNotice:
      'Para comprimir flujos internos y remuestrear imágenes incrustadas de un PDF con eficacia real, el archivo se sube temporalmente al servidor y se elimina automáticamente tras la tarea.',
    acceptedExtensions: ['.pdf'],
    acceptedMimeTypes: ['application/pdf'],
    outputFormats: ['pdf'],
    defaultOutputFormat: 'pdf',
    maxFileSizeMB: 50,
    maxBatchFiles: 10,
    supportsMultiple: true,
    popular: true,
    parameters: [
      {
        id: 'preset',
        label: 'Perfil de compresión PDF',
        type: 'select',
        defaultValue: 'ebook',
        options: [
          { label: 'Equilibrada (150 ppp — Ideal para correo y lectura)', value: 'ebook' },
          { label: 'Máxima reducción (72 ppp — Pantalla y portales con límite estricto)', value: 'screen' },
          { label: 'Alta calidad (300 ppp — Conserva nitidez para imprimir)', value: 'printer' },
        ],
        description: 'Define la resolución de remuestreo de las imágenes internas del documento.',
      },
    ],
    steps: [
      'Selecciona uno o varios documentos PDF desde tu dispositivo.',
      'Elige el perfil de compresión según el uso: pantalla (72 ppp), lectura general (150 ppp) o impresión (300 ppp).',
      'Inicia la compresión y comprueba los kilobytes ahorrados antes de descargar el archivo.',
    ],
    limitations: [
      'Los PDF que contienen únicamente texto vectorial sin imágenes ya suelen ser muy ligeros y tendrán un margen de reducción menor que los PDF con fotografías o escaneos.',
      'No se pueden comprimir archivos PDF protegidos con contraseña de apertura a menos que se desbloqueen previamente.',
    ],
    faqs: [
      {
        question: '¿Por qué algunos PDF bajan un 80 % de peso y otros solo un 5 %?',
        answer:
          'El ahorro depende del contenido interno. Si el PDF tiene imágenes de alta resolución o escaneos pesados, el motor reduce drásticamente su tamaño. Si solo contiene texto plano y tablas vectoriales, el archivo original ya ocupa el mínimo espacio posible.',
      },
      {
        question: '¿Qué ocurre con mis documentos subidos al servidor?',
        answer:
          'Se guardan en un directorio temporal aislado con un identificador aleatorio único para tu tarea y el recolector del servidor los elimina automáticamente tras completarse el tiempo de retención (15 minutos).',
      },
    ],
    relatedSlugs: ['combinar-pdf', 'dividir-pdf', 'pdf-a-imagenes'],
  },
  {
    slug: 'combinar-pdf',
    title: 'Combinar y Unir Archivos PDF',
    shortTitle: 'Combinar PDF',
    category: 'pdf',
    categoryLabel: 'PDF',
    description:
      'Une dos o más documentos PDF en un único archivo ordenado directamente desde tu navegador sin subir tus documentos a ningún servidor.',
    metaTitle: 'Unir y Combinar PDF Gratis Online en el Navegador | Kastral',
    metaDescription:
      'Combina múltiples archivos PDF en un solo documento en segundos. Procesamiento 100 % local en tu navegador para máxima velocidad y privacidad.',
    engine: 'browser',
    engineBadge: '100 % Local en Navegador',
    engineNotice:
      'Esta herramienta une tus documentos PDF directamente en la memoria de tu navegador mediante WebAssembly/JavaScript. Tus archivos no necesitan subirse al servidor.',
    acceptedExtensions: ['.pdf'],
    acceptedMimeTypes: ['application/pdf'],
    outputFormats: ['pdf'],
    defaultOutputFormat: 'pdf',
    maxFileSizeMB: 50,
    maxBatchFiles: 20,
    supportsMultiple: true,
    mergesIntoSingleOutput: true,
    popular: true,
    parameters: [
      {
        id: 'outputFilename',
        label: 'Nombre del documento combinado',
        type: 'text',
        defaultValue: 'documento-combinado',
        description: 'Nombre base para el archivo PDF resultante.',
      },
    ],
    steps: [
      'Selecciona dos o más archivos PDF que quieras fusionar.',
      'Revisa la lista de archivos seleccionados (se unirán en el orden en que aparecen).',
      'Haz clic en Combinar PDF y descarga inmediatamente el documento unificado.',
    ],
    limitations: [
      'Los documentos PDF cifrados con contraseña no pueden fusionarse hasta que se elimine su restricción.',
    ],
    faqs: [
      {
        question: '¿Se mantiene la calidad del texto y las páginas originales?',
        answer:
          'Sí, al 100 %. Las páginas se copian directamente en su estructura vectorial original sin recodificar ni perder nitidez.',
      },
    ],
    relatedSlugs: ['dividir-pdf', 'comprimir-pdf', 'extraer-paginas-pdf'],
  },
  {
    slug: 'dividir-pdf',
    title: 'Dividir PDF en Páginas Individuales',
    shortTitle: 'Dividir PDF',
    category: 'pdf',
    categoryLabel: 'PDF',
    description:
      'Separa todas las páginas de un documento PDF en archivos PDF independientes empaquetados en un archivo ZIP listo para descargar.',
    metaTitle: 'Dividir PDF por Páginas Gratis Online | Kastral',
    metaDescription:
      'Separa cada página de tu archivo PDF en documentos individuales de forma instantánea desde tu navegador.',
    engine: 'browser',
    engineBadge: '100 % Local en Navegador',
    engineNotice:
      'La separación de páginas se ejecuta íntegramente en tu navegador. El resultado se entrega en un archivo ZIP con cada página numerada.',
    acceptedExtensions: ['.pdf'],
    acceptedMimeTypes: ['application/pdf'],
    outputFormats: ['zip'],
    defaultOutputFormat: 'zip',
    maxFileSizeMB: 50,
    maxBatchFiles: 5,
    supportsMultiple: false,
    parameters: [],
    steps: [
      'Selecciona el archivo PDF que deseas separar.',
      'Pulsa en Dividir PDF para extraer cada página como un documento PDF independiente.',
      'Descarga el archivo ZIP con todas las páginas numeradas en orden.',
    ],
    limitations: [
      'Si solo necesitas ciertas páginas concretas en un único PDF en lugar de todas por separado, utiliza la herramienta Extraer páginas PDF.',
    ],
    faqs: [
      {
        question: '¿Por qué se descarga un archivo ZIP?',
        answer:
          'Para evitar que tu navegador bloquee decenas de descargas individuales simultáneas, empaquetamos todas las páginas separadas (`pagina-001.pdf`, `pagina-002.pdf`, etc.) dentro de un único archivo ZIP limpio.',
      },
    ],
    relatedSlugs: ['extraer-paginas-pdf', 'combinar-pdf', 'comprimir-pdf'],
  },
  {
    slug: 'extraer-paginas-pdf',
    title: 'Extraer Páginas Específicas de un PDF',
    shortTitle: 'Extraer Páginas PDF',
    category: 'pdf',
    categoryLabel: 'PDF',
    description:
      'Genera un nuevo documento PDF que contenga únicamente las páginas o rangos de páginas que indiques (por ejemplo: 1, 3-5, 8).',
    metaTitle: 'Extraer Páginas de un PDF Gratis Online | Kastral',
    metaDescription:
      'Selecciona rangos o páginas sueltas de cualquier PDF y guárdalas en un nuevo documento limpio desde tu navegador.',
    engine: 'browser',
    engineBadge: '100 % Local en Navegador',
    engineNotice:
      'El filtrado y extracción de páginas se realiza localmente en tu navegador sin enviar el documento a servidores externos.',
    acceptedExtensions: ['.pdf'],
    acceptedMimeTypes: ['application/pdf'],
    outputFormats: ['pdf'],
    defaultOutputFormat: 'pdf',
    maxFileSizeMB: 50,
    maxBatchFiles: 5,
    supportsMultiple: false,
    parameters: [
      {
        id: 'pageRanges',
        label: 'Páginas o rangos a extraer',
        type: 'text',
        defaultValue: '1',
        description: 'Ejemplo: "1, 3-5, 8" extraerá las páginas 1, 3, 4, 5 y 8 en ese orden.',
      },
    ],
    steps: [
      'Carga el archivo PDF del que quieres extraer páginas.',
      'Escribe los números o rangos de página separados por comas (por ejemplo: 1, 2-4).',
      'Descarga el nuevo PDF que contiene exclusivamente las páginas seleccionadas.',
    ],
    limitations: [
      'Si indicas un número de página mayor que el total de páginas del documento, se ignorará o se mostrará un aviso claro.',
    ],
    faqs: [
      {
        question: '¿Puedo cambiar el orden de las páginas al extraerlas?',
        answer:
          'Sí. Si escribes "5, 1, 2", el nuevo documento PDF colocará primero la página 5 seguida de la 1 y la 2.',
      },
    ],
    relatedSlugs: ['dividir-pdf', 'combinar-pdf', 'pdf-a-imagenes'],
  },
  {
    slug: 'imagenes-a-pdf',
    title: 'Convertir Imágenes a PDF',
    shortTitle: 'Imágenes a PDF',
    category: 'pdf',
    categoryLabel: 'PDF',
    description:
      'Reúne una o varias imágenes JPG, PNG o WebP en un documento PDF multipágina limpio con márgenes y tamaño de hoja configurables.',
    metaTitle: 'Convertir Imágenes JPG y PNG a PDF Gratis | Kastral',
    metaDescription:
      'Convierte una o múltiples fotos JPG, PNG y WebP en un único documento PDF bien maquetado desde tu navegador.',
    engine: 'browser',
    engineBadge: '100 % Local en Navegador',
    engineNotice:
      'Las imágenes se maquetan y ensamblan en formato PDF directamente en tu navegador.',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    outputFormats: ['pdf'],
    defaultOutputFormat: 'pdf',
    maxFileSizeMB: 35,
    maxBatchFiles: 30,
    supportsMultiple: true,
    mergesIntoSingleOutput: true,
    parameters: [
      {
        id: 'pageSize',
        label: 'Tamaño de página PDF',
        type: 'select',
        defaultValue: 'a4',
        options: [
          { label: 'A4 Estándar (Ajustar imagen con margen)', value: 'a4' },
          { label: 'Tamaño exacto de cada imagen (Sin bordes)', value: 'fit' },
        ],
      },
    ],
    steps: [
      'Selecciona todas las imágenes que quieras incluir en el documento PDF.',
      'Elige si prefieres páginas de tamaño estándar A4 o páginas ajustadas exactamente a las dimensiones de cada foto.',
      'Genera y descarga el archivo PDF unificado.',
    ],
    limitations: [
      'Para obtener un archivo ligero al juntar muchas fotos de cámara móvil, te recomendamos comprimirlas antes o usar el tamaño A4.',
    ],
    faqs: [
      {
        question: '¿Todas las imágenes se unen en un solo PDF?',
        answer:
          'Sí, cada imagen seleccionada ocupará una página dentro del mismo documento PDF final.',
      },
    ],
    relatedSlugs: ['pdf-a-imagenes', 'combinar-pdf', 'comprimir-pdf'],
  },
  {
    slug: 'pdf-a-imagenes',
    title: 'Convertir PDF a Imágenes (PNG / JPG)',
    shortTitle: 'PDF a Imágenes',
    category: 'pdf',
    categoryLabel: 'PDF',
    description:
      'Renderiza cada página de un documento PDF como una imagen PNG o JPEG de alta nitidez y descárgalas en un archivo ZIP o individualmente.',
    metaTitle: 'Convertir PDF a Imágenes PNG y JPG Gratis | Kastral',
    metaDescription:
      'Extrae y convierte las páginas de cualquier PDF en imágenes PNG o JPG de alta resolución (150 o 300 ppp).',
    engine: 'server',
    engineBadge: 'Servidor (Motor Ghostscript)',
    engineNotice:
      'El documento se procesa en el servidor mediante Ghostscript para garantizar la fidelidad tipográfica y vectorial al renderizar cada página como imagen.',
    acceptedExtensions: ['.pdf'],
    acceptedMimeTypes: ['application/pdf'],
    outputFormats: ['png', 'jpg'],
    defaultOutputFormat: 'png',
    maxFileSizeMB: 40,
    maxBatchFiles: 3,
    supportsMultiple: false,
    parameters: [
      {
        id: 'dpi',
        label: 'Resolución de renderizado (PPP / DPI)',
        type: 'select',
        defaultValue: '150',
        options: [
          { label: '150 DPI (Estándar nítido — Rápido)', value: '150' },
          { label: '300 DPI (Alta resolución para impresión)', value: '300' },
          { label: '96 DPI (Ligero para vista web)', value: '96' },
        ],
      },
    ],
    steps: [
      'Sube el archivo PDF cuyas páginas quieras convertir en imagen.',
      'Selecciona el formato de salida (PNG o JPG) y la densidad de píxeles (150 o 300 DPI).',
      'Descarga la imagen directamente (si el PDF tiene 1 página) o un archivo ZIP con todas las páginas renderizadas.',
    ],
    limitations: [
      'Por seguridad y límites de memoria del alojamiento gratuito, se procesan hasta las primeras 30 páginas por documento en esta operación.',
    ],
    faqs: [
      {
        question: '¿Qué resolución debo elegir?',
        answer:
          '150 DPI ofrece una lectura perfecta en pantallas y presentaciones con un peso moderado. Elige 300 DPI únicamente si necesitas ampliar o imprimir las imágenes.',
      },
    ],
    relatedSlugs: ['imagenes-a-pdf', 'comprimir-pdf', 'dividir-pdf'],
  },

  // ================= DOCUMENTOS =================
  {
    slug: 'convertir-documento',
    title: 'Convertidor de Documentos (DOCX, TXT, HTML, PDF)',
    shortTitle: 'Convertir Documento',
    category: 'documentos',
    categoryLabel: 'Documentos',
    description:
      'Convierte documentos DOCX, TXT, Markdown y RTF a PDF, HTML limpio o texto plano conservando la estructura semántica.',
    metaTitle: 'Convertir Documentos DOCX y TXT a PDF o HTML Gratis | Kastral',
    metaDescription:
      'Transforma documentos Word (DOCX) y archivos de texto (TXT, MD) a PDF, HTML o texto limpio sin instalar programas.',
    engine: 'hybrid',
    engineBadge: 'Mammoth + Maquetador PDF',
    engineNotice:
      'Extraemos la estructura semántica (títulos, párrafos, listas y tablas) de tus archivos DOCX y TXT para generar un PDF limpio, HTML estándar o texto sin formato.',
    acceptedExtensions: ['.docx', '.txt', '.md', '.rtf'],
    acceptedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'application/rtf',
      'text/rtf',
    ],
    outputFormats: ['pdf', 'txt', 'html'],
    defaultOutputFormat: 'pdf',
    maxFileSizeMB: 25,
    maxBatchFiles: 10,
    supportsMultiple: true,
    popular: true,
    parameters: [],
    steps: [
      'Selecciona tu archivo DOCX, TXT, Markdown o RTF.',
      'Elige el formato de destino: PDF para compartir, HTML para publicar en web o TXT para extraer el texto limpio.',
      'Descarga el documento convertido al instante.',
    ],
    limitations: [
      'La conversión de DOCX a PDF sin LibreOffice reconstruye el flujo de texto, encabezados y párrafos de forma limpia, pero no replica diseños complejos a varias columnas, macros ni fuentes propietarias incrustadas.',
      'El formato antiguo .DOC binario (Word 97-2003) requiere conversión en un entorno con LibreOffice completo.',
    ],
    faqs: [
      {
        question: '¿Se conservan exactamente las fuentes y flotantes complejos de Word al pasar a PDF?',
        answer:
          'Nuestro motor extrae el contenido estructurado de DOCX y lo maqueta con tipografía limpia en PDF. Es ideal para informes, contratos, apuntes y artículos de texto, pero las portadas gráficas complejas pueden simplificarse.',
      },
    ],
    relatedSlugs: ['convertir-hoja-calculo', 'comprimir-pdf', 'combinar-pdf'],
  },
  {
    slug: 'convertir-hoja-calculo',
    title: 'Convertidor de Hojas de Cálculo (XLSX, CSV, JSON)',
    shortTitle: 'XLSX a CSV / JSON',
    category: 'documentos',
    categoryLabel: 'Documentos',
    description:
      'Convierte libros de Excel (XLSX, XLS, ODS) a archivos CSV, JSON estructurado o tablas HTML listas para importar en bases de datos.',
    metaTitle: 'Convertir Excel XLSX a CSV, JSON y HTML Gratis | Kastral',
    metaDescription:
      'Convierte hojas de cálculo XLSX y CSV entre sí o expórtalas a JSON estructurado directamente desde tu navegador.',
    engine: 'browser',
    engineBadge: '100 % Local en Navegador',
    engineNotice:
      'Las hojas de cálculo se analizan y transforman al instante respetando la codificación UTF-8 para tildes y caracteres especiales.',
    acceptedExtensions: ['.xlsx', '.xls', '.csv', '.ods'],
    acceptedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/vnd.oasis.opendocument.spreadsheet',
    ],
    outputFormats: ['csv', 'xlsx', 'json', 'html'],
    defaultOutputFormat: 'csv',
    maxFileSizeMB: 25,
    maxBatchFiles: 10,
    supportsMultiple: true,
    parameters: [
      {
        id: 'delimiter',
        label: 'Separador de columnas (para salida CSV)',
        type: 'select',
        defaultValue: ',',
        options: [
          { label: 'Coma estándar (,)', value: ',' },
          { label: 'Punto y coma (; — Compatible con Excel en español)', value: ';' },
          { label: 'Tabulador (TSV)', value: '\t' },
        ],
      },
    ],
    steps: [
      'Carga tu archivo Excel (.xlsx) o archivo de valores separados por comas (.csv).',
      'Selecciona si deseas obtener un CSV, un libro XLSX, un arreglo JSON o una tabla HTML.',
      'Descarga el archivo resultante con codificación UTF-8 verificada.',
    ],
    limitations: [
      'Al exportar un libro Excel con múltiples pestañas a CSV o JSON, se procesa la primera hoja activa del documento.',
    ],
    faqs: [
      {
        question: '¿Qué separador debo usar si voy a abrir el CSV en Excel en español?',
        answer:
          'En configuraciones regionales de España y Latinoamérica, Excel utiliza la coma para los decimales y espera que las columnas del CSV estén separadas por punto y coma (;). Selecciónalo en el desplegable para que se abra en columnas automáticamente.',
      },
    ],
    relatedSlugs: ['convertir-documento', 'crear-zip'],
  },

  // ================= AUDIO =================
  {
    slug: 'convertir-audio',
    title: 'Convertidor de Audio (MP3, WAV, AAC, FLAC, OGG)',
    shortTitle: 'Convertir Audio',
    category: 'audio',
    categoryLabel: 'Audio',
    description:
      'Convierte archivos de sonido y música entre MP3, WAV, AAC (M4A), FLAC y OGG Vorbis ajustando el bitrate mediante FFmpeg.',
    metaTitle: 'Convertir Audio a MP3, WAV, FLAC y AAC Gratis | Kastral',
    metaDescription:
      'Convierte pistas de audio entre MP3, WAV, FLAC, AAC y OGG con FFmpeg. Ajusta la calidad de bitrate (128k a 320k) sin marcas ni registros.',
    engine: 'server',
    engineBadge: 'Servidor (Motor FFmpeg)',
    engineNotice:
      'La codificación de audio se ejecuta en el servidor con FFmpeg real utilizando los códecs libmp3lame, pcm_s16le, aac, flac y libvorbis.',
    acceptedExtensions: ['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg'],
    acceptedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mp4', 'audio/flac', 'audio/ogg'],
    outputFormats: ['mp3', 'wav', 'aac', 'flac', 'ogg'],
    defaultOutputFormat: 'mp3',
    maxFileSizeMB: 50,
    maxBatchFiles: 10,
    supportsMultiple: true,
    popular: true,
    parameters: [
      {
        id: 'bitrate',
        label: 'Bitrate de audio (para MP3, AAC, OGG)',
        type: 'select',
        defaultValue: '192k',
        options: [
          { label: '320 kbps (Máxima calidad de compresión)', value: '320k' },
          { label: '192 kbps (Estándar equilibrado)', value: '192k' },
          { label: '128 kbps (Ligero para voz y podcasts)', value: '128k' },
          { label: '64 kbps (Mínimo peso para grabaciones de voz)', value: '64k' },
        ],
      },
    ],
    steps: [
      'Selecciona uno o varios archivos de audio desde tu equipo.',
      'Elige el formato de destino (MP3, WAV, AAC, FLAC u OGG) y la tasa de bits deseada.',
      'Inicia la codificación y descarga el archivo de audio procesado.',
    ],
    limitations: [
      'Convertir un archivo con pérdida (como un MP3 a 128 kbps) a un formato sin pérdida (como WAV o FLAC) aumentará el tamaño del archivo, pero no recuperará las frecuencias que ya se descartaron en el MP3 original.',
    ],
    faqs: [
      {
        question: '¿Qué bitrate es recomendable para un podcast o grabación de voz?',
        answer:
          'Para voz hablada, un MP3 o AAC a 128 kbps ofrece una claridad excelente ocupando la mitad de espacio que un archivo a 256 o 320 kbps.',
      },
    ],
    relatedSlugs: ['extraer-audio-video', 'convertir-video', 'comprimir-video'],
  },

  // ================= VÍDEO =================
  {
    slug: 'convertir-video',
    title: 'Convertidor de Vídeo (MP4, WebM, MKV)',
    shortTitle: 'Convertir Vídeo',
    category: 'video',
    categoryLabel: 'Vídeo',
    description:
      'Transforma tus clips de vídeo entre contenedores MP4 (H.264), WebM (VP9) y MKV con control de resolución mediante FFmpeg.',
    metaTitle: 'Convertir Vídeo a MP4, WebM y MKV Gratis Online | Kastral',
    metaDescription:
      'Convierte vídeos a formato MP4 compatible con todos los navegadores y móviles, WebM o MKV utilizando FFmpeg.',
    engine: 'server',
    engineBadge: 'Servidor (Motor FFmpeg)',
    engineNotice:
      'El vídeo se sube temporalmente al servidor para ser transcodificado con FFmpeg. Sujeto al límite de tiempo de ejecución de 60 segundos por tarea.',
    acceptedExtensions: ['.mp4', '.webm', '.mkv', '.mov', '.avi'],
    acceptedMimeTypes: ['video/mp4', 'video/webm', 'video/x-matroska', 'video/quicktime', 'video/x-msvideo'],
    outputFormats: ['mp4', 'webm', 'mkv'],
    defaultOutputFormat: 'mp4',
    maxFileSizeMB: 50,
    maxBatchFiles: 3,
    supportsMultiple: false,
    parameters: [
      {
        id: 'resolution',
        label: 'Resolución de salida',
        type: 'select',
        defaultValue: 'original',
        options: [
          { label: 'Mantener resolución original', value: 'original' },
          { label: '1080p (Full HD — 1920px ancho)', value: '1920' },
          { label: '720p (HD — 1280px ancho)', value: '1280' },
          { label: '480p (Compacto — 854px ancho)', value: '854' },
        ],
      },
    ],
    steps: [
      'Selecciona el archivo de vídeo que deseas convertir (hasta 50 MB en el plan gratuito).',
      'Elige el formato contenedor de salida (MP4 es el más compatible) y la resolución.',
      'Espera a que FFmpeg complete la recodificación y descarga tu vídeo.',
    ],
    limitations: [
      'El procesamiento de vídeo requiere un uso intensivo de CPU. En alojamiento gratuito, se limita a clips cortos de hasta 50 MB y 60 segundos de tiempo máximo de codificación.',
    ],
    faqs: [
      {
        question: '¿Qué códec utiliza la salida MP4?',
        answer:
          'Utilizamos el códec de vídeo H.264 (libx264) con formato de píxel yuv420p y audio AAC, lo que garantiza que el vídeo se reproduzca sin problemas en Windows, macOS, iOS, Android y navegadores web.',
      },
    ],
    relatedSlugs: ['comprimir-video', 'extraer-audio-video', 'convertir-audio'],
  },
  {
    slug: 'comprimir-video',
    title: 'Comprimir Vídeo MP4 y WebM',
    shortTitle: 'Comprimir Vídeo',
    category: 'video',
    categoryLabel: 'Vídeo',
    description:
      'Reduce el tamaño en megabytes de tus vídeos ajustando el factor de tasa constante (CRF) y la resolución con FFmpeg.',
    metaTitle: 'Comprimir Vídeo MP4 Gratis Online sin Marcas de Agua | Kastral',
    metaDescription:
      'Aligera el peso de tus vídeos MP4, MOV y WebM para compartirlos por mensajería o correo electrónico sin marcas de agua.',
    engine: 'server',
    engineBadge: 'Servidor (FFmpeg H.264 CRF)',
    engineNotice:
      'La compresión ajusta el parámetro CRF de H.264 y opcionalmente reduce la escala del vídeo en el servidor.',
    acceptedExtensions: ['.mp4', '.webm', '.mkv', '.mov'],
    acceptedMimeTypes: ['video/mp4', 'video/webm', 'video/x-matroska', 'video/quicktime'],
    outputFormats: ['mp4'],
    defaultOutputFormat: 'mp4',
    maxFileSizeMB: 50,
    maxBatchFiles: 3,
    supportsMultiple: false,
    popular: true,
    parameters: [
      {
        id: 'crf',
        label: 'Nivel de compresión de vídeo',
        type: 'select',
        defaultValue: '28',
        options: [
          { label: 'Equilibrada (CRF 28 — Gran ahorro con buena calidad)', value: '28' },
          { label: ' Compresión fuerte (CRF 33 — Mínimo tamaño de archivo)', value: '33' },
          { label: 'Compresión ligera (CRF 24 — Alta fidelidad visual)', value: '24' },
        ],
      },
      {
        id: 'resolution',
        label: 'Escala de resolución',
        type: 'select',
        defaultValue: 'original',
        options: [
          { label: 'Mantener resolución original', value: 'original' },
          { label: 'Reducir a 720p (1280px ancho — Ahorra mucho espacio)', value: '1280' },
          { label: 'Reducir a 480p (854px ancho — Máximo ahorro)', value: '854' },
        ],
      },
    ],
    steps: [
      'Carga el vídeo que necesitas comprimir.',
      'Selecciona el nivel de compresión (CRF 28 suele reducir entre un 40 % y un 70 % el peso en vídeos de móvil).',
      'Descarga el vídeo MP4 optimizado y revisa la comparativa de tamaño.',
    ],
    limitations: [
      'Limitado a archivos de hasta 50 MB para evitar agotar la memoria y el tiempo de CPU del servidor.',
    ],
    faqs: [
      {
        question: '¿Se añade alguna marca de agua al vídeo comprimido?',
        answer:
          'Nunca. Kastral no añade marcas de agua ni logotipos sobre tus vídeos, imágenes ni documentos.',
      },
    ],
    relatedSlugs: ['convertir-video', 'extraer-audio-video', 'comprimir-imagen'],
  },
  {
    slug: 'extraer-audio-video',
    title: 'Extraer Audio de un Vídeo (MP4 a MP3 / WAV)',
    shortTitle: 'Extraer Audio de Vídeo',
    category: 'video',
    categoryLabel: 'Vídeo',
    description:
      'Separa la pista de sonido de cualquier vídeo MP4, WebM, MOV o MKV y descárgala como un archivo de audio MP3 o WAV independiente.',
    metaTitle: 'Extraer Audio de un Vídeo a MP3 o WAV Gratis | Kastral',
    metaDescription:
      'Convierte vídeos MP4, MOV y WebM en archivos de audio MP3 o WAV en segundos extrayendo únicamente la pista sonora.',
    engine: 'server',
    engineBadge: 'Servidor (FFmpeg Demux/Audio)',
    engineNotice:
      'FFmpeg descarta la pista de vídeo y codifica únicamente el flujo de sonido en MP3 o WAV.',
    acceptedExtensions: ['.mp4', '.webm', '.mkv', '.mov', '.avi'],
    acceptedMimeTypes: ['video/mp4', 'video/webm', 'video/x-matroska', 'video/quicktime', 'video/x-msvideo'],
    outputFormats: ['mp3', 'wav', 'aac'],
    defaultOutputFormat: 'mp3',
    maxFileSizeMB: 50,
    maxBatchFiles: 5,
    supportsMultiple: true,
    parameters: [
      {
        id: 'bitrate',
        label: 'Calidad del audio extraído',
        type: 'select',
        defaultValue: '192k',
        options: [
          { label: '192 kbps (Calidad estándar alta)', value: '192k' },
          { label: '320 kbps (Máxima calidad MP3)', value: '320k' },
          { label: '128 kbps (Compacto)', value: '128k' },
        ],
      },
    ],
    steps: [
      'Selecciona el vídeo del que deseas obtener el sonido.',
      'Elige MP3 (compatible y ligero) o WAV (sin compresión).',
      'Pulsa en Procesar y descarga el archivo de audio extraído.',
    ],
    limitations: [
      'Si el archivo de vídeo original no contiene ninguna pista de audio (vídeo mudo), el motor devolverá un aviso indicando que no existe canal sonoro que extraer.',
    ],
    faqs: [
      {
        question: '¿Cuánto tarda en extraerse el audio de un vídeo?',
        answer:
          'Al no tener que recodificar los fotogramas de vídeo, la extracción de audio es muy rápida y suele completarse en pocos segundos.',
      },
    ],
    relatedSlugs: ['convertir-audio', 'convertir-video', 'comprimir-video'],
  },

  // ================= ARCHIVOS COMPRIMIDOS =================
  {
    slug: 'crear-zip',
    title: 'Crear Archivo ZIP Comprimido',
    shortTitle: 'Crear Archivo ZIP',
    category: 'archivos',
    categoryLabel: 'Comprimidos',
    description:
      'Agrupa y comprime múltiples archivos sueltos o carpetas en un único paquete .ZIP estándar directamente en tu navegador.',
    metaTitle: 'Crear Archivo ZIP Online Gratis desde el Navegador | Kastral',
    metaDescription:
      'Empaqueta y comprime varios documentos, fotos o carpetas en un único archivo ZIP sin subir tus datos a Internet.',
    engine: 'browser',
    engineBadge: '100 % Local en Navegador (JSZip)',
    engineNotice:
      'La creación del archivo ZIP ocurre íntegramente en la memoria de tu navegador con compresión DEFLATE.',
    acceptedExtensions: ['*'],
    acceptedMimeTypes: ['*/*'],
    outputFormats: ['zip'],
    defaultOutputFormat: 'zip',
    maxFileSizeMB: 100,
    maxBatchFiles: 50,
    supportsMultiple: true,
    mergesIntoSingleOutput: true,
    popular: true,
    parameters: [
      {
        id: 'zipFilename',
        label: 'Nombre del archivo ZIP',
        type: 'text',
        defaultValue: 'archivos-kastral',
        description: 'Nombre del paquete .zip que se descargará.',
      },
      {
        id: 'compressionLevel',
        label: 'Nivel de compresión DEFLATE',
        type: 'select',
        defaultValue: '6',
        options: [
          { label: 'Nivel 6 — Equilibrado (Recomendado)', value: '6' },
          { label: 'Nivel 9 — Compresión máxima (Más lento)', value: '9' },
          { label: 'Nivel 1 — Empaquetado rápido', value: '1' },
        ],
      },
    ],
    steps: [
      'Arrastra todos los archivos que quieras agrupar hacia la zona de carga.',
      'Asigna un nombre para tu paquete ZIP y elige el nivel de compresión.',
      'Haz clic en Crear ZIP y descarga el archivo único resultante.',
    ],
    limitations: [
      'Recuerda que crear un archivo ZIP empaqueta y comprime los datos sin cambiar el formato interno de cada archivo (para cambiar el formato de una foto o documento, usa las herramientas de conversión).',
    ],
    faqs: [
      {
        question: '¿Mis archivos se suben a algún servidor al crear un ZIP?',
        answer:
          'No. El empaquetado ZIP se ejecuta localmente en tu propio navegador, lo que te permite agrupar archivos rápidamente sin consumir ancho de banda de subida.',
      },
    ],
    relatedSlugs: ['extraer-zip', 'comprimir-pdf', 'comprimir-imagen'],
  },
  {
    slug: 'extraer-zip',
    title: 'Extraer y Descomprimir Archivos ZIP',
    shortTitle: 'Extraer ZIP',
    category: 'archivos',
    categoryLabel: 'Comprimidos',
    description:
      'Inspecciona el contenido de cualquier archivo .ZIP y descarga sus archivos individuales desde el navegador con protección contra rutas maliciosas.',
    metaTitle: 'Descomprimir y Extraer Archivos ZIP Online Gratis | Kastral',
    metaDescription:
      'Abre archivos ZIP directamente en tu navegador, revisa la lista de archivos que contienen y descárgalos de forma individual y segura.',
    engine: 'browser',
    engineBadge: '100 % Local en Navegador',
    engineNotice:
      'El archivo ZIP se inspecciona y descomprime localmente en tu navegador con validación de seguridad contra rutas fuera de directorio (Zip Slip).',
    acceptedExtensions: ['.zip'],
    acceptedMimeTypes: ['application/zip', 'application/x-zip-compressed'],
    outputFormats: ['extract'],
    defaultOutputFormat: 'extract',
    maxFileSizeMB: 100,
    maxBatchFiles: 1,
    supportsMultiple: false,
    parameters: [],
    steps: [
      'Selecciona el archivo .ZIP que deseas abrir o descomprimir.',
      'Pulsa en Extraer contenido para validar y listar todos los archivos internos.',
      'Descarga cualquiera de los archivos internos individualmente con un clic.',
    ],
    limitations: [
      'Los archivos ZIP cifrados con contraseña o divididos en múltiples volúmenes (.z01, .z02) no pueden descomprimirse en el navegador.',
    ],
    faqs: [
      {
        question: '¿Qué es la protección contra Zip Slip que aplica Kastral?',
        answer:
          'Algunos archivos comprimidos malintencionados incluyen rutas relativas como "../../" en los nombres de sus archivos internos. Kastral sanea y bloquea automáticamente cualquier ruta sospechosa antes de extraer.',
      },
    ],
    relatedSlugs: ['crear-zip', 'combinar-pdf', 'convertir-imagen'],
  },
];

export function getToolBySlug(slug: string): KastralTool | undefined {
  return KASTRAL_TOOLS.find((t) => t.slug === slug);
}

export function getToolsByCategory(category: ToolCategory): KastralTool[] {
  return KASTRAL_TOOLS.filter((t) => t.category === category);
}
