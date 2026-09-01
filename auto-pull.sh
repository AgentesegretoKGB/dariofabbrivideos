#!/bin/bash
# auto-pull.sh — aggiorna la cartella locale da GitHub, ma solo se non hai
# modifiche in sospeso (per non rischiare conflitti con lavoro non salvato).

REPO_DIR="$HOME/Desktop/dariofabbrivideos-progetto"
cd "$REPO_DIR" || exit 1

if [ -n "$(git status --porcelain)" ]; then
  echo "$(date): ci sono modifiche locali non committate, salto il pull." >> auto-pull.log
  exit 0
fi

git pull origin main --no-edit >> auto-pull.log 2>&1
echo "$(date): pull eseguito." >> auto-pull.log
