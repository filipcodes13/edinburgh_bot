
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');


if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.GOOGLE_API_KEY) {
    console.error("BŁĄD: Upewnij się, że masz zdefiniowane SUPABASE_URL, SUPABASE_SERVICE_KEY i GOOGLE_API_KEY w pliku .env");
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const docsPath = path.join(__dirname, 'airport_docs');


/**
 * Dzieli tekst na mniejsze fragmenty, aby zmieściły się w limicie modelu.
 * @param {string} text - Tekst do podziału.
 * @param {number} chunkSize - Maksymalny rozmiar fragmentu.
 * @param {number} chunkOverlap - Ile znaków ma się nakładać między fragmentami.
 * @returns {string[]} - Tablica fragmentów tekstu.
 */
function chunkText(text, chunkSize = 1500, chunkOverlap = 200) {
    const chunks = [];
    if (text.length <= chunkSize) {
        chunks.push(text);
        return chunks;
    }
    for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
        chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Tworzy wektor semantyczny dla danego tekstu za pomocą modelu Google.
 * @param {string} text 
 * @returns {Promise<number[]>} 
 */

async function createEmbedding(text) {
    try {
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        console.error("Błąd podczas tworzenia wektora:", error.message);
        if (error.message.includes('429')) {
            console.log("Przekroczono limit zapytań. Czekam 5 sekund przed ponowieniem próby...");
            await new Promise(resolve => setTimeout(resolve, 5000));
            return createEmbedding(text);
        }
        throw error;
    }
}

async function processAndUpload() {
    console.log('Rozpoczynam przetwarzanie i wysyłanie danych do Supabase...');

    try {
        const files = fs.readdirSync(docsPath).filter(file => file.endsWith('.txt'));
        if (files.length === 0) {
            console.log("Nie znaleziono żadnych plików .txt w folderze 'airport_docs'.");
            return;
        }

        console.log(`Znaleziono pliki do przetworzenia: ${files.join(', ')}`);

        for (const fileName of files) {
            console.log(`\n--- Przetwarzam plik: ${fileName} ---`);
            const filePath = path.join(docsPath, fileName);
            const content = fs.readFileSync(filePath, 'utf-8');
            
            const chunks = chunkText(content);
            console.log(`Plik pocięty na ${chunks.length} fragmentów.`);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                
                await new Promise(resolve => setTimeout(resolve, 1100)); 
                
                console.log(`  Tworzę wektor dla fragmentu ${i + 1}/${chunks.length}...`);
                const embedding = await createEmbedding(chunk);
                
                const { error } = await supabase
                    .from('documents')
                    .insert({ content: chunk, embedding: embedding });

                if (error) {
                    console.error(`  Błąd podczas wysyłania fragmentu ${i + 1}:`, error.message);
                } else {
                    console.log(`  Wysłano fragment ${i + 1}/${chunks.length}`);
                }
            }
        }
        console.log('\n--- Zakończono proces! ---');
        console.log('Wszystkie dane zostały przetworzone i wysłane do Twojej bazy Supabase.');

    } catch (error) {
        console.error("\n!!! Wystąpił krytyczny błąd podczas procesu wysyłania !!!");
        console.error("Błąd:", error.message);
    }
}

processAndUpload();
