require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.PINECONE_API_KEY || !process.env.GOOGLE_API_KEY) {
    console.error("KRYTYCZNY BŁĄD: Brakuje kluczy API!");
    process.exit(1);
}

const PINECONE_INDEX_NAME = 'airport-navigator-embeddings';
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const imageMapPath = path.join(__dirname, 'public/image_map.json');
const imageMap = JSON.parse(fs.readFileSync(imageMapPath, 'utf-8'));

async function getAnswerFromAI(query, chatHistory, context, lang = 'pl') {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const langInstruction = lang === 'en' ? 'Your answer must be in English.' : 'Twoja odpowiedź musi być w języku polskim.';

    const historyForGemini = chatHistory.map(turn => ({
        role: turn.role,
        parts: [{ text: turn.parts[0].text }]
    }));

    const systemInstruction = `Jesteś inteligentnym asystentem lotniska w Edynburgu (EDI). Twoja wiedza jest ograniczona WYŁĄCZNIE do informacji zawartych w sekcji "KONTEKST Z BAZY WIEDZY". Twoim zadaniem jest prowadzenie pomocnej konwersacji. ${langInstruction}

Twoje Złote Reguły:
1.  **TRZYMAJ SIĘ FAKTÓW:** Twoja odpowiedź MUSI wynikać bezpośrednio z dostarczonego "KONTEKSTU Z BAZY WIEDZY".
2.  **BĄDŹ INTUICYJNY WEWNĄTRZ SWOJEJ WIEDZY:** Jeśli kontekst pozwala, dopytuj o szczegóły lub sugeruj kategorie.
3.  **JEŚLI NIE WIESZ, SKIERUJ DO OBSŁUGI:** Jeśli w kontekście nie ma odpowiedzi, Twoja jedyna dozwolona odpowiedź to: (PL) "Przepraszam, nie posiadam informacji na ten temat. W celu uzyskania pomocy, proszę skontaktować się z punktem informacyjnym na lotnisku." lub (EN) "I'm sorry, I don't have information on that topic. For assistance, please contact the airport information desk."
4.  **PAMIĘTAJ O HISTORII ROZMOWY:** Analizuj poprzednie wiadomości, aby Twoje odpowiedzi były spójne.

---
**KONTEKST Z BAZY WIEDZY (Twoje jedyne źródło prawdy):**
${context}
---`;

    const chat = model.startChat({
        history: historyForGemini,
        systemInstruction: {
          role: "system",
          parts: [{ text: systemInstruction }]
        },
        generationConfig: { maxOutputTokens: 500 }
    });

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