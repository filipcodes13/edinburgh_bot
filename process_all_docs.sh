
set -e

RAW_DOCS_DIR="./raw_airport_docs" 
TXT_DOCS_DIR="./airport_docs"    

DOCWIRE_EXEC="./docwire/vcpkg/installed/arm64-osx-dynamic/tools/docwire"

if [ ! -f "$DOCWIRE_EXEC" ]; then
    echo "❌ BŁĄD KRYTYCZNY: Nie znaleziono programu Docwire w ścieżce: $DOCWIRE_EXEC"
    echo "Upewnij się, że proces budowania w folderze 'docwire' (./build.sh) zakończył się sukcesem i ścieżka jest poprawna."
    exit 1
fi

echo "🧹 Czyszczenie starego folderu z plikami .txt: $TXT_DOCS_DIR..."
rm -rf "$TXT_DOCS_DIR"
mkdir -p "$TXT_DOCS_DIR"

if [ -z "$(ls -A $RAW_DOCS_DIR 2>/dev/null)" ]; then
   echo "⚠️  Folder '$RAW_DOCS_DIR' jest pusty. Umieść w nim pliki PDF/DOCX/JPG do przetworzenia."
   exit 0
fi

echo "--- ⚙️  Etap 1: Konwersja wszystkich plików z $RAW_DOCS_DIR do $TXT_DOCS_DIR za pomocą Docwire ---"

for raw_file_path in "$RAW_DOCS_DIR"/*; do
  if [ -f "$raw_file_path" ]; then
    filename=$(basename "$raw_file_path")
    filename_without_ext="${filename%.*}" 
    output_txt_file="$TXT_DOCS_DIR/$filename_without_ext.txt"

    echo "  📄 Konwertuję: $filename do $output_txt_file"
    "$DOCWIRE_EXEC" "$raw_file_path" --output_type plain_text > "$output_txt_file"
  fi
done

echo "--- ✅ Etap 1 zakończony. Przetworzone pliki .txt znajdują się w $TXT_DOCS_DIR. ---"
echo ""
echo "--- 🚀 Etap 2: Wysyłanie plików .txt z $TXT_DOCS_DIR do Supabase i Pinecone ---"


node upload-data.js

echo ""
echo "🎉🎉🎉 WSZYSTKO GOTOWE! 🎉🎉🎉"
echo "Wszystkie pliki zostały przetworzone i wysłane do baz danych."