require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { spawn } = require('child_process'); // Dodajemy 'spawn' do importów

const app = express();
const port = 8080; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


if (!process.env.PINECONE_API_KEY || !process.env.GOOGLE_API_KEY || !process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET || !process.env.EXCHANGERATE_API_KEY) {
    console.error("KRYTYCZNY BŁĄD: Brakuje kluczy API! Upewnij się, że plik .env zawiera klucze Pinecone, Google, Spotify ORAZ EXCHANGERATE_API_KEY.");
    process.exit(1);
}

const PINECONE_INDEX_NAME = 'airport-navigator-embeddings';
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const imageMapPath = path.join(__dirname, 'public/image_map.json');
const imageMap = JSON.parse(fs.readFileSync(imageMapPath, 'utf-8'));


let spotifyToken = null;
let tokenExpiryTime = 0;

async function getSpotifyToken() {
    if (spotifyToken && Date.now() < tokenExpiryTime) {
        return spotifyToken;
    }
    console.log("Pobieranie nowego tokenu dostępu Spotify...");
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', 'grant_type=client_credentials', {
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        spotifyToken = response.data.access_token;
        tokenExpiryTime = Date.now() + (response.data.expires_in - 300) * 1000;
        console.log("Token Spotify został pomyślnie pobrany.");
        return spotifyToken;
    } catch (error) {
        console.error("Błąd podczas pobierania tokenu Spotify:", error.response ? error.response.data : error.message);
        throw new Error("Nie można uzyskać tokenu od Spotify.");
    }
}


const RATES_FILE_PATH = path.join(__dirname, 'public', 'rates.json');



async function getAnswerFromAI(query, chatHistory, context, lang = 'pl') {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const langInstruction = lang === 'en' ? 'Your answer must be in English.' : 'Twoja odpowiedź musi być w języku polskim.';
    const historyForGemini = chatHistory.map(turn => ({ role: turn.role, parts: [{ text: turn.parts[0].text }] }));
    
    const systemInstruction = `Jesteś przyjaznym i pomocnym asystentem AI ✈️ na Lotnisku w Edynburgu (EDI). Twoim zadaniem jest prowadzenie miłej i użytecznej konwersacji. Używaj emoji, aby Twoje odpowiedzi były bardziej przyjazne! ${langInstruction}

Twoje Złote Reguły:
1.  **PRIORYTET DLA BAZY WIEDZY:** ZAWSZE najpierw spróbuj odpowiedzieć na pytanie, korzystając z informacji w sekcji "KONTEKST Z BAZY WIEDZY". To jest Twoje główne źródło informacji o lotnisku. Jesli sie nie uda korzystaj z informacji w internecie (zweryfikowane zrodla).
2.  **NAWIGACJA WEWNĘTRZNA:** Jeśli w kontekście NIE MA odpowiedzi, a użytkownik pyta o drogę, mapę lub jak gdzieś dotrzeć wewnątrz lotniska, Twoja jedyna odpowiedź to:
    (PL) "Oczywiście! Najlepszym sposobem na znalezienie drogi jest oficjalna mapa lotniska. Znajdziesz ją tutaj: [Mapa Lotniska w Edynburgu](https://www.edinburghairport.com/prepare/airport-maps) 🗺️"
    (EN) "Of course! The best way to find your way is the official airport map. You can find it here: [Edinburgh Airport Map](https://www.edinburghairport.com/prepare/airport-maps) 🗺️"
3.  **POGODA W INNYM MIEŚCIE:** Jeśli w kontekście NIE MA odpowiedzi, a użytkownik pyta o pogodę w mieście INNYM niż Edynburg, Twoja jedyna odpowiedź to:
    (PL) "Przykro mi, ale jestem asystentem na lotnisku w Edynburgu, a nie w {nazwa miasta}. Nie mam pojęcia, jaka tam jest pogoda! 😉"
    (EN) "I'm sorry, but I'm an assistant at Edinburgh Airport, not in {city name}. I have no idea what the weather is like there! 😉"
4.  **JEŚLI NIE WIESZ (ostateczność):** Jeśli informacja nie znajduje się w "KONTEKŚCIE Z BAZY WIEDZY" i pytanie nie pasuje do żadnej z powyższych reguł, Twoja jedyna dozwolona odpowiedź to:
    (PL) "Hmm, nie jestem pewien tej informacji 🤔. Najlepiej sprawdzić to na oficjalnej stronie lotniska: [Strona Główna Lotniska w Edynburgu](https://www.edinburghairport.com/) 🌐"
    (EN) "Hmm, I'm not sure about that information 🤔. The best place to check is the official airport website: [Edinburgh Airport Homepage](https://www.edinburghairport.com/) 🌐"
5.  **BEZ FORMATOWANIA:** Nigdy nie używaj znaków formatowania Markdown, takich jak gwiazdki (*), (**), (***) z wyjątkiem tworzenia linków w formacie [tekst](URL).

---
**KONTEKST Z BAZY WIEDZY (Twoje jedyne źródło prawdy):**
${context}
---`;

    const chat = model.startChat({ history: historyForGemini, systemInstruction: { role: "system", parts: [{ text: systemInstruction }] }, generationConfig: { maxOutputTokens: 1000 } });
    const result = await chat.sendMessage(query);
    const response = await result.response;
    return response.text().trim();
}

async function generateQueryEmbedding(text) {
    const model = genAI.getGenerativeModel({ model: "embedding-001" });
    const result = await model.embedContent(text);
    return result.embedding.values;
}

async function findContextInPinecone(embedding) {
    const pineconeIndex = pinecone.index(PINECONE_INDEX_NAME);
    return await pineconeIndex.query({ vector: embedding, topK: 5, includeMetadata: true });
}

function findContextImage(query) {
    const lowerCaseQuestion = query.toLowerCase();
    for (const keyword in imageMap) {
        if (lowerCaseQuestion.includes(keyword)) return imageMap[keyword];
    }
    return null;
}


app.post('/api/ask', async (req, res) => {
    try {
        const { question, lang, chatHistory } = req.body;
        if (!question) return res.status(400).json({ error: 'Zapytanie nie może być puste.' });
        const queryEmbedding = await generateQueryEmbedding(question);
        const queryResult = await findContextInPinecone(queryEmbedding);
        const contextText = queryResult.matches.length > 0 ? queryResult.matches.map(match => match.metadata.text_chunk).join('\n\n---\n\n') : "Brak informacji w bazie wiedzy na ten temat.";
        let sourceContext = queryResult.matches.length > 0 ? queryResult.matches[0].metadata : null;
        let answer = await getAnswerFromAI(question, chatHistory || [], contextText, lang);
        if (answer.trim().endsWith('?')) sourceContext = null;
        const imageUrl = findContextImage(question) || findContextImage(answer);
        res.json({ answer, imageUrl, sourceContext });
    } catch (error) {
        console.error('[Backend] Krytyczny błąd w /api/ask:', error);
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