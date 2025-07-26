# === ETAP 1: Budowanie (Builder) ===
# Użyj obrazu Node.js, który zawiera również narzędzia do kompilacji C++
FROM node:18 AS builder

# Ustaw folder roboczy
WORKDIR /usr/src/app

# Zainstaluj g++, kompilator C++
RUN apt-get update && apt-get install -y g++

# Skopiuj pliki package.json i zainstaluj zależności Node.js
COPY package*.json ./
RUN npm install

# Skopiuj wszystkie pliki projektu
COPY . .

# Skompiluj narzędzia C++
RUN g++ cpp_tools/reading_time_calculator.cpp -o cpp_tools/reading_time_calculator -std=c++11
RUN g++ cpp_tools/currency_calculator.cpp -o cpp_tools/currency_calculator -std=c++11

# Uruchom skrypt, aby pobrać i zapisać kursy walut
# Upewnij się, że EXCHANGERATE_API_KEY jest dostępny jako argument budowania
ARG EXCHANGERATE_API_KEY
ENV EXCHANGERATE_API_KEY=${EXCHANGERATE_API_KEY}
RUN node public/update-rates.js

# === ETAP 2: Produkcja (Final) ===
# Użyj lekkiego obrazu Node.js do finalnego kontenera
FROM node:18-slim

WORKDIR /usr/src/app

# Skopiuj tylko niezbędne zależności produkcyjne
COPY package*.json ./
RUN npm install --only=production

# Skopiuj pliki aplikacji z etapu budowania
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/server.js ./server.js
# --- TA LINIA ZOSTAŁA POPRAWIONA ---
COPY --from=builder /usr/src/app/public/locations.json ./public/locations.json

# Skopiuj skompilowane programy C++ z etapu budowania
COPY --from=builder /usr/src/app/cpp_tools/reading_time_calculator ./cpp_tools/
COPY --from=builder /usr/src/app/cpp_tools/currency_calculator ./cpp_tools/

# Uruchom serwer, gdy kontener wystartuje
CMD [ "node", "server.js" ]