#!/bin/bash
# ============================================================
# PRISM deploy script for tsulgi.io/weightloss
# Run from the repo root: bash deploy.sh
# Requires: sshpass (or switch to key auth)
# ============================================================
set -e

HOST="pdx1-shared-a2-06.dreamhost.com"
USER="dh_89sgih"
PORT=22
# Common DreamHost web root for domain tsulgi.io:
REMOTE_DIR="/home/dh_89sgih/tsulgi.io/weightloss"

# --- Prompt for password (or set SSHPASS env var before running) --------
if [ -z "$SSHPASS" ]; then
  read -s -p "SSH password for $USER@$HOST: " SSHPASS
  echo
  export SSHPASS
fi

# --- Verify tools -------------------------------------------------------
command -v sshpass >/dev/null 2>&1 || {
  echo "ERROR: sshpass not installed."
  echo "  macOS:   brew install hudochenkov/sshpass/sshpass"
  echo "  Ubuntu:  sudo apt install sshpass"
  echo "Alternative: set up SSH keys via DreamHost panel and remove sshpass from this script."
  exit 1
}
command -v scp >/dev/null 2>&1 || { echo "ERROR: scp not installed"; exit 1; }

# --- Ensure remote directory exists -------------------------------------
echo "→ Ensuring remote directory: $REMOTE_DIR"
sshpass -e ssh -o StrictHostKeyChecking=accept-new -p "$PORT" "$USER@$HOST" \
  "mkdir -p '$REMOTE_DIR'"

# --- Upload files -------------------------------------------------------
echo "→ Uploading index.html, styles.css, app.js"
sshpass -e scp -o StrictHostKeyChecking=accept-new -P "$PORT" \
  index.html styles.css app.js \
  "$USER@$HOST:$REMOTE_DIR/"

# --- Verify -------------------------------------------------------------
echo "→ Verifying upload:"
sshpass -e ssh -o StrictHostKeyChecking=accept-new -p "$PORT" "$USER@$HOST" \
  "ls -la '$REMOTE_DIR'"

echo
echo "✓ Deployed!"
echo "  → https://tsulgi.io/weightloss/"
echo
echo "⚠  SECURITY: Rotate your DreamHost password now."
