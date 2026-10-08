#!/usr/bin/env bash
# Runs a command with WP4's capture host in place of Gradins' home, then restores the real file.
#   with-host.sh <command ...>
set -euo pipefail
# One host swap at a time: two runs would each take the other's host for the real file.
exec 9>/tmp/.mc-wp4-host.lock
flock 9
ROOT="$(git rev-parse --show-toplevel)"
TARGET="$ROOT/src/components/gradins/GradinsHome.tsx"
HOST="$ROOT/docs/product/manager-card-section/wp4/capture/GradinsHome.wp4-host.tsx"
cp "$TARGET" "$TARGET.real"
trap 'mv "$TARGET.real" "$TARGET"' EXIT
cp "$HOST" "$TARGET"
sleep 7
"$@"
