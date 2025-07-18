require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const PINECONE_INDEX_NAME = 'airport-navigator-embeddings';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !PINECONE_API_KEY || !GOOGLE_API_KEY) {
    console.error("BŁĄD KRYTYCZNY: Brakuje kluczy API w pliku .env!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const docsPath = path.join(__dirname, 'airport_docs');
const EMBEDDING_MODEL = "embedding-001";

function splitTextIntoChunks(text, chunkSize = 1000, chunkOverlap = 150) {
    const sentences = text.split(/(?<=[.?!])\s+/);
    const chunks = [];
    let currentChunk = "";

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize) {
            chunks.push(currentChunk);
            currentChunk = currentChunk.slice(-chunkOverlap);
        }
        currentChunk += (currentChunk.length > 0 ? " " : "") + sentence;
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
}

async function generateEmbedding(text) {
    try {
        const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error("Błąd podczas generowania wektora:", error.message);
        if (error.message.includes('429')) {
            console.log("Przekroczono limit zapytań. Czekam 5 sekund...");
            await new Promise(resolve => setTimeout(resolve, 5000));
            return generateEmbedding(text);
        }
        throw error;
    }
}

async function uploadAllFilesAndEmbeddings() {
    console.log('🚀 Rozpoczynam wysyłanie wszystkich plików i ich osadzeń...');

    try {
        const pineconeIndexList = await pinecone.listIndexes();
        if (!pineconeIndexList.indexes || !pineconeIndexList.indexes.some(idx => idx.name === PINECONE_INDEX_NAME)) {
            console.error(`❌ BŁĄD: Indeks Pinecone '${PINECONE_INDEX_NAME}' nie istnieje!`);
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

            const { error: upsertError } = await supabase
                .from('documents')
                .upsert({ filename: fileName, content: content }, { onConflict: 'filename' });

            if (upsertError) {
                console.error(`  ❌ Błąd przy zapisie pliku ${fileName} w Supabase:`, upsertError.message);
            } else {
                console.log(`  ✅ Plik ${fileName} pomyślnie zapisany w Supabase.`);
            }

            const textChunks = splitTextIntoChunks(content);
            console.log(`  Plik pocięty na ${textChunks.length} fragmentów. Generuję wektory...`);
            
            const vectorsToUpsert = [];
            for (let i = 0; i < textChunks.length; i++) {
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
                    console.error(`  ❌ Błąd podczas generowania wektora dla fragmentu ${i}. Pomijam.`);
                }
            }

            if (vectorsToUpsert.length > 0) {
                console.log(`  📤 Wysyłam ${vectorsToUpsert.length} wektorów do Pinecone...`);
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
        console.error("\n\n🔥 Wystąpił krytyczny błąd podczas całego procesu! 🔥");
        console.error("Błąd:", error.message);
    }
}

uploadAllFilesAndEmbeddings();