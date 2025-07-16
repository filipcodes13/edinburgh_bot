# Użyj oficjalnego, lekkiego obrazu Node.js jako podstawy
FROM node:18-slim

# Ustaw folder roboczy wewnątrz kontenera
WORKDIR /usr/src/app

# Skopiuj pliki package.json, aby zoptymalizować budowanie
COPY package*.json ./

# Zainstaluj wszystkie zależności produkcyjne
RUN npm install --only=production

# Skopiuj resztę plików projektu (w tym folder 'public')
COPY . .

# Uruchom serwer, gdy kontener wystartuje
CMD [ "node", "server.js" ]

