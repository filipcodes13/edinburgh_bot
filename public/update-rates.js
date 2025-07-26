require('dotenv').config(); 
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const RATES_FILE_PATH = path.join(__dirname, 'rates.json');

const API_KEY = process.env.EXCHANGERATE_API_KEY;

if (!API_KEY) {
    console.error('BŁĄD KRYTYCZNY: Brak klucza EXCHANGERATE_API_KEY w pliku .env!');
    process.exit(1);
}

const BASE_CURRENCY = 'GBP';
const API_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${BASE_CURRENCY}`;

async function fetchAndSaveRates() {
  try {
    console.log('Pobieranie aktualnych kursów walut z brytyjskiego źródła...');
    const response = await axios.get(API_URL);
    
    if (response.data.result === 'error') {
        throw new Error(`Błąd API: ${response.data['error-type']}`);
    }

    const ratesData = {
        base: response.data.base_code,
        date: new Date(response.data.time_last_update_unix * 1000).toISOString().split('T')[0],
        rates: response.data.conversion_rates
    };

    fs.writeFileSync(RATES_FILE_PATH, JSON.stringify(ratesData, null, 2));
    console.log(`Kursy walut zostały pomyślnie zapisane w ${RATES_FILE_PATH}`);

  } catch (error) {
    console.error('Wystąpił błąd podczas pobierania kursów walut:', error.message);
  }
}

fetchAndSaveRates();