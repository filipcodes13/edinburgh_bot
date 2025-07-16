
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const indexName = 'airport-navigator-google';
const pineconeIndex = pinecone.index(indexName);

const docsPath = path.join(__dirname, 'airport_docs');
const filesToProcess = ['regulamin.txt', 'restauracje.txt'];


function chunkText(text, chunkSize = 1000, chunkOverlap = 200) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
        chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
}

async function createEmbedding(text) {
    try {
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error("Błąd podczas tworzenia wektora:", error.message);
        throw error;
    }
}

async function processAndUpload() {
    console.log('Rozpoczynam przetwarzanie i wysyłanie danych do Pinecone (z Kluczem API)...');

    for (const fileName of filesToProcess) {
        console.log(`\nPrzetwarzam plik: ${fileName}`);
        const filePath = path.join(docsPath, fileName);
        
        if (!fs.existsSync(filePath)) {
            console.error(`BŁĄD: Nie znaleziono pliku ${filePath}.`);
            continue;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const chunks = chunkText(content);
        console.log(`Plik pocięty na ${chunks.length} fragmentów.`);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            await new Promise(resolve => setTimeout(resolve, 1100)); // Opóźnienie, aby nie przekroczyć limitu zapytań
            const embedding = await createEmbedding(chunk);
            
            const vector = {
                id: `${fileName}-${i}`,
                values: embedding,
                metadata: { source: fileName, text: chunk },
            };

            await pineconeIndex.upsert([vector]);
            console.log(`  Wysłano fragment ${i + 1}/${chunks.length}`);
        }
    }
    console.log('\nZakończono proces. Dane są w nowym indeksie Pinecone!');
}

processAndUpload();
