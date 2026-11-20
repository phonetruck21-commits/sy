#!/usr/bin/env bash
# Nightly backup: database dump + media files. Run from the project folder, e.g. via cron:
#   15 3 * * * cd /opt/sy-live && ./deploy/backup.sh /backup/sy-live >> /var/log/sy-backup.log 2>&1
# Keep backups on a different disk/host. Test restores regularly.
set -euo pipefail
DEST="${1:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"
docker compose exec -T db pg_dump -U sylive -d sylive --format=custom > "$DEST/db-$STAMP.dump"
docker compose run --rm --no-deps -v "$(realpath "$DEST")":/backup --entrypoint sh api \
  -c "tar -czf /backup/media-$STAMP.tar.gz -C /data media"
find "$DEST" -type f \( -name 'db-*.dump' -o -name 'media-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "backup done: $DEST ($STAMP)"
# Restore:  docker compose exec -T db pg_restore -U sylive -d sylive --clean < db-XXXX.dump
