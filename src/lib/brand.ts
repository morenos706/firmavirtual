/**
 * Identidad visual según el Manual de Marca Prebel (Brandbook v1, marzo 2025).
 * Colores corporativos, secundarios y barra de color en el orden definido por el manual.
 */
export const BRAND = {
  azul: '#40637D', // AZUL PREBEL · Pantone 7699C — color emblemático
  gris: '#55606B', // GRIS PREBEL · Pantone 431C
  blanco: '#E3DED8', // BLANCO PREBEL · Pantone Warm Gray 1C
  sec1: '#5E8AB4', // Secundario 1 · 646C
  sec2: '#8DC8E8', // Secundario 2 · 2905
  sec3: '#5C7F71', // Secundario 3 · 5555C
  sec4: '#6FA287', // Secundario 4 · 556C
  sec5: '#FF8674', // Secundario 5 · 170C
};

/** Barra de color (elemento decorativo): Secundario 1, 4, 2, 3 y 5, de izquierda a derecha. */
export const COLOR_BAR = [BRAND.sec1, BRAND.sec4, BRAND.sec2, BRAND.sec3, BRAND.sec5];

/** Dibuja la barra de color en un PDF (función decorativa, nunca como objeto principal). */
export function drawColorBar(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  const seg = w / COLOR_BAR.length;
  COLOR_BAR.forEach((c, i) => doc.rect(x + i * seg, y, seg + 0.5, h).fill(c));
}
