# AI Airport Navigator ✈️ – Inteligentny Przewodnik po Lotnisku w Edynburgu

AI Airport Navigator to innowacyjny chatbot oparty na architekturze **RAG (Retrieval-Augmented Generation)**. Został zaprojektowany, aby rewolucjonizować obsługę pasażerów na **Lotnisku w Edynburgu**, dostarczając precyzyjnych i natychmiastowych odpowiedzi na pytania użytkowników, bazując na obszernej i niestandardowej bazie wiedzy.

## 🌟 Główne Cechy

* **Intuicyjny Interfejs Chatbota:** Prosty i przyjazny dla użytkownika interfejs webowy, umożliwiający swobodną komunikację w języku naturalnym.

* **Zaawansowany System Odpowiedzi AI:** Wykorzystuje najnowocześniejsze modele językowe **Google Gemini** do głębokiego rozumienia zapytań i generowania kontekstowych, precyzyjnych odpowiedzi.

* **Wiarygodna Baza Wiedzy RAG:** Gwarantuje, że wszystkie odpowiedzi są ściśle oparte na dostarczonych dokumentach źródłowych, eliminując ryzyko "halucynacji" (wymyślania faktów przez AI).

* **Wszechstronne Przetwarzanie Dokumentów:** System integruje technologię **OCR** do efektywnego przetwarzania informacji z różnorodnych formatów, takich jak pliki PDF i obrazy (JPG, PNG), konwertując je na przeszukiwalną bazę wiedzy.

* **Błyskawiczne Wyszukiwanie Semantyczne:** Dzięki integracji z wektorową bazą danych **Pinecone**, chatbot potrafi w ułamku sekundy odnaleźć najbardziej relewantne fragmenty wiedzy, zapewniając szybkie i trafne odpowiedzi.

---

## 🛠️ Stos Technologiczny

Projekt wykorzystuje zwinny i skalowalny stos technologiczny, idealny dla aplikacji opartych na AI:

* **Backend:** Node.js, Express.js

* **Frontend:** HTML5, CSS3, Vanilla JavaScript

* **AI i Modele Językowe:** Google Gemini API (`embedding-001` do generowania osadzeń i `gemini-1.5-pro` do generowania odpowiedzi).

* **Wektorowa Baza Danych:** Pinecone

* **Relacyjna Baza Danych:** Supabase (do przechowywania metadanych dokumentów)

* **Automatyzacja i OCR:** `docwire` (niestandardowe SDK do ekstrakcji tekstu), skrypty Bash do automatyzacji procesów.

* **Wdrażanie:** Google Cloud Run (do skalowalnego i bezserwerowego hostowania aplikacji).

---

## 📐 Architektura Systemu RAG

AI Airport Navigator działa w oparciu o zaawansowaną architekturę Retrieval-Augmented Generation. Proces przygotowania danych i generowania odpowiedzi przebiega dwuetapowo:

### 1. Przygotowanie Danych (Offline Processing)

Ten etap odbywa się jednorazowo lub po każdej aktualizacji bazy wiedzy:

* **Ekstrakcja Tekstu:** Dokumenty źródłowe (PDF, JPG) są automatycznie przetwarzane przez narzędzie `docwire`, które wykorzystuje technologię OCR (Optical Character Recognition) do wyodrębniania z nich surowego tekstu.

* **Dzielenie na Fragmenty (Chunking):** Skrypt `upload-data.js` inteligentnie dzieli długie teksty na mniejsze, logiczne fragmenty (tzw. "chunks"), co optymalizuje proces wyszukiwania kontekstu.

* **Generowanie Osadzeń Wektorowych (Embeddings):** Dla każdego fragmentu tekstu generowana jest unikalna reprezentacja numeryczna – osadzenie wektorowe (embedding) – przy użyciu modelu **Google `embedding-001`**.

* **Zasilanie Baz Danych:** Wektory wraz z niezbędnymi metadanymi są bezpiecznie zapisywane w wektorowej bazie danych **Pinecone**. Pełna treść oryginalnych dokumentów trafia natomiast do relacyjnej bazy danych **Supabase**, zapewniając ich łatwy dostęp i zarządzanie.

### 2. Odpowiadanie na Pytanie (Online Query Processing)

Gdy użytkownik zadaje pytanie:

* **Wektoryzacja Zapytania:** Pytanie użytkownika jest natychmiast konwertowane na wektor za pomocą tego samego modelu **Google `embedding-001`**, co zapewnia spójność w przestrzeni wektorowej.

* **Wyszukiwanie Kontekstu:** Wykorzystując wektor zapytania, **Pinecone** jest przeszukiwany w celu zidentyfikowania i odnalezienia najbardziej podobnych semantycznie fragmentów tekstu z bazy wiedzy.

* **Generowanie Odpowiedzi:** Pytanie użytkownika, wzbogacone o odnaleziony kontekst, jest przesyłane do zaawansowanego modelu **Gemini Pro**. Model ten generuje precyzyjną i rzetelną odpowiedź, bazując wyłącznie na dostarczonym informacjach, bez "halucynacji".

## 🚀 Instalacja i Konfiguracja

Aby uruchomić projekt lokalnie lub w środowisku Cloud Run, postępuj zgodnie z poniższymi instrukcjami.

### 1. Klonowanie Repozytorium

Rozpocznij od sklonowania kodu źródłowego:

```bash
git clone [https://github.com/twoja-nazwa-uzytkownika/Al-Airport-Navigator.git](https://github.com/twoja-nazwa-uzytkownika/Al-Airport-Navigator.git)
cd Al-Airport-Navigator
```

### 2. Instalacja Zależności

Projekt wymaga środowiska Node.js. Upewnij się, że masz zainstalowaną odpowiednią wersję (zalecana Node.js v18.x lub nowsza), a następnie zainstaluj zależności:

```bash
npm install
```

### 3. Konfiguracja Zmiennych Środowiskowych

Utwórz plik `.env` w głównym folderze projektu (skopiuj z `.env.example`, jeśli dostępny), zawierający niezbędne klucze API i URL-e:

```env
# Klucze dostępu do Supabase
SUPABASE_URL=twoj_supabase_url
SUPABASE_SERVICE_KEY=twoj_supabase_service_key

# Klucze dostępu do Pinecone
PINECONE_API_KEY=twoj_pinecone_api_key

# Klucze dostępu do Google Cloud (Gemini API)
GOOGLE_API_KEY=twoj_google_cloud_api_key
GOOGLE_PROJECT_ID=twoj_google_cloud_project_id
```
**Ważne:** W środowisku produkcyjnym (np. Google Cloud Run) **nie używaj plików `.env`**. Zamiast tego, konfiguruj te zmienne jako **zmienne środowiskowe** w ustawieniach usługi Cloud Run, a dla wrażliwych kluczy (`GOOGLE_API_KEY`, `PINECONE_API_KEY`, `SUPABASE_SERVICE_KEY`) **zdecydowanie zaleca się użycie Google Secret Manager** dla zwiększonego bezpieczeństwa.

### 4. Budowanie `docwire` SDK

Narzędzie `docwire` wymaga jednorazowej kompilacji. Upewnij się, że masz zainstalowane niezbędne narzędzia do kompilacji C++ (np. `g++` i `make`).

```bash
cd docwire
./build.sh
cd ..
```

---

## ▶️ Uruchomienie Projektu

### 1. Przetwarzanie Danych i Zasilenie Baz Danych

Uruchom główny skrypt, który zajmie się budowaniem `docwire`, konwersją dokumentów na tekst i załadowaniem danych do Pinecone oraz Supabase:

```bash
# Nadaj uprawnienia do uruchamiania skryptu (tylko raz)
chmod +x build_and_process.sh

# Uruchom skrypt do przetwarzania i ładowania danych
./build_and_process.sh
```
**Uwaga:** Ten proces może być czasochłonny, zwłaszcza przy dużej liczbie dokumentów lub restrykcjach API. Monitoruj konsolę pod kątem postępu.

### 2. Uruchomienie Serwera Backendowego

Po przygotowaniu bazy wiedzy, uruchom serwer Node.js:

```bash
node server.js
```
Serwer będzie nasłuchiwał na porcie `3000` (lub innym zdefiniowanym w zmiennej środowiskowej `PORT`). To okno terminala musi pozostać otwarte, aby serwer działał.

### 3. Uruchomienie Aplikacji Frontendowej

Otwórz plik `index.html` w swojej ulubionej przeglądarce internetowej. Po załadowaniu strony, aplikacja jest gotowa do użycia!
