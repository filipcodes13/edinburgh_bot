const fs = require('fs');
const path = require('path');
const axios = require('axios');

const RATES_FILE_PATH = path.join(__dirname, 'public', 'rates.json');
const API_URL = 'https://api.frankfurter.app/latest?from=EUR';

async function fetchAndSaveRates() {
  try {
    console.log('Pobieranie aktualnych kursów walut...');
    const response = await axios.get(API_URL);
    const data = response.data;

    if (!fs.existsSync(path.dirname(RATES_FILE_PATH))) {
      fs.mkdirSync(path.dirname(RATES_FILE_PATH));
    }

    fs.writeFileSync(RATES_FILE_PATH, JSON.stringify(data, null, 2));
    console.log(`Kursy walut zostały pomyślnie zapisane w ${RATES_FILE_PATH}`);

  } catch (error) {
    console.error('Wystąpił błąd podczas pobierania kursów walut:', error.message);
  }
}

fetchAndSaveRates();