# Użyj oficjalnego obrazu Node.js
FROM node:18-slim

# Ustaw folder roboczy wewnątrz kontenera
WORKDIR /usr/src/app

# Zainstaluj wszystkie zależności do budowania: g++, cmake, git i biblioteki boost
RUN apt-get update && apt-get install -y g++ cmake git libboost-all-dev

# Skopiuj pliki package.json i zainstaluj zależności Node.js
COPY package*.json ./
RUN npm install --only=production

# Skopiuj resztę plików projektu (w tym referencje do podmodułów, np. docwire)
COPY . .

# --- KLUCZOWA ZMIANA: Zaktualizuj podmoduły Git ---
# To pobierze faktyczną zawartość folderu docwire
RUN git submodule update --init --recursive

# --- SEKCJA BUDOWANIA DOCWIRE ---
# Przejdź do folderu docwire, stwórz folder build i zbuduj program
RUN cd docwire && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make

# Skompiluj pozostałe narzędzia C++
RUN g++ cpp_tools/reading_time_calculator.cpp -o cpp_tools/reading_time_calculator -std=c++11
RUN g++ cpp_tools/currency_calculator.cpp -o cpp_tools/currency_calculator -std=c++11

# Uruchom serwer, gdy kontener wystartuje
CMD [ "node", "server.js" ]