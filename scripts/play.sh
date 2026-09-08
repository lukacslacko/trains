#!/usr/bin/env bash
# Play from a frozen snapshot of the latest commit, so edits to the working
# tree never reload your duty. Re-run to move the snapshot to the newest commit.
#
#   npm run play            → http://127.0.0.1:4173/
#   PORT=4200 npm run play  → another port
set -euo pipefail
cd "$(dirname "$0")/.."
REV=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)
if [ ! -d .play ]; then
  git worktree add --detach .play "$REV" >/dev/null 2>&1
else
  git -C .play checkout --detach -q "$REV"
fi
ln -sfn "$(pwd)/node_modules" .play/node_modules
echo "Serving snapshot $SHORT ($(git log -1 --format=%s "$REV" | cut -c1-60))"
echo "Your play is isolated from any later edits until you re-run this."
cd .play
exec npx vite --host 127.0.0.1 --port "${PORT:-4173}" --strictPort
