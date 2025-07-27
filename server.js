require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { spawn } = require('child_process');

const app = express();
const port = 8080;

app.use(cors());
app.use(express.json());
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

const getSessionId = (req) => {
    return req.ip;
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
        console.error("Błąd podczas pobierania tokenu Spotify:", error.response ? error.response.data : error.message);
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

const navigationResponses = {
    request_location: {
        pl: "Jasne, mogę Cię tam zaprowadzić. Powiedz mi proszę, gdzie teraz jesteś?",
        en: "Sure, I can take you there. Please tell me, where are you now?"
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

async function getAnswerFromAI(query, chatHistory, context, lang = 'pl', imageParts = []) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const langInstruction = lang === 'en' ? 'Your answer must be in English.' : 'Twoja odpowiedź musi być w języku polskim.';
    const historyForGemini = chatHistory.map(turn => ({ role: turn.role, parts: [{ text: turn.parts[0].text }] }));

    const systemInstruction = `Jesteś przyjaznym i pomocnym asystentem AI ✈️ na Lotnisku w Edynburgu (EDI). Twoim zadaniem jest prowadzenie miłej i użytecznej konwersacji. Używaj emoji, aby Twoje odpowiedzi były bardziej przyjazne! ${langInstruction}

**NAJWAŻNIEJSZA ZASADA (ROUTER INTENCJI):**
Twoim pierwszym zadaniem jest zrozumienie intencji użytkownika. Zawsze odpowiadaj, zaczynając od słowa kluczowego intencji, po którym następuje dwukropek i spacja, a następnie Twoja właściwa odpowiedź.

-   Jeśli pytanie zawiera frazy takie jak "jak dojść", "pokaż drogę", "nawiguj", "trasa z... do...", "how to get", "show me the way", "navigate", to jest to **PROŚBA O NAWIGACJĘ**. W takim przypadku zacznij odpowiedź od: \`INTENCJA:NAWIGACJA: \`
-   W każdym innym przypadku jest to **PROŚBA O INFORMACJĘ**. W takim przypadku zacznij odpowiedź od: \`INTENCJA:INFORMACJA: \`

---
**PROTOKÓŁ NAWIGACJI (gdy intencja to NAWIGACJA):**
1.  Twoim jedynym źródłem wiedzy jest załączony obraz mapy. ZIGNORUJ "KONTEKST Z BAZY WIEDZY".
2.  Twoim zadaniem jest wygenerowanie wskazówek tekstowych krok po kroku z punktu startowego do celu, które są podane w zapytaniu.
3.  Bądź precyzyjny i opieraj się na punktach orientacyjnych widocznych na mapie.

---
**PROTOKÓŁ INFORMACYJNY (gdy intencja to INFORMACJA):**
1.  Twoim jedynym źródłem wiedzy jest "KONTEKST Z BAZY WIEDZY". ZIGNORUJ załączony obraz mapy, jeśli taki istnieje.
2.  ZAWSZE najpierw spróbuj odpowiedzieć na pytanie, korzystając z informacji w sekcji "KONTEKST Z BAZY WIEDZY".
3.  Jeśli informacja nie znajduje się w "KONTEKŚCIE Z BAZY WIEDZY", Twoja jedyna dozwolona odpowiedź to:
    (PL) "Hmm, nie jestem pewien tej informacji 🤔. Najlepiej sprawdzić to na oficjalnej stronie lotniska: [Strona Główna Lotniska w Edynburgu](https://www.edinburghairport.com/) 🌐"
    (EN) "Hmm, I'm not sure about that information 🤔. The best place to check is the official airport website: [Edinburgh Airport Homepage](https://www.edinburghairport.com/) 🌐"

---
**ZASADY UNIWERSALNE:**
-   **BEZ FORMATOWANIA:** Nigdy nie używaj znaków formatowania Markdown, takich jak gwiazdki (*), (**), (***) z wyjątkiem tworzenia linków w formacie [tekst](URL).

---
**KONTEKST Z BAZY WIEDZY (Używaj tylko dla PROTOKÓŁU INFORMACYJNEGO):**
${context}
---`;

    const chat = model.startChat({ history: historyForGemini, systemInstruction: { role: "system", parts: [{ text: systemInstruction }] }, generationConfig: { maxOutputTokens: 1000 } });

    const result = await chat.sendMessage([query, ...imageParts]);
    const response = await result.response;
    return response.text().trim();
}

app.post('/api/ask', async (req, res) => {
    const sessionId = req.ip;
    let conversationState = conversationStates.get(sessionId) || {};

    try {
        const { question, lang, chatHistory } = req.body;
        if (!question) return res.status(400).json({ error: 'Zapytanie nie może być puste.' });

        const lowerQuestion = question.toLowerCase();
        console.log(`[DEBUG - API ASK] Pytanie od użytkownika: "${question}" (język: ${lang})`);
        console.log(`[DEBUG - API ASK] Konwersacja w stanie (początek):`, conversationState);

        const fromKeywords = [' z ', ' od ', ' from '];
        const toKeywords = [' do ', ' na ', ' to '];

        if (conversationState.isNavigating && conversationState.destination && conversationState.userZone === null) {
            console.log("[DEBUG - API ASK] Tryb nawigacji: oczekiwanie na strefę użytkownika (kontynuacja).");
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
                const destZone = dest.zone;
                console.log(`[DEBUG - USER ZONE] Użytkownik jest w: ${userZone}, Cel jest w: ${destZone}`);

                if (userZone === destZone || destZone === 'transition_point') {
                    console.log("[DEBUG - USER ZONE] Użytkownik jest w tej samej strefie co cel lub w strefie przejściowej.");
                    const mapPath = path.join(__dirname, 'public', dest.map_file);
                    const imageParts = [fileToGenerativePart(mapPath, "image/jpeg")];
                    const prompt = `Prowadź z mojej obecnej lokalizacji do celu: ${dest.name[lang]}. Szczegóły celu: ${dest.details[lang]}. Użyj załączonej mapy.`;
                    const answer = await getAnswerFromAI(prompt, chatHistory, "", lang, imageParts);
                    conversationStates.delete(sessionId); // Zakończ stan nawigacji
                    res.json({
                        answer: answer.replace(/^INTENCJA:NAWIGACJA: /, ''),
                        imageUrl: dest.map_file,
                        action: 'show_navigation_modal'
                    });
                    return;
                } else if (userZone === 'before_security' && destZone === 'after_security') {
                    console.log("[DEBUG - USER ZONE] Użytkownik jest przed kontrolą, cel jest po kontroli.");
                    const answer = navigationResponses.before_to_after_security[lang](dest.name[lang]);
                    conversationStates.set(sessionId, { ...conversationState, userZone: 'before_security' }); // Utrzymaj stan, ale zaktualizuj strefę
                    res.json({ answer });
                    return;
                } else if (userZone === 'after_security' && destZone === 'before_security') {
                    console.log("[DEBUG - USER ZONE] Użytkownik jest po kontroli, cel jest przed kontrolą.");
                    const answer = navigationResponses.after_to_before_security[lang](dest.name[lang]);
                    conversationStates.delete(sessionId); // Zakończ stan nawigacji
                    res.json({ answer });
                    return;
                }
                console.log("[DEBUG - USER ZONE] Logika stref nie pasuje, powrót do pytania o lokalizację.");
                res.json({
                    answer: navigationResponses.not_understood[lang],
                    action: 'request_location'
                });
                return;

            } else {
                console.log("[DEBUG - USER ZONE] Nie zrozumiano strefy użytkownika. Ponowne pytanie o lokalizację.");
                res.json({
                    answer: navigationResponses.not_understood[lang],
                    action: 'request_location'
                });
                return;
            }
        }

        const aiResponseWithIntent = await getAnswerFromAI(question, chatHistory, "", lang);
        const [intentPrefix, aiAnswerContent] = aiResponseWithIntent.split(/^(INTENCJA:NAWIGACJA:|INTENCJA:INFORMACJA:)\s*/).slice(1);
        const intent = intentPrefix ? intentPrefix.replace('INTENCJA:', '').replace(':', '').trim() : 'UNKNOWN';
        const finalAiAnswer = aiAnswerContent || aiResponseWithIntent;

        console.log(`[DEBUG - API ASK] AI sklasyfikowało intencję jako: ${intent}`);

        if (intent === 'NAWIGACJA') {
            console.log("[DEBUG - API ASK] AI zidentyfikowało intencję nawigacji.");
            let startLocation = null;
            let endLocation = null;
            let toKeywordIndex = -1;
            let toKeywordUsed = '';

            toKeywords.forEach(kw => {
                let index = lowerQuestion.lastIndexOf(kw);
                if (index > toKeywordIndex) {
                    toKeywordIndex = index;
                    toKeywordUsed = kw;
                }
            });

            if (toKeywordIndex !== -1) {
                const beforeTo = lowerQuestion.substring(0, toKeywordIndex);
                const afterTo = lowerQuestion.substring(toKeywordIndex + toKeywordUsed.length);

                let fromKeywordIndex = -1;
                let fromKeywordUsed = '';
                fromKeywords.forEach(kw => {
                    let index = beforeTo.lastIndexOf(kw);
                    if (index > fromKeywordIndex) {
                        fromKeywordIndex = index;
                        fromKeywordUsed = kw;
                    }
                });

                if (fromKeywordIndex !== -1) {
                    const startPhrase = beforeTo.substring(fromKeywordIndex + fromKeywordUsed.length).trim();
                    const endPhrase = afterTo.trim();

                    console.log(`[DEBUG - API ASK] Próba dopasowania lokalizacji (pełna trasa): startPhrase="${startPhrase}", endPhrase="${endPhrase}"`);

                    const possibleStarts = locationsData.locations.filter(loc => loc.aliases[lang].some(alias => startPhrase.includes(alias)));
                    const possibleEnds = locationsData.locations.filter(loc => loc.aliases[lang].some(alias => endPhrase.includes(alias)));

                    console.log(`[DEBUG - API ASK] Możliwe początki: ${possibleStarts.map(p => p.name[lang])}, Możliwe cele: ${possibleEnds.map(p => p.name[lang])}`);

                    if (possibleStarts.length > 0 && possibleEnds.length > 0) {

                        for (const start of possibleStarts) {
                            const matchingEnd = possibleEnds.find(end => end.zone === start.zone);
                            if (matchingEnd) {
                                startLocation = start;
                                endLocation = matchingEnd;
                                console.log(`[DEBUG - API ASK] Znaleziono pełną trasę: z ${startLocation.name[lang]} do ${endLocation.name[lang]}`);
                                break;
                            }
                        }
                        if (!startLocation && !endLocation) {
                             startLocation = possibleStarts[0];
                             endLocation = possibleEnds[0];
                             console.log(`[DEBUG - API ASK] Znaleziono pełną trasę (różne strefy): z ${startLocation.name[lang]} do ${endLocation.name[lang]}`);
                        }
                    }
                }
            }

            if (startLocation && endLocation) {
                // Mamy punkt początkowy i końcowy
                console.log("[DEBUG - API ASK] Tryb nawigacji: z punktu A do punktu B.");

                if (startLocation.zone === endLocation.zone || endLocation.zone === 'transition_point') {
                    const mapPath = path.join(__dirname, 'public', startLocation.map_file);
                    const imageParts = [fileToGenerativePart(mapPath, "image/jpeg")];
                    const prompt = `Prowadź z ${startLocation.name[lang]} do ${endLocation.name[lang]}. Szczegóły celu: ${endLocation.details[lang]}. Użyj załączonej mapy.`;
                    const answer = await getAnswerFromAI(prompt, chatHistory, "", lang, imageParts);
                    conversationStates.delete(sessionId); // Zakończ stan nawigacji
                    res.json({
                        answer: answer.replace(/^INTENCJA:NAWIGACJA: /, ''),
                        imageUrl: startLocation.map_file,
                        action: 'show_navigation_modal'
                    });
                    return;
                } else if (startLocation.zone === 'before_security' && endLocation.zone === 'after_security') {
                    // Z przed kontroli na po kontrolę
                    const answer = navigationResponses.before_to_after_security[lang](endLocation.name[lang]);
                    conversationStates.set(sessionId, { isNavigating: true, destination: endLocation, userZone: 'before_security' });
                    res.json({ answer });
                    return;
                } else if (startLocation.zone === 'after_security' && endLocation.zone === 'before_security') {
                    const answer = navigationResponses.after_to_before_security[lang](endLocation.name[lang]);
                    conversationStates.delete(sessionId);
                    res.json({ answer });
                    return;
                }
            }

            let destinationSingle = locationsData.locations.find(loc => loc.aliases[lang].some(alias => lowerQuestion.includes(alias)));
            if (destinationSingle) {
                console.log("[DEBUG - API ASK] Tryb nawigacji: tylko cel, oczekiwanie na strefę użytkownika (ustawienie stanu).");
                conversationStates.set(sessionId, { isNavigating: true, destination: destinationSingle, userZone: null });
                res.json({
                    answer: navigationResponses.request_location[lang],
                    action: 'request_location'
                });
                return;
            } else {
                console.log("[DEBUG - API ASK] AI zidentyfikowało nawigację, ale nie znaleziono celu. Powrót do ogólnej odpowiedzi AI.");
                res.json({ answer: finalAiAnswer });
                return;
            }

        } else {
            console.log("[DEBUG - API ASK] AI zidentyfikowało intencję informacyjną lub nieznaną. Przetwarzanie jako pytanie informacyjne.");
            conversationStates.delete(sessionId); // Zakończ stan nawigacji, jeśli był
            const model = genAI.getGenerativeModel({ model: "embedding-001" });
            const queryEmbedding = await model.embedContent(question);
            const pineconeIndex = pinecone.index(PINECONE_INDEX_NAME);
            const queryResult = await pineconeIndex.query({ vector: queryEmbedding.embedding.values, topK: 5, includeMetadata: true });
            const contextText = queryResult.matches.length > 0 ? queryResult.matches.map(match => match.metadata.text_chunk).join('\n\n---\n\n') : "Brak informacji w bazie wiedzy na ten temat.";

            const informationAnswer = await getAnswerFromAI(question, chatHistory, contextText, lang);
            res.json({ answer: informationAnswer.replace(/^INTENCJA:INFORMACJA: /, ''), sourceContext: queryResult.matches.length > 0 ? queryResult.matches[0].metadata : null });
            return;
        }

    } catch (error) {
        console.error('[Backend] Krytyczny błąd w /api/ask:', error);
        conversationStates.delete(sessionId);
        res.status(500).json({ error: 'Wystąpił wewnętrzny błąd serwera.' });
    }
});


app.post('/api/playlist', async (req, res) => {
    const { genre } = req.body;
    if (!genre) {
        return res.status(400).json({ error: 'Gatunek muzyczny jest wymagany.' });
    }
    try {
        const token = await getSpotifyToken();
        const response = await axios.get('https://api.spotify.com/v1/search', {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { q: `genre:${genre}`, type: 'track', limit: 20, market: 'PL' }
        });
        const tracks = response.data.tracks.items;
        if (tracks.length === 0) {
            return res.status(404).json({ error: `Nie znaleziono piosenek dla gatunku: ${genre}` });
        }
        const shuffled = tracks.sort(() => 0.5 - Math.random());
        const selectedTracks = shuffled.slice(0, 3);
        const playlistData = selectedTracks.map(track => ({
            id: track.id,
            name: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            albumArt: track.album.images[0]?.url || 'https://via.placeholder.com/80'
        }));
        res.json({ tracks: playlistData });
    } catch (error) {
        console.error(`Błąd podczas pobierania playlisty ze Spotify:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Wystąpił błąd podczas komunikacji ze Spotify.' });
    }
});

app.post('/api/convert', (req, res) => {
    const { amount, from, to } = req.body;
    if (typeof amount !== 'number' || !from || !to) {
        return res.status(400).json({ error: 'Nieprawidłowe dane.' });
    }
    const upperFrom = from.toUpperCase();
    const upperTo = to.toUpperCase();
    if (!fs.existsSync(RATES_FILE_PATH)) {
        return res.status(500).json({ error: 'Brak pliku z kursami walut. Uruchom `node public/update-rates.js`.' });
    }
    const ratesJson = fs.readFileSync(RATES_FILE_PATH, 'utf-8');
    const rates = JSON.parse(ratesJson);
    if (rates.base !== 'GBP') {
        return res.status(500).json({ error: 'Błąd konfiguracji: Waluta bazowa w pliku rates.json nie jest GBP.' });
    }
    if (!rates.rates[upperFrom] || !rates.rates[upperTo]) {
         return res.status(404).json({ error: 'Waluta nieobsługiwana.' });
    }
    const calculatorPath = path.join(__dirname, 'cpp_tools', 'currency_calculator');
    const calculatorProcess = spawn(calculatorPath);
    let result = '';
    let errorResult = '';
    const inputData = `${amount} ${upperFrom} ${upperTo}\n${JSON.stringify(rates.rates)}`;
    calculatorProcess.stdin.write(inputData);
    calculatorProcess.stdin.end();
    calculatorProcess.stdout.on('data', (data) => {
        result += data.toString();
    });
    calculatorProcess.stderr.on('data', (data) => {
        errorResult += data.toString();
    });
    calculatorProcess.on('close', (code) => {
        if (code === 0) {
            const finalResult = parseFloat(result.trim());
            res.json({ from: upperFrom, to: upperTo, amount, result: finalResult });
        } else {
            console.error(`Błąd programu C++ (currency_calculator): ${errorResult}`);
            res.status(500).json({ error: 'Błąd podczas obliczania kursu waluty.', details: errorResult.trim() });
        }
    });
});

app.post('/api/summarize', async (req, res) => {
    const { text } = req.body;
    if (!text) { return res.status(400).json({ error: 'Brak tekstu do podsumowania.' }); }
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
    if (!text) { return res.status(400).json({ error: 'Brak tekstu do tłumaczenia.' }); }
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
    if (!text) {
        return res.status(400).json({ error: 'Brak tekstu do analizy.' });
    }
    const calculatorPath = path.join(__dirname, 'cpp_tools', 'reading_time_calculator');
    const calculatorProcess = spawn(calculatorPath);
    let result = '';
    let errorResult = '';
    calculatorProcess.stdin.write(text);
    calculatorProcess.stdin.end();
    calculatorProcess.stdout.on('data', (data) => {
        result += data.toString();
    });
    calculatorProcess.stderr.on('data', (data) => {
        errorResult += data.toString();
    });
    calculatorProcess.on('close', (code) => {
        if (code === 0) {
            res.json({ readingTime: parseInt(result.trim(), 10) });
        } else {
            console.error(`Błąd programu C++ (reading-time): ${errorResult}`);
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

    updateProcess.stdout.on('data', (data) => console.log(`[update-rates]: ${data}`));
    updateProcess.stderr.on('data', (data) => console.error(`[update-rates BŁĄD]: ${data}`));
};

updateRates();
setInterval(updateRates, 24 * 60 * 60 * 1000);