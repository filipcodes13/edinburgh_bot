#!/bin/bash

# Folder, w którym wszystko się dzieje
DOCS_DIR="./airport_docs"

echo "--------------------------------------------------------"
echo "Krok 1: Przetwarzanie plików w folderze airport_docs"
echo "--------------------------------------------------------"

# Uruchom docwire, używając 'airport_docs' jako folderu źródłowego ORAZ docelowego.
# Docwire przekonwertuje tylko te pliki, które nie są formatu .txt (np. PDF, DOCX)
# i umieści ich wersje .txt w tym samym folderze.
./docwire/build/docwire process "$DOCS_DIR" --output-dir "$DOCS_DIR"

echo ""
echo "--------------------------------------------------------"
echo "Krok 2: Przesyłanie plików .txt do Supabase i Pinecone"
echo "--------------------------------------------------------"

# Uruchom skrypt Node.js, który weźmie WSZYSTKIE pliki .txt z folderu airport_docs
# i wyśle je do baz danych.
node upload-data.js

echo ""
echo "--------------------------------------------------------"
echo "Gotowe! Wszystko zostało przetworzone z jednego folderu."
echo "--------------------------------------------------------"