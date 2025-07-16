require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');
let fetch;
(async () => {
    const nodeFetchModule = await import('node-fetch');
    fetch = nodeFetchModule.default;
})();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.PINECONE_API_KEY || !process.env.GOOGLE_API_KEY || !process.env.SUPABASE_SERVICE_KEY) {
    console.error("KRYTYCZNY BŁĄD: Brakuje kluczy API w zmiennych środowiskowych!");
    process.exit(1);
}

const PINECONE_INDEX_NAME = 'airport-navigator-embeddings';
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const imageMap = {
    'kontrola bezpieczeństwa': 'images/kontrola_bezpieczenstwa.jpg', 'security': 'images/kontrola_bezpieczenstwa.jpg',
    'paszportowa': 'images/kontrola_paszportowa.jpg', 'passport control': 'images/kontrola_paszportowa.jpg',
    'odprawa': 'images/nadawanie_bagazu.jpg', 'check-in': 'images/nadawanie_bagazu.jpg', 'nadać bagaż': 'images/nadawanie_bagazu.jpg',
    'lounge': 'images/salonik_lounge.jpg', 'salonik': 'images/salonik_lounge.jpg', 'poczekalnia': 'images/salonik_lounge.jpg',
    'informacj': 'images/punkt_informacji.jpg', 'taxi': 'images/postoj_taksowek.jpg',
    'autobus': 'images/przystanek_autobusowy_lotnisko.jpg', 'parking': 'images/parking_wielopoziomowy.jpg',
    'duty free': 'images/sklep_wolnoclowy.jpg', 'kawiarnia': 'images/kawiarnia_lotnisko.jpg', 'restauracja': 'images/restauracja_lotnisko.jpg'
};

// Zastąp starą funkcję getAnswerFromAI tą nową, zbalansowaną wersją
async function getAnswerFromAI(query, chatHistory, context, lang = 'pl') {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const langInstruction = lang === 'en' ? 'Your answer must be in English.' : 'Twoja odpowiedź musi być w języku polskim.';

    const historyForPrompt = chatHistory.map(turn =>
        `**${turn.role === 'user' ? 'Użytkownik' : 'Asystent'}**: ${turn.parts[0].text}`
    ).join('\n');

    const prompt = `Jesteś inteligentnym i intuicyjnym asystentem lotniska w Edynburgu (EDI). Twoja wiedza jest ograniczona WYŁĄCZNIE do informacji zawartych w sekcji "KONTEKST Z BAZY WIEDZY". Twoim zadaniem jest prowadzenie pomocnej konwersacji. ${langInstruction}

Twoje Złote Reguły:

1.  **TRZYMAJ SIĘ FAKTÓW:** Twoja odpowiedź MUSI wynikać bezpośrednio z dostarczonego "KONTEKSTU Z BAZY WIEDZY". To jest Twoje jedyne źródło prawdy.

2.  **BĄDŹ INTUICYJNY WEWNĄTRZ SWOJEJ WIEDZY:**
    * **Gdy pytanie jest ogólne:** Jeśli kontekst zawiera listę opcji (np. różne restauracje), pogrupuj je w kategorie i ZAPYTAJ użytkownika o jego preferencje, aby go naprowadzić.
    * **Gdy pytanie jest niejasne:** Jeśli kontekst sugeruje niejednoznaczność (np. dwa sklepy o tej samej nazwie), zadaj użytkownikowi krótkie pytanie doprecyzowujące.

3.  **JEŚLI NIE WIESZ, SKIERUJ DO OBSŁUGI:** To Twoja najważniejsza zasada. Jeśli po przeanalizowaniu "KONTEKSTU Z BAZY WIEDZY" stwierdzisz, że nie ma w nim odpowiedzi na pytanie użytkownika, Twoja JEDYNA dozwolona odpowiedź to:
    * (PL) "Przepraszam, nie posiadam informacji na ten temat. W celu uzyskania pomocy, proszę skontaktować się z punktem informacyjnym na lotnisku."
    * (EN) "I'm sorry, I don't have information on that topic. For assistance, please contact the airport information desk."
    Nie próbuj zgadywać ani być pomocny w inny sposób.

4.  **PAMIĘTAJ O HISTORII ROZMOWY:** Analizuj sekcję "POPRZEDNIA ROZMOWA", aby Twoje odpowiedzi były spójne.

---
**POPRZEDNIA ROZMOWA:**
${historyForPrompt}
---
**KONTEKST Z BAZY WIEDZY (Twoje jedyne źródło prawdy):**
${context}
---

**OSTATNIE PYTANIE UŻYTKOWNIKA:** "${query}"

**Twoja Odpowiedź:**`;

    const result = await model.generateContent(prompt);
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

        const contextText = queryResult.matches.length > 0
            ? queryResult.matches.map(match => match.metadata.text_chunk).join('\n\n---\n\n')
            : "Brak informacji w bazie wiedzy na ten temat.";

        let sourceContext = queryResult.matches.length > 0 ? queryResult.matches[0].metadata : null;

        let answer = await getAnswerFromAI(question, chatHistory || [], contextText, lang);

        if (answer.trim().endsWith('?')) sourceContext = null;

        const imageUrl = findContextImage(question) || findContextImage(answer);

        res.json({ answer, imageUrl, sourceContext });
    } catch (error) {
        console.error('[Backend] Krytyczny błąd:', error);
        res.status(500).json({ error: 'Wystąpił wewnętrzny błąd serwera.' });
    }
});

app.listen(port, () => {
    console.log(`Serwer AI Airport Navigator działa na porcie: ${port}`);
});