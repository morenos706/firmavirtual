# Formato institucional de la planilla — 11020001F-01 V0.6

## Análisis del documento de referencia

Se convirtió `11020001F01_V0.6_FORMATO_PARA_EL_REGISTRO_DE_ASISTENCIA_1.doc` a DOCX/PDF y se extrajeron las medidas exactas del XML de Word (en twips, 1/20 pt):

| Elemento | Medida original | Reproducción |
|---|---|---|
| Página | Carta 12240 × 15840 | Carta 612 × 792 pt |
| Márgenes | izq. 1418 · der. 851 · sup./inf. 737 · encabezado/pie 510 | idénticos |
| Encabezado | Logo (1314450 × 304800 EMU) a la izquierda · «Página X de Y» (Arial 9/11) a la derecha | idéntico; logo configurable |
| Título | «REGISTRO DE ASISTENCIA», centrado, negrita | idéntico (título configurable) |
| Tabla de información | ancho 10512, sangría −459, filas 454/363/454/454, Arial 11 | idéntica, con valores autocompletados sobre las líneas |
| Campos | Programa / Tema / Documento (2 líneas) · Formador · Institución · Interno _ · Externo _ · Fecha DD/MM/AA · Hora Inicia · Hora Fin · Duración (Horas) | idénticos; Interno/Externo se marcan con «X» |
| Tabla de asistentes | columnas 426 · 1560 · 4110 · 1560 · 1559 · 1843 (# · Cédula · Nombre y Apellidos · Empresa · Gerencia · Área), encabezado negro con texto blanco en negrita 10,5 pt, filas de alto mínimo 397, bordes 0,5 pt | idéntica |
| Distribución | Página 1: filas 1–25 · Página 2: filas 26–57 | idéntica (25 / 32 filas por página) |
| Pie | «11020001F-01 V0.6» a la derecha | idéntico (código y versión configurables) |

> El documento entregado se visualiza en 2 páginas con contenido (filas 1–57); la tercera página que muestra Word corresponde a un salto/página final sin filas adicionales. FirmaQR reproduce la distribución de las filas y repite el mismo diseño en las páginas siguientes.

## Reglas de generación

- **Cualquier cantidad de participantes**: página 1 con hasta 25 filas; páginas siguientes con hasta 32, encabezado institucional y encabezado de tabla repetidos, numeración consecutiva.
- **Nunca se trunca** un nombre ni un número de identificación: la letra se reduce hasta 5,5 pt y, si aún no cabe, la fila crece; una fila **nunca se divide** entre páginas.
- **Pocos participantes**: se conserva la estructura completa de la página; las filas no usadas se **anulan con una línea diagonal** y la leyenda «ESPACIO SIN REGISTROS — ANULADO» para impedir adiciones manuales.
- **Vista previa** con marca de agua «VISTA PREVIA» mientras el evento está abierto; **versión definitiva** conservada al cierre con su SHA-256 y código de verificación.

## Columna «Firma» (ajuste solicitado)

Por solicitud de la empresa se agregó una séptima columna **«Firma»** a la derecha, con la imagen de la firma manuscrita de cada asistente:

- Se conserva el **ancho total** de la tabla (11058 twips), el **orden** de las columnas originales, el **alto de fila** y la distribución 25/32.
- Anchos con firma: 426 · 1320 · 3300 · 1320 · 1320 · 1440 · **1932** twips.
- La firma se recorta a su contorno en el dispositivo para aprovechar el espacio.
- Es configurable en **Configuración → Empresa y formato → Incluir la columna «Firma»** (activa por defecto). Si se desactiva, la planilla vuelve a las 6 columnas exactas del formato.

## Referencia a la evidencia electrónica

Bajo cada nombre se imprime «Firma electrónica · Exp. FQR-XXXX-XXXX-XXXX» (código del expediente digital), y el pie de cada página indica el código de verificación de la planilla y la URL de verificación. La imagen de la firma y toda la evidencia técnica se conservan en el expediente individual.
