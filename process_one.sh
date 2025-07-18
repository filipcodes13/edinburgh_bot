#!/bin/bash

# Sprawdź, czy podano nazwę pliku
if [ -z "$1" ]; then
    echo "BŁĄD: Nie podano nazwy pliku."
    echo "Użycie: ./process_one.sh <twoj-plik.pdf>"
    exit 1
fi

RAW_FILE=$1
# Zmień rozszerzenie na .txt
TXT_FILE="${RAW_FILE%.*}.txt"
DOCS_DIR="./airport_docs"

echo "--------------------------------------------------------"
echo "Krok 1: Konwertowanie $RAW_FILE na TXT za pomocą Docwire"
echo "--------------------------------------------------------"
./docwire/build/docwire process "$RAW_FILE" --output-dir "$DOCS_DIR"

# Sprawdź, czy konwersja się udała i plik .txt istnieje
if [ ! -f "$DOCS_DIR/$TXT_FILE" ]; then
    echo "BŁĄD: Konwersja pliku za pomocą Docwire nie powiodła się. Plik $TXT_FILE nie został utworzony."
    exit 1
fi

echo ""
echo "--------------------------------------------------------"
echo "Krok 2: Przesyłanie $TXT_FILE do Supabase i Pinecone"
echo "--------------------------------------------------------"
node upload-data.js "$TXT_FILE"

echo ""
echo "--------------------------------------------------------"
echo "Gotowe! Plik został przetworzony i wysłany."
echo "--------------------------------------------------------"