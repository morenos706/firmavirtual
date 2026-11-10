/**
 * Worker de la cola de correos (proceso independiente).
 * Uso: npm run worker   — procesa la cola cada WORKER_INTERVAL_MS (por defecto 15 s).
 * Varios workers pueden ejecutarse en paralelo: los trabajos se reclaman con FOR UPDATE SKIP LOCKED.
 */
import { processEmailQueue } from '../src/server/email/queue';
import { prisma } from '../src/lib/db';

const interval = Number(process.env.WORKER_INTERVAL_MS || 15000);
let stopping = false;

async function loop() {
  console.info(`[worker] iniciado (intervalo ${interval} ms, proveedor ${process.env.EMAIL_PROVIDER || 'file'})`);
  while (!stopping) {
    try {
      const n = await processEmailQueue();
      if (n) console.info(`[worker] ${new Date().toISOString()} procesados ${n} correos`);
    } catch (e) {
      console.error('[worker] error', e);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  await prisma.$disconnect();
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true; console.info('[worker] deteniendo…'); });
loop();
