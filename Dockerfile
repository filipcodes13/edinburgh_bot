# Użyj oficjalnego obrazu Node.js
FROM node:18-slim

# Ustaw folder roboczy wewnątrz kontenera
WORKDIR /usr/src/app

# Zainstaluj kompilator C++ (g++)
RUN apt-get update && apt-get install -y g++

# Skopiuj pliki package.json i zainstaluj zależności
COPY package*.json ./
RUN npm install --only=production

# Skopiuj resztę plików projektu
COPY . .

# Skompiluj narzędzia C++
RUN g++ cpp_tools/reading_time_calculator.cpp -o cpp_tools/reading_time_calculator -std=c++11
RUN g++ cpp_tools/currency_calculator.cpp -o cpp_tools/currency_calculator -std=c++11

# Uruchom serwer, gdy kontener wystartuje
CMD [ "node", "server.js" ]