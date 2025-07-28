require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { spawn } = require('child_process');
const cookieParser = require('cookie-parser'); // <-- NOWY IMPORT
const { v4: uuidv4 } = require('uuid'); // <-- NOWY IMPORT

const app = express();
const port = 8080;

app.use(cors());
app.use(express.json());
app.use(cookieParser()); // <-- UŻYJ COOKIE-PARSER
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.PINECONE_API_KEY || !process.env.GOOGLE_API_KEY || !process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET || !process.env.EXCHANGERATE_API_KEY) {
    console.error("KRYTYCZNY BŁĄD: Brakuje kluczy API!");
    process.exit(1);
}

const PINECONE_INDEX_NAME = 'airport-navigator-embeddings';
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const locationsPath = path.join(__dirname, 'public/locations.json');
const locationsData = JSON.parse(fs.readFileSync(locationsPath, 'utf-8'));

const conversationStates = new Map();

// NOWA, PROFESJONALNA OBSŁUGA SESJI
const getSessionId = (req, res) => {
    let sessionId = req.cookies.session_id;
    if (!sessionId) {
        sessionId = uuidv4();
        res.cookie('session_id', sessionId, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // Ciasteczko ważne 24h
    }
    return sessionId;
};

const navigationResponses = {
    request_location: {
        pl: "Jasne, mogę Cię tam zaprowadzić. Powiedz mi proszę, gdzie teraz jesteś? Na przykład 'jestem przy odprawie' lub 'jestem przy bramce 10'.",
        en: "Sure, I can take you there. Please tell me, where are you now? For example 'I'm at check-in' or 'I'm at gate 10'."
    },
    before_to_after_security: {
        pl: (destName) => `Twój cel, ${destName}, znajduje się po przejściu kontroli bezpieczeństwa. Najpierw udaj się do strefy kontroli. Gdy ją przejdziesz, zapytaj mnie ponownie, a podam Ci dalsze wskazówki.`,
        en: (destName) => `Your destination, ${destName}, is located after security control. First, proceed to the security area. Once you've passed through, ask me again, and I'll give you further instructions.`
    },
    after_to_before_security: {
        pl: (destName) => `Wygląda na to, że jesteś już w strefie odlotów. Twój cel, ${destName}, znajduje się w strefie ogólnodostępnej, przed kontrolą bezpieczeństwa. Niestety, ze względów bezpieczeństwa po przejściu kontroli nie można już do niej wrócić.`,
        en: (destName) => `It seems you are already in the departures area. Your destination, ${destName}, is located in the public area, before security control. Unfortunately, for security reasons, you cannot return to it after passing through security.`
    },
    not_understood: {
        pl: "Nie rozumiem. Proszę, wybierz jedną z opcji.",
        en: "I don't understand. Please choose one of the options."
    }
};

let spotifyToken = null;
let tokenExpiryTime = 0;

async function getSpotifyToken() {
    if (spotifyToken && Date.now() < tokenExpiryTime) return spotifyToken;
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', 'grant_type=client_credentials', {
            headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        spotifyToken = response.data.access_token;
        tokenExpiryTime = Date.now() + (response.data.expires_in - 300) * 1000;
        return spotifyToken;
    } catch (error) {
        throw new Error("Nie można uzyskać tokenu od Spotify.");
    }
}

const RATES_FILE_PATH = path.join(__dirname, 'public', 'rates.json');

function fileToGenerativePart(filePath, mimeType) {
    return {
        inlineData: {
            data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
            mimeType
        },
    };
}

async function getAnswerFromAI(query, chatHistory, context, lang = 'pl', imageParts = []) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const langInstruction = lang === 'en' ? 'Your answer must be in English.' : 'Twoja odpowiedź musi być w języku polskim.';
    const historyForGemini = chatHistory.map(turn => ({ role: turn.role, parts: [{ text: turn.parts[0].text }] }));

    const systemInstruction = `Jesteś przyjaznym i pomocnym asystentem AI ✈️ na Lotnisku w Edynburgu (EDI). Twoim zadaniem jest prowadzenie miłej i użytecznej konwersacji. Używaj emoji! ${langInstruction}

**NAJWAŻNIEJSZA ZASADA (ROUTER INTENCJI):**
Twoim pierwszym zadaniem jest zrozumienie intencji użytkownika. ZAWSZE obsługuj tylko JEDNĄ intencję na raz. Jeśli użytkownik prosi o kilka rzeczy naraz, obsłuż pierwszą z nich i grzecznie poinformuj, aby o drugą zapytał w osobnej wiadomości. Zawsze odpowiadaj, zaczynając od słowa kluczowego intencji, po którym następuje dwukropek i spacja.

-   Jeśli pytanie jest prośbą o **playlistę muzyczną**, ZAWSZE zacznij odpowiedź od: \`INTENCJA:PLAYLISTA: \`. Po dwukropku podaj tylko JEDEN gatunek w języku angielskim, korzystając z poniższego słownika.
-   Jeśli pytanie dotyczy **przeliczenia walut**, ZAWSZE zacznij odpowiedź od: \`INTENCJA:WALUTA: \`. Po dwukropku podaj obiekt JSON z kluczami "amount", "from", "to". Użyj słownika walut.
-   Jeśli pytanie dotyczy **wskazówek jak dotrzeć do FIZYCZNEJ LOKALIZACJI**, zacznij odpowiedź od: \`INTENCJA:NAWIGACJA: \`.
-   W każdym innym przypadku jest to **PROŚBA O INFORMACJĘ**. Zacznij odpowiedź od: \`INTENCJA:INFORMACJA: \`

---
**SŁOWNIK PLAYLIST:**
-   **Pop:** pop, popularna, hity, przeboje, radio
-   **Rock:** rock, rockowa, rock and roll, classic rock, hard rock
-   **Hip-Hop:** hip-hop, hip hop, rap
-   **Electronic:** elektroniczna, techno, house, trance, EDM, dance, taneczna
-   **Jazz:** jazz, jazzowa
-   **Classical:** klasyczna, poważna, classical
-   **R-n-B:** r&b, soul, rhythm and blues
-   **Ambient:** ambient, relaksacyjna, do snu, do latania, relaxing, chill, chillout, do nauki, study
-   **80s:** lata 80, 80s
-   **Workout:** do ćwiczeń, na siłownię, do biegania, workout, fitness, running

---
**SŁOWNIK WALUT:**
-   PLN: złoty, złotych, złotówki, polish zloty
-   EUR: euro, eur
-   USD: dolar, dolary, dolców, dollar, dollars, bucks
-   GBP: funt, funty, funtów, pound, pounds, quid
-   CHF: frank, franki, franks
-   CAD: dolar kanadyjski, canadian dollar

---
**PROTOKÓŁ NAWIGACJI:**
1.  Twoim jedynym źródłem wiedzy jest załączony obraz mapy. ZIGNORUJ "KONTEKST Z BAZY WIEDZY".
2.  Wygeneruj wskazówki tekstowe krok po kroku na podstawie punktów orientacyjnych widocznych na mapie.

---
**PROTOKÓŁ INFORMACYJNY:**
1.  Twoim jedynym źródłem wiedzy jest "KONTEKST Z BAZY WIEDZY". ZIGNORUJ załączony obraz mapy.
2.  Odpowiedz na pytanie, korzystając z informacji w "KONTEKŚCIE Z BAZY WIEDZY".
3.  Jeśli informacja nie znajduje się w "KONTEKŚCIE", odpowiedz:
    (PL) "Hmm, nie jestem pewien tej informacji 🤔. Najlepiej sprawdzić to na oficjalnej stronie lotniska: [Strona Główna Lotniska w Edynburgu](https://www.edinburghairport.com/) 🌐"
    (EN) "Hmm, I'm not sure about that information 🤔. The best place to check is the official airport website: [Edinburgh Airport Homepage](https://www.edinburghairport.com/) 🌐"

---
**KONTEKST Z BAZY WIEDZY:**
${context}
---`;

    const chat = model.startChat({ history: historyForGemini, systemInstruction: { role: "system", parts: [{ text: systemInstruction }] }, generationConfig: { maxOutputTokens: 1000 } });

    const result = await chat.sendMessage([query, ...imageParts]);
    const response = await result.response;
    return response.text().trim();
}

