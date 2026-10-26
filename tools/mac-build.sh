#!/bin/sh
# Run an npm script (default: build) on the Mac.
# npm needs symlinks, which the shared Windows drive does not support, so this works in a
# Mac-native copy of the project and copies package-lock.json back.
#   sh tools/mac-build.sh          # npm run build  (output in the copy's dist/)
#   sh tools/mac-build.sh dev      # dev server, re-syncing source changes every second
set -e
export PATH="/opt/homebrew/bin:$PATH"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${BUILD_DIR:-$HOME/Library/Caches/bai-juyi-friends-build}"
sync() {
  rsync -a --delete --exclude node_modules --exclude dist --exclude .git \
    --exclude 'tools/.cache' --exclude '._*' --exclude .DS_Store "$SRC/" "$DEST/"
}
mkdir -p "$DEST"
sync
cd "$DEST"
npm install --no-audit --no-fund --prefer-offline
cp package-lock.json "$SRC/package-lock.json"
if [ "${1:-build}" = dev ]; then
  ( while sleep 1; do sync; done ) &
  trap 'kill $!' EXIT
  npm run dev -- --host 127.0.0.1 --port "${PORT:-5173}" --strictPort
else
  npm run "$1"
  echo "Built into $DEST/dist"
fi
