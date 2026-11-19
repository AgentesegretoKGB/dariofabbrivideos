#!/bin/bash
# Installazione del Trascrittore sul Mac. Si lancia UNA volta incollando nel Terminale:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/AgentesegretoKGB/dariofabbrivideos/main/tools/trascrittore/installa.sh)"
# Si può rilanciare quando si vuole: rifà solo i passi che mancano.

set -e
REPO_URL="https://github.com/AgentesegretoKGB/dariofabbrivideos.git"
HOME_DIR="$HOME/Trascrittore"
CLONE="$HOME_DIR/dariofabbrivideos"
MODEL_DIR="$HOME_DIR/modelli"
MODEL="$MODEL_DIR/ggml-large-v3-turbo-q5_0.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"
LAUNCHER="$HOME/Desktop/Trascrivi video.command"

passo() { printf "\n\033[1;31m▶ %s\033[0m\n" "$1"; }

if [ "$(uname)" != "Darwin" ]; then echo "Questo programma è fatto per il Mac."; exit 1; fi
mkdir -p "$HOME_DIR" "$MODEL_DIR"

passo "1/5 Homebrew (installa gli altri programmi)"
if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)";
elif [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
if ! command -v brew >/dev/null 2>&1; then
  echo "Installo Homebrew: ti chiederà la password del Mac (mentre la scrivi non si vede nulla, è normale)."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; else eval "$(/usr/local/bin/brew shellenv)"; fi
else
  echo "Homebrew c'è già."
fi

passo "2/5 Programmi: git, node, yt-dlp, ffmpeg, whisper, GitHub"
brew install git node yt-dlp ffmpeg whisper-cpp gh
brew upgrade yt-dlp >/dev/null 2>&1 || true   # yt-dlp va tenuto aggiornato

passo "3/5 Accesso a GitHub (serve per salvare le trascrizioni nel sito)"
if gh auth status >/dev/null 2>&1; then
  echo "Sei già collegato a GitHub."
else
  echo "Si aprirà il browser: accedi con l'account GitHub del sito e inserisci il codice che compare qui sotto."
  gh auth login --hostname github.com --git-protocol https --web
fi
gh auth setup-git

passo "4/5 Copia del sito sul Mac"
if [ -d "$CLONE/.git" ]; then
  git -C "$CLONE" pull --rebase --quiet origin main && echo "Copia aggiornata."
else
  git clone --filter=blob:none "$REPO_URL" "$CLONE"
fi
git -C "$CLONE" config user.name "Trascrittore"
git -C "$CLONE" config user.email "trascrittore@users.noreply.github.com"

passo "5/5 Modello di Whisper per l'italiano (circa 550 MB, solo la prima volta)"
if [ -s "$MODEL" ] && [ "$(stat -f%z "$MODEL")" -gt 500000000 ]; then
  echo "Il modello c'è già."
else
  curl -L --fail -C - -o "$MODEL" "$MODEL_URL"
fi

cat > "$LAUNCHER" <<EOF
#!/bin/bash
# Doppio clic per trascrivere i video del catalogo che non hanno ancora la trascrizione.
if [ -x /opt/homebrew/bin/brew ]; then eval "\$(/opt/homebrew/bin/brew shellenv)"; else eval "\$(/usr/local/bin/brew shellenv)"; fi
exec bash "$CLONE/tools/trascrittore/trascrivi.sh"
EOF
chmod +x "$LAUNCHER"

printf "\n\033[1;32m✓ Installazione completata.\033[0m\n"
echo "Sulla Scrivania c'è «Trascrivi video»: fai doppio clic per partire."
