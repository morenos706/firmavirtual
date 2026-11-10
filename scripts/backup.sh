#!/usr/bin/env bash
# Copia de seguridad: base de datos (pg_dump) + almacenamiento de documentos, con huellas SHA-256.
# Uso: DATABASE_URL=... STORAGE_DIR=./storage BACKUP_DIR=./backups bash scripts/backup.sh
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="${BACKUP_DIR:-./backups}/$STAMP"
mkdir -p "$OUT"
DB_URL="${DATABASE_URL%%\?*}"
pg_dump --format=custom --no-owner --file "$OUT/firmaqr.dump" "$DB_URL"
tar -czf "$OUT/storage.tar.gz" -C "$(dirname "${STORAGE_DIR:-./storage}")" "$(basename "${STORAGE_DIR:-./storage}")"
( cd "$OUT" && sha256sum firmaqr.dump storage.tar.gz > SHA256SUMS )
echo "Copia creada en $OUT"
cat "$OUT/SHA256SUMS"
