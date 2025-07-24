set -e

# === Konfiguracja ===
RAW_DOCS_DIR="./raw_airport_docs"
TXT_DOCS_DIR="./airport_docs"
DOCWIRE_EXEC="./docwire/build/docwire"

if [ ! -f "$DOCWIRE_EXEC" ]; then
    echo "❌ BŁĄD KRYTYCZNY: Nie znaleziono programu Docwire w ścieżce: $DOCWIRE_EXEC"
    echo "Upewnij się, że proces budowania w folderze 'docwire' (./build.sh) zakończył się sukcesem."
    exit 1
fi

echo "🧹 Czyszczenie starego folderu z plikami .txt..."
rm -rf "$TXT_DOCS_DIR"
mkdir -p "$TXT_DOCS_DIR"

if [ -z "$(ls -A $RAW_DOCS_DIR)" ]; then
   echo "⚠️  Folder '$RAW_DOCS_DIR' jest pusty. Umieść w nim pliki PDF/DOCX do przetworzenia."
   exit 0
fi

echo "--- ⚙️  Etap 1: Konwersja wszystkich plików za pomocą Docwire ---"

for raw_file_path in "$RAW_DOCS_DIR"/*; do
  if [ -f "$raw_file_path" ]; then
    echo "  📄 Konwertuję: $(basename "$raw_file_path")"
    "$DOCWIRE_EXEC" process "$raw_file_path" --output-dir "$TXT_DOCS_DIR"
  fi
done

echo "--- ✅ Etap 1 zakończony. ---"
echo ""
echo "--- 🚀 Etap 2: Wysyłanie plików .txt do Supabase i Pinecone ---"

for txt_file_path in "$TXT_DOCS_DIR"/*.txt; do
  if [ -f "$txt_file_path" ]; then
    node upload-data.js "$(basename "$txt_file_path")"
  fi
done

echo ""
echo "🎉🎉🎉 WSZYSTKO GOTOWE! 🎉🎉🎉"
echo "Wszystkie pliki zostały przetworzone i wysłane."
