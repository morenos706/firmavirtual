'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { Eraser, RotateCcw } from 'lucide-react';

export type SignatureResult = { imageDataUrl: string; strokeCount: number; pointCount: number; drawDurationMs: number; pointerType: string | null };
export type SignatureHandle = { capture: () => SignatureResult | null; clear: () => void };

/** Recorta la firma a su contorno (con margen) para conservar buena resolución en la planilla y el comprobante. */
function trimmed(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
  const pad = 16;
  let w = maxX - minX + 1 + pad * 2;
  let h = maxY - minY + 1 + pad * 2;
  const outW = Math.max(w, 300);
  const outH = Math.max(h, 100);
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const o = out.getContext('2d')!;
  o.fillStyle = '#FFFFFF';
  o.fillRect(0, 0, outW, outH);
  w = maxX - minX + 1;
  h = maxY - minY + 1;
  o.drawImage(canvas, minX, minY, w, h, (outW - w) / 2, (outH - h) / 2, w, h);
  return out.toDataURL('image/png');
}

export const SignatureCanvas = forwardRef<SignatureHandle, { onChange?: (empty: boolean) => void }>(function SignatureCanvas({ onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const timing = useRef<{ first: number | null; last: number; pointer: string | null }>({ first: null, last: 0, pointer: null });
  const history = useRef<ReturnType<SignaturePad['toData']>>([]);
  const [empty, setEmpty] = useState(true);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas || !pad) return;
    const data = pad.toData();
    const ratio = Math.max(window.devicePixelRatio || 1, 2); // alta resolución
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')!.scale(ratio, ratio);
    pad.clear();
    pad.fromData(data);
  }, []);

  useEffect(() => {
    const pad = new SignaturePad(canvasRef.current!, { minWidth: 0.8, maxWidth: 2.6, penColor: '#0b1f33', backgroundColor: 'rgba(0,0,0,0)', throttle: 8 });
    padRef.current = pad;
    pad.addEventListener('beginStroke', (e: Event) => {
      const pe = (e as CustomEvent).detail as PointerEvent | MouseEvent | TouchEvent;
      timing.current.pointer = 'pointerType' in pe ? (pe as PointerEvent).pointerType : 'touches' in pe ? 'touch' : 'mouse';
      timing.current.first ??= performance.now();
    });
    pad.addEventListener('endStroke', () => {
      timing.current.last = performance.now();
      history.current = pad.toData();
      setEmpty(pad.isEmpty());
      onChange?.(pad.isEmpty());
    });
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      pad.off();
    };
  }, [resize, onChange]);

  const clear = () => {
    padRef.current?.clear();
    history.current = [];
    timing.current = { first: null, last: 0, pointer: null };
    setEmpty(true);
    onChange?.(true);
  };
  const undo = () => {
    const pad = padRef.current;
    if (!pad) return;
    const data = pad.toData();
    data.pop();
    pad.fromData(data);
    setEmpty(pad.isEmpty());
    onChange?.(pad.isEmpty());
  };

  useImperativeHandle(ref, () => ({
    clear,
    capture: () => {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) return null;
      const data = pad.toData();
      return {
        imageDataUrl: trimmed(canvasRef.current!),
        strokeCount: data.length,
        pointCount: data.reduce((a, s) => a + s.points.length, 0),
        drawDurationMs: Math.round((timing.current.last || performance.now()) - (timing.current.first ?? performance.now())),
        pointerType: timing.current.pointer,
      };
    },
  }));

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white">
        <canvas ref={canvasRef} className="block h-56 w-full touch-none rounded-xl sm:h-64" aria-label="Área de firma" />
        <div className="pointer-events-none absolute bottom-10 left-8 right-8 border-b border-slate-300" />
        <span className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-xs text-slate-400">{empty ? 'Firme aquí con el dedo, lápiz digital o mouse' : 'Firma del participante'}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-navy hover:bg-mist">
          <Eraser className="h-4 w-4" /> Borrar
        </button>
        <button type="button" onClick={undo} disabled={empty} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-navy hover:bg-mist disabled:opacity-40">
          <RotateCcw className="h-4 w-4" /> Deshacer trazo
        </button>
      </div>
    </div>
  );
});
