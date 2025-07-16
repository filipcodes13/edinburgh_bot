# AI Airport Navigator ✈️

AI Airport Navigator to inteligentny chatbot oparty na architekturze RAG (Retrieval-Augmented Generation), zaprojektowany jako przewodnik po Lotnisku Chopina w Warszawie. Aplikacja odpowiada na pytania użytkowników w oparciu o niestandardową bazę wiedzy, stworzoną z dokumentów PDF i obrazów.

## Główne Funkcje

* **Interfejs Chatbota:** Prosty i intuicyjny interfejs webowy do zadawania pytań w języku naturalnym.
* **System Odpowiedzi AI:** Wykorzystuje zaawansowane modele językowe (Google Gemini) do rozumienia pytań i generowania precyzyjnych odpowiedzi.
* **Baza Wiedzy RAG:** Odpowiedzi są generowane wyłącznie na podstawie informacji zawartych w dokumentach źródłowych, co zapobiega wymyślaniu faktów (halucynacjom).
* **Przetwarzanie Dokumentów:** System potrafi przetwarzać dokumenty w formatach PDF i obrazów (JPG, PNG) dzięki OCR, konwertując je na tekstową bazę wiedzy.
* **Wyszukiwanie Semantyczne:** Używa wektorowej bazy danych Pinecone do błyskawicznego odnajdywania najbardziej relevantnych fragmentów wiedzy.

## Stos Technologiczny

* **Backend:** Node.js, Express.js
* **Frontend:** HTML5, CSS3, Vanilla JavaScript
* **AI i Modele Językowe:** Google Gemini API (`embedding-001` & `gemini-1.5-pro`)
* **Wektorowa Baza Danych:** Pinecone
* **Relacyjna Baza Danych:** Supabase (do przechowywania metadanych dokumentów)
* **Automatyzacja i OCR:** `docwire` (niestandardowe SDK), skrypty Bash

## Architektura

System działa w oparciu o nowoczesną architekturę RAG. Proces przygotowania danych i odpowiadania na zapytania przebiega następująco:

1.  **Przygotowanie Danych (Offline):**
    * Dokumenty źródłowe (PDF, JPG) są przetwarzane przez `docwire` w celu ekstrakcji tekstu (OCR).
    * Skrypt `upload-data.js` dzieli tekst na mniejsze fragmenty (chunks).
    * Dla każdego fragmentu generowane jest osadzenie wektorowe (embedding) za pomocą modelu Google `embedding-001`.
    * Wektory wraz z metadanymi są zapisywane w bazie wektorowej **Pinecone**. Pełna treść dokumentów trafia do **Supabase**.

2.  **Odpowiadanie na Pytanie (Online):**
    * Pytanie użytkownika jest konwertowane na wektor za pomocą tego samego modelu.
    * Pinecone jest przeszukiwany w celu znalezienia najbardziej podobnych semantycznie fragmentów tekstu (kontekstu).
    * Pytanie użytkownika wraz z odnalezionym kontekstem jest wysyłane do modelu **Gemini Pro**.
    * Model generuje odpowiedź, bazując wyłącznie na dostarczonym kontekście.

---

## Instalacja i Konfiguracja

Aby uruchomić projekt lokalnie, postępuj zgodnie z poniższymi krokami.

### 1. Klonowanie Repozytorium
```bash
git clone [https://github.com/twoja-nazwa-uzytkownika/Al-Airport-Navigator.git](https://github.com/twoja-nazwa-uzytkownika/Al-Airport-Navigator.git)
cd Al-Airport-Navigator
```

### 2. Instalacja Zależności
Projekt wymaga Node.js. Upewnij się, że masz go zainstalowanego, a następnie uruchom:
```bash
npm install
```

### 3. Konfiguracja Zmiennych Środowiskowych
Utwórz plik `.env` w głównym folderze projektu, kopiując zawartość z `.env.example` (jeśli istnieje) lub tworząc go od zera. Plik musi zawierać następujące klucze:
```env
# Klucze do Supabase
SUPABASE_URL=twoj_supabase_url
SUPABASE_SERVICE_KEY=twoj_supabase_service_key

# Klucze do Pinecone
PINECONE_API_KEY=twoj_pinecone_api_key

# Klucze do Google Cloud
GOOGLE_API_KEY=twoj_google_cloud_api_key
GOOGLE_PROJECT_ID=twoj_google_cloud_project_id
```

### 4. Budowanie `docwire` SDK
Narzędzie `docwire` wymaga ręcznej kompilacji. Jest to krok jednorazowy.
```bash
# Wejdź do folderu docwire i uruchom skrypt budujący
cd docwire
./build.sh
cd ..
```

---

## Uruchomienie Projektu

### 1. Przetwarzanie Danych i Zasilenie Baz Danych
Uruchom główny skrypt, który zbuduje `docwire`, przekonwertuje dokumenty i załaduje dane do Supabase i Pinecone.
```bash
# Nadaj uprawnienia (tylko raz)
chmod +x build_and_process.sh

# Uruchom skrypt
./build_and_process.sh
```
**Uwaga:** Ten proces może zająć dużo czasu, zwłaszcza przy dużej liczbie dokumentów, ze względu na limity zapytań API.

### 2. Uruchomienie Serwera Backendowego
Gdy baza wiedzy jest gotowa, uruchom serwer Node.js.
```bash
node server.js
```
Serwer będzie działał na porcie `3000`. Pamiętaj, aby to okno terminala pozostało otwarte.

### 3. Uruchomienie Aplikacji Frontendowej
Otwórz plik `index.html` w swojej ulubionej przeglądarce internetowej. Aplikacja jest gotowa do użycia!