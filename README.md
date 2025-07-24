# AI Airport Navigator - Inteligentny Asystent Lotniska w Edynburgu ✈️

## 📝 Opis Projektu

**AI Airport Navigator** to zaawansowany, konwersacyjny asystent AI, zaprojektowany, aby pomagać pasażerom na lotnisku w Edynburgu (EDI). Aplikacja wykorzystuje nowoczesną architekturę **RAG (Retrieval-Augmented Generation)**, łącząc moc dużych modeli językowych (Google Gemini) z dedykowaną bazą wiedzy (Pinecone), aby udzielać precyzyjnych i wiarygodnych odpowiedzi na pytania użytkowników.

Celem projektu jest stworzenie intuicyjnego narzędzia, które nie tylko dostarcza kluczowych informacji o lotnisku, ale także wzbogaca doświadczenie podróżnych poprzez innowacyjne funkcje dodatkowe, takie jak generowanie playlist ze Spotify czy wbudowany przelicznik walut.

## ✨ Kluczowe Funkcje

* **Konwersacyjne AI:** Użytkownicy mogą prowadzić naturalną, przyjazną rozmowę z asystentem, który odpowiada na pytania, używając emoji i zachowując kontekst rozmowy.
* **Wiarygodne Źródła:** Odpowiedzi są generowane na podstawie dedykowanej bazy wiedzy, a użytkownik może przejrzeć, podsumować lub przetłumaczyć tekst źródłowy.
* **Inteligentne Rozpoznawanie Intencji:** Asystent potrafi samodzielnie rozpoznać, kiedy pytanie dotyczy funkcji specjalnych (playlista, waluty) i odpowiednio na nie reaguje.
* **Integracja z API Spotify:** Na prośbę użytkownika (np. "playlista pop"), asystent generuje listę piosenek z danego gatunku wraz z interaktywnymi odtwarzaczami osadzonymi bezpośrednio w oknie czatu.
* **Przelicznik Walut:** Wbudowana funkcja, która pozwala na szybkie przeliczanie walut bezpośrednio w rozmowie (np. "ile to 100 eur na pln").
* **Integracja z C++:** Aplikacja wykorzystuje samodzielny program w C++ do błyskawicznego obliczania szacowanego czasu czytania tekstu źródłowego, demonstrując możliwość integracji z kodem natywnym.
* **Prototyp Aplikacji Desktopowej:** Projekt można uruchomić jako aplikację desktopową dla systemów Windows, macOS i Linux dzięki wykorzystaniu **Electron.js**.
* **Obsługa Wielu Języków:** Interfejs i odpowiedzi asystenta są dostępne w języku polskim i angielskim.

## 🛠️ Stos Technologiczny

* **Backend:** Node.js, Express.js
* **Frontend:** HTML, CSS, JavaScript
* **Model Językowy:** Google Gemini (`gemini-1.5-pro-latest`, `embedding-001`)
* **Wektorowa Baza Danych:** Pinecone
* **API Zewnętrzne:** Spotify API
* **Integracja Natywna:** C++ (dla kalkulatora czasu czytania)
* **Aplikacja Desktopowa:** Electron.js

## 🚀 Instrukcja Uruchomienia Projektu

Aby uruchomić projekt lokalnie na swoim komputerze, postępuj zgodnie z poniższymi krokami:

### 1. Klonowanie Repozytorium

```bash
git clone [https://github.com/filipcodes13/edinburgh_bot.git](https://github.com/filipcodes13/edinburgh_bot.git)
cd edinburgh_bot
```

### 2. Instalacja Zależności

Upewnij się, że masz zainstalowany Node.js. Następnie, w głównym katalogu projektu, uruchom komendę:

```bash
npm install
```

### 3. Konfiguracja Kluczy API (Plik `.env`)

To najważniejszy krok. Stwórz w głównym katalogu projektu plik o nazwie `.env` i wklej do niego poniższą zawartość, uzupełniając ją swoimi kluczami:

```
# Klucz do wektorowej bazy danych Pinecone
PINECONE_API_KEY="TUTAJ_WKLEJ_SWOJ_KLUCZ_PINECONE"

# Klucz do modeli językowych Google Gemini
GOOGLE_API_KEY="TUTAJ_WKLEJ_SWOJ_KLUCZ_GOOGLE"

# Klucze do integracji ze Spotify
SPOTIFY_CLIENT_ID="TUTAJ_WKLEJ_SWOJ_CLIENT_ID_ZE_SPOTIFY"
SPOTIFY_CLIENT_SECRET="TUTAJ_WKLEJ_SWOJ_CLIENT_SECRET_ZE_SPOTIFY"
```

### 4. Kompilacja Narzędzia C++

Przejdź do katalogu z narzędziami C++ i skompiluj kalkulator czasu czytania. Upewnij się, że masz zainstalowany kompilator `g++`.

```bash
cd cpp_tools
g++ reading_time_calculator.cpp -o reading_time_calculator -std=c++11
cd ..
```

### 5. Uruchomienie Aplikacji

Masz dwie możliwości uruchomienia aplikacji:

**A) Wersja Webowa (w przeglądarce):**

```bash
npm start
```

Następnie otwórz przeglądarkę i wejdź pod adres: **http://localhost:8080**

**B) Wersja Desktopowa (Electron):**

```bash
npm run start:desktop
```

Po chwili na Twoim ekranie pojawi się okno z aplikacją.

## ✒️ Autorzy

* **Filip Kołodziejczyk**
* **Silvercoders**
