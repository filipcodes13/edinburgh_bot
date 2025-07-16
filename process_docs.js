require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
const fs = require('fs');
const path = require('path');

// --- KONFIGURACJA ---
const SUPABASE_URL = process.env.SUPABASE_URL; 
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const PINECONE_INDEX_NAME = 'airport-navigator-embeddings';

// Sprawdzenie, czy wszystkie klucze API są dostępne
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !PINECONE_API_KEY || !GOOGLE_API_KEY) {
    console.error("BŁĄD KRYTYCZNY: Brakuje kluczowych zmiennych środowiskowych w pliku .env! Upewnij się, że wszystkie klucze są ustawione.");
    process.exit(1);
}

// Inicjalizacja klientów API
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY); 

const docsPath = path.join(__dirname, 'airport_docs');
const EMBEDDING_MODEL = "embedding-001"; // Model do generowania wektorów
const COMPLETION_MODEL = "gemini-1.5-pro-latest"; // Model do generowania odpowiedzi

/**
 * Bardziej inteligentna funkcja do dzielenia tekstu na fragmenty.
 * Stara się nie przecinać zdań i zachowuje pewne nakładanie się dla lepszego kontekstu.
 * @param {string} text - Pełny tekst dokumentu.
 * @param {number} chunkSize - Docelowy rozmiar fragmentu.
 * @param {number} chunkOverlap - Ile znaków ma się nakładać.
 * @returns {string[]} Tablica fragmentów tekstu.
 */
function splitTextIntoChunks(text, chunkSize = 1000, chunkOverlap = 150) {
    const sentences = text.split(/(?<=[.?!])\s+/);
    const chunks = [];
    let currentChunk = "";

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize) {
            chunks.push(currentChunk);
            currentChunk = currentChunk.slice(-chunkOverlap); // Zachowaj kontekst
        }
        currentChunk += (currentChunk.length > 0 ? " " : "") + sentence;
    }
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    return chunks;
}

/**
 * Generuje wektor (embedding) dla danego tekstu.
 * @param {string} text Tekst do przetworzenia.
 * @returns {Promise<number[]>} Wektor osadzenia.
 */
async function generateEmbedding(text) {
    try {
        const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error("Błąd podczas generowania wektora przez Gemini:", error.message);
        if (error.message.includes('429')) { // Prosta obsługa błędów rate limiting
             console.log("Przekroczono limit zapytań. Czekam 5 sekund...");
             await new Promise(resolve => setTimeout(resolve, 5000));
             return generateEmbedding(text); 
        }
        throw error;
    }
}

/**
 * Główna funkcja orkiestrująca proces.
 */
async function uploadFilesAndEmbeddings() {
    console.log('🚀 Rozpoczynam wysyłanie plików i osadzeń do baz danych...');

    try {
        // Sprawdzenie, czy indeks Pinecone istnieje
        const pineconeIndexList = await pinecone.listIndexes();
        if (!pineconeIndexList.indexes || !pineconeIndexList.indexes.some(idx => idx.name === PINECONE_INDEX_NAME)) {
            console.error(`❌ BŁĄD: Indeks Pinecone '${PINECONE_INDEX_NAME}' nie istnieje! Utwórz go najpierw w panelu Pinecone.`);
            return;
        }

        const index = pinecone.index(PINECONE_INDEX_NAME);
        const filesToProcess = fs.readdirSync(docsPath).filter(file => file.endsWith('.txt'));

        if (filesToProcess.length === 0) {
            console.warn("⚠️ Brak plików .txt w folderze 'airport_docs' do przetworzenia.");
            return;
        }

        for (const fileName of filesToProcess) {
            console.log(`\n--- 📄 Przetwarzam plik: ${fileName} ---`);
            const filePath = path.join(docsPath, fileName);
            const content = fs.readFileSync(filePath, 'utf-8');

            // 1. Zapis/aktualizacja pełnej treści pliku w Supabase
            const { error: upsertError } = await supabase
                .from('documents')
                .upsert({ filename: fileName, content: content }, { onConflict: 'filename' });

            if (upsertError) {
                 console.error(`  ❌ Błąd przy zapisie pliku ${fileName} w Supabase:`, upsertError.message);
            } else {
                 console.log(`  ✅ Plik ${fileName} pomyślnie zapisany w Supabase.`);
            }

            // 2. Dzielenie tekstu, tworzenie wektorów i wysyłanie do Pinecone
            const textChunks = splitTextIntoChunks(content);
            console.log(`  Plik pocięty na ${textChunks.length} spójnych fragmentów. Generuję wektory...`);
            
            const vectorsToUpsert = [];
            for (let i = 0; i < textChunks.length; i++) {
                // Opóźnienie, aby nie przekroczyć limitów API Gemini (ok. 60 zapytań na minutę)
                await new Promise(resolve => setTimeout(resolve, 1100));

                const chunk = textChunks[i];
                if (!chunk || chunk.trim().length === 0) continue;

                try {
                    const embedding = await generateEmbedding(chunk);
                    vectorsToUpsert.push({
                        id: `${fileName}_chunk_${i}`,
                        values: embedding,
                        metadata: { filename: fileName, chunk_index: i, text_chunk: chunk }
                    });
                    console.log(`  🧠 Wygenerowano wektor dla fragmentu ${i + 1}/${textChunks.length}`);
                } catch (embeddingError) {
                    console.error(`  ❌ Błąd podczas generowania wektora dla fragmentu ${i} pliku ${fileName}. Pomijam ten fragment.`);
                }
            }

            // 3. Wysyłanie wektorów do Pinecone w paczkach (batching)
            if (vectorsToUpsert.length > 0) {
                console.log(`  📤 Wysyłam ${vectorsToUpsert.length} wektorów dla pliku ${fileName} do Pinecone...`);
                // Pinecone zaleca wysyłanie w paczkach po max 100 wektorów
                for (let i = 0; i < vectorsToUpsert.length; i += 100) {
                    const batch = vectorsToUpsert.slice(i, i + 100);
                    await index.upsert(batch);
                }
                console.log(`  🌲 Osadzenia dla pliku ${fileName} pomyślnie przesłane do Pinecone.`);
            }
        }
        console.log('\n\n🎉 --- Proces zakończony! --- 🎉');
        console.log('Wszystkie dane zostały przetworzone i wysłane do Twoich baz danych.');

    } catch (error) {
        console.error("\n\n🔥 !!! Wystąpił krytyczny błąd podczas całego procesu !!! 🔥");
        console.error("Błąd:", error.message);
    }
}

// Uruchomienie głównej funkcji
uploadFilesAndEmbeddings();