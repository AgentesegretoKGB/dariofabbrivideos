#!/bin/bash
# Lanciato da «Trascrivi video» sulla Scrivania.
cd "$(dirname "$0")/../.." || exit 1
clear
printf "\033[1;31mTRASCRITTORE — Campacavallo\033[0m\n\n"
echo "Aggiorno la copia del sito e i programmi…"
git pull --rebase --quiet origin main || echo "(non sono riuscito ad aggiornare: continuo con la copia che ho)"
brew upgrade --quiet yt-dlp >/dev/null 2>&1 || true

echo
echo "Incolla il link di un video da trascrivere,"
echo "oppure premi Invio per trascrivere TUTTI i video che non hanno ancora la trascrizione."
read -r -p "> " LINK

# Il Mac non va in stop finché lavora (caffeinate), anche se lo schermo si spegne
caffeinate -i node tools/trascrittore/trascrivi.mjs ${LINK:+"$LINK"}
echo
read -r -p "Finito. Premi Invio per chiudere questa finestra."