app.post('/api/ask', async (req, res) => {
    const sessionId = getSessionId(req, res); // <-- UŻYJ NOWEJ FUNKCJI
    let conversationState = conversationStates.get(sessionId) || {};

    try {
        const { question, lang, chatHistory } = req.body;
        if (!question) return res.status(400).json({ error: 'Zapytanie nie może być puste.' });

        const lowerQuestion = question.toLowerCase();

        if (conversationState.isNavigating) {
            let foundZone = null;
            for (const locAlias of Object.keys(locationsData.user_locations)) {
                if (lowerQuestion.includes(locAlias)) {
                    foundZone = locationsData.user_locations[locAlias];
                    break;
                }
            }

            if (foundZone) {
                const userZone = foundZone;
                const dest = conversationState.destination;
                
                if (userZone === dest.zone || dest.zone === 'transition_point') {
                    const mapPath = path.join(__dirname, 'public', dest.map_file);
                    const imageParts = [fileToGenerativePart(mapPath, "image/jpeg")];
                    const prompt = `Prowadź z mojej obecnej lokalizacji ("${question}") do celu: ${dest.name[lang]}. Użyj załączonej mapy.`;
                    const answer = await getAnswerFromAI(prompt, chatHistory, "", lang, imageParts);
                    conversationStates.delete(sessionId);
                    return res.json({
                        answer: answer.replace(/^(INTENCJA:NAWIGACJA|INTENT:NAVIGATION):\s*/, ''),
                        imageUrl: dest.map_file,
                        action: 'show_navigation_modal'
                    });
                } else if (userZone === 'before_security' && dest.zone === 'after_security') {
                    conversationStates.delete(sessionId);
                    return res.json({ answer: navigationResponses.before_to_after_security[lang](dest.name[lang]) });
                } else if (userZone === 'after_security' && dest.zone === 'before_security') {
                    conversationStates.delete(sessionId);
                    return res.json({ answer: navigationResponses.after_to_before_security[lang](dest.name[lang]) });
                }
            } else {
                 conversationStates.delete(sessionId);
            }
        }
        
        const aiResponseWithIntent = await getAnswerFromAI(question, chatHistory, "", lang);
        
        const intentMatch = aiResponseWithIntent.match(/^(INTENCJA|INTENT):(\w+):\s*(.*)/s);
        const intent = intentMatch ? intentMatch[2].toUpperCase() : 'INFORMACJA';
        const content = intentMatch ? intentMatch[3] : aiResponseWithIntent;

        console.log(`[DEBUG] Sesja: ${sessionId}, Intencja: ${intent}`);

        if (intent === 'PLAYLISTA' || intent === 'PLAYLIST') {
            return res.json({ action: 'trigger_playlist', genre: content });
        }

        if (intent === 'WALUTA' || intent === 'CURRENCY') {
            try {
                const { amount, from, to } = JSON.parse(content);
                return res.json({ action: 'trigger_currency_conversion', amount, from, to });
            } catch (e) { /* fallback to INFORMACJA */ }
        }
        
        if (intent === 'NAWIGACJA' || intent === 'NAVIGATION') {
            let destination = locationsData.locations.find(loc => 
                loc.aliases[lang].some(alias => lowerQuestion.includes(alias))
            );

            if (destination) {
                conversationStates.set(sessionId, { isNavigating: true, destination: destination });
                return res.json({
                    answer: navigationResponses.request_location[lang],
                    action: 'request_location'
                });
            }
            
            const mapFile = lowerQuestion.includes('gate') || lowerQuestion.includes('bramki') ? 'images/mapa_po_kontroli.jpg' : 'images/mapa_przed_kontrola.jpg';
            const mapPath = path.join(__dirname, 'public', mapFile);
            const imageParts = [fileToGenerativePart(mapPath, "image/jpeg")];
            const navigationAnswer = await getAnswerFromAI(question, chatHistory, "", lang, imageParts);
            
            return res.json({
                answer: navigationAnswer.replace(/^(INTENCJA:NAWIGACJA|INTENT:NAVIGATION):\s*/, ''),
                imageUrl: mapFile,
                action: 'show_navigation_modal'
            });
        }

        const model = genAI.getGenerativeModel({ model: "embedding-001" });
        const queryEmbedding = await model.embedContent(question);
        const pineconeIndex = pinecone.index(PINECONE_INDEX_NAME);
        const queryResult = await pineconeIndex.query({ vector: queryEmbedding.embedding.values, topK: 5, includeMetadata: true });
        const contextText = queryResult.matches.length > 0 ? queryResult.matches.map(match => match.metadata.text_chunk).join('\n\n---\n\n') : "Brak informacji w bazie wiedzy na ten temat.";

        const finalAnswer = await getAnswerFromAI(question, chatHistory, contextText, lang);
        const cleanAnswer = finalAnswer.replace(/^(INTENCJA:INFORMACJA|INTENT:INFORMATION):\s*/, '');
        
        res.json({ 
            answer: cleanAnswer, 
            sourceContext: queryResult.matches.length > 0 ? queryResult.matches[0].metadata : null 
        });

    } catch (error) {
        console.error('[Backend] Krytyczny błąd w /api/ask:', error);
        res.status(500).json({ error: 'Wystąpił wewnętrzny błąd serwera.' });
    }
});

app.post('/api/playlist', async (req, res) => {
    const { genre } = req.body;
    if (!genre) return res.status(400).json({ error: 'Gatunek muzyczny jest wymagany.' });
    try {
        const token = await getSpotifyToken();
        const response = await axios.get('https://api.spotify.com/v1/search', {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { q: `genre:${genre}`, type: 'track', limit: 3, market: 'PL' }
        });
        const tracks = response.data.tracks.items.map(track => ({
            id: track.id,
            name: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            albumArt: track.album.images[0]?.url
        }));
        res.json({ tracks });
    } catch (error) {
        res.status(500).json({ error: 'Błąd podczas komunikacji ze Spotify.' });
    }
});

app.post('/api/convert', (req, res) => {
    const { amount, from, to } = req.body;
    if (typeof amount !== 'number' || !from || !to) return res.status(400).json({ error: 'Nieprawidłowe dane.' });
    const upperFrom = from.toUpperCase();
    const upperTo = to.toUpperCase();
    if (!fs.existsSync(RATES_FILE_PATH)) return res.status(500).json({ error: 'Brak pliku z kursami walut.' });
    
    const rates = JSON.parse(fs.readFileSync(RATES_FILE_PATH, 'utf-8'));
    if (!rates.rates[upperFrom] || !rates.rates[upperTo]) return res.status(404).json({ error: 'Waluta nieobsługiwana.' });
    
    const calculatorPath = path.join(__dirname, 'cpp_tools', 'currency_calculator');
    const calculatorProcess = spawn(calculatorPath);
    let result = '';
    let errorResult = '';
    const inputData = `${amount} ${upperFrom} ${upperTo}\n${JSON.stringify(rates.rates)}`;
    calculatorProcess.stdin.write(inputData);
    calculatorProcess.stdin.end();
    calculatorProcess.stdout.on('data', data => result += data.toString());
    calculatorProcess.stderr.on('data', data => errorResult += data.toString());
    calculatorProcess.on('close', code => {
        if (code === 0) {
            res.json({ from: upperFrom, to: upperTo, amount, result: parseFloat(result.trim()) });
        } else {
            res.status(500).json({ error: 'Błąd podczas obliczania kursu waluty.', details: errorResult.trim() });
        }
    });
});

app.post('/api/summarize', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Brak tekstu do podsumowania.' });
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
        const prompt = `Summarize the following text in one or two concise Polish sentences. Output only the summary. The text to summarize is: "${text}"`;
        const result = await model.generateContent(prompt);
        res.json({ summary: result.response.text().trim() });
    } catch (error) {
        res.status(500).json({ error: 'Wystąpił błąd podczas podsumowania.' });
    }
});

app.post('/api/translate', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Brak tekstu do tłumaczenia.' });
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
        const prompt = `Translate the following text to English. Output only the translated text. The text to translate is: "${text}"`;
        const result = await model.generateContent(prompt);
        res.json({ translatedText: result.response.text().trim() });
    } catch (error) {
        res.status(500).json({ error: 'Wystąpił błąd podczas tłumaczenia.' });
    }
});

app.post('/api/reading-time', (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Brak tekstu do analizy.' });
    
    const calculatorPath = path.join(__dirname, 'cpp_tools', 'reading_time_calculator');
    const calculatorProcess = spawn(calculatorPath);
    let result = '';
    let errorResult = '';
    calculatorProcess.stdin.write(text);
    calculatorProcess.stdin.end();
    calculatorProcess.stdout.on('data', data => result += data.toString());
    calculatorProcess.stderr.on('data', data => errorResult += data.toString());
    calculatorProcess.on('close', code => {
        if (code === 0) {
            res.json({ readingTime: parseInt(result.trim(), 10) });
        } else {
            res.status(500).json({ error: 'Błąd podczas obliczania czasu czytania.', details: errorResult.trim() });
        }
    });
});

app.listen(port, () => {
    console.log(`Serwer AI Airport Navigator działa na porcie: ${port}`);
});

const updateRates = () => {
    console.log('Uruchamiam automatyczną aktualizację kursów walut...');
    const updateProcess = spawn('node', [path.join(__dirname, 'public', 'update-rates.js')]);

    updateProcess.stdout.on('data', data => console.log(`[update-rates]: ${data}`));
    updateProcess.stderr.on('data', data => console.error(`[update-rates BŁĄD]: ${data}`));
};

updateRates();
setInterval(updateRates, 24 * 60 * 60 * 1000);