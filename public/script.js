const smallTalk = [
    {
        triggers: ["hej", "czesc", "cześć", "siema", "witaj", "dzien dobry", "dzień dobry"],
        response: {
            pl: "Cześć! W czym mogę Ci dzisiaj pomóc?",
            en: "Hello! How can I help you today?"
        }
    },
    {
        triggers: ["dzięki", "dzieki", "dziękuję", "dziekuje", "super"],
        response: {
            pl: "Nie ma za co! Cieszę się, że mogłem pomóc. Czy jest coś jeszcze, co chciałbyś wiedzieć?",
            en: "You're welcome! I'm glad I could help. Is there anything else you'd like to know?"
        }
    },
    {
        triggers: ["pa", "do widzenia", "na razie"],
        response: {
            pl: "Do zobaczenia! Miłej podróży!",
            en: "Goodbye! Have a great trip!"
        }
    }
];

const translations = {
    "header_title": { pl: "Twój Asystent Lotniskowy ✈️", en: "Your Airport Assistant ✈️" },
    "header_subtitle": { pl: "Witaj na lotnisku w Edynburgu! Zapytaj mnie o cokolwiek.", en: "Welcome to Edinburgh Airport! Ask me anything." },
    "chat_header": { pl: "Czat", en: "Chat" },
    "input_placeholder": { pl: "Wpisz pytanie, np. 'Gdzie znajdę ładowarki?'", en: "Type a question, e.g., 'Where can I find chargers?'" },
    "send_button": { pl: "Zapytaj", en: "Ask" },
    "info_header": { pl: "Dodatkowe Informacje", en: "Additional Information" },
    "summarize_button": { pl: "Podsumuj źródło", en: "Summarize Source" },
    "translate_button": { pl: "Przetłumacz źródło", en: "Translate Source" },
    "footer_text": { pl: "Stworzone przez: Filip Kołodziejczyk & SilverCoders", en: "Created by: Filip Kołodziejczyk & SilverCoders" },
    "welcome_message": { pl: "Cześć! Jestem nawigatorem po lotnisku w Edynburgu. Zadaj mi pytanie.", en: "Hi! I'm your Edinburgh Airport navigator. Ask me a question." },
    "thinking_message": { pl: "Myślę...", en: "Thinking..." },
    "source_header": { pl: "Źródło Odpowiedzi", en: "Answer Source" },
    "source_file": { pl: "Plik", en: "File" },
    "no_source_text": { pl: "Brak dodatkowych informacji.", en: "No additional information." },
    "translate_source_button": { pl: "Przetłumacz źródło", en: "Translate source" }
};

const suggestionChipsData = [
    { pl: "Gdzie zjem?", en: "Where can I eat?" },
    { pl: "Jakie są dostępne saloniki?", en: "What lounges are available?" },
    { pl: "Gdzie są sklepy?", en: "Where are the shops?" }
];

let currentLang = 'pl';
let chatHistory = [];

function setLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('[data-key]').forEach(elem => {
        const key = elem.getAttribute('data-key');
        if (translations[key] && translations[key][lang]) {
            if (elem.placeholder) {
                elem.placeholder = translations[key][lang];
            } else {
                elem.innerText = translations[key][lang];
            }
        }
    });

    document.getElementById('lang-pl').classList.toggle('active', lang === 'pl');
    document.getElementById('lang-en').classList.toggle('active', lang === 'en');
    
    chatHistory = [];
    document.querySelector('.chat-window').innerHTML = '';
    appendMessage(translations.welcome_message[currentLang], 'bot-message', 'Asystent');
    displaySuggestionChips();
}

async function handleUserInput(questionOverride = null) {
    const inputField = document.getElementById('user-input');
    const userQuestion = questionOverride || inputField.value.trim();

    if (!userQuestion) return;

    appendMessage(userQuestion, 'user-message', 'Ty');
    if (!questionOverride) inputField.value = '';
    
    hideSuggestionChips();

    const lowerCaseQuestion = userQuestion.toLowerCase();
    for (const talk of smallTalk) {
        if (talk.triggers.includes(lowerCaseQuestion)) {
            appendMessage(talk.response[currentLang], 'bot-message', 'Asystent');
            return;
        }
    }
    
    showTypingIndicator();
    document.getElementById('info-content').innerHTML = `<p>${translations.thinking_message[currentLang]}</p>`;
    
    chatHistory.push({ role: 'user', parts: [{ text: userQuestion }] });

    try {
        const apiResponse = await fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                question: userQuestion, 
                lang: currentLang,
                chatHistory: chatHistory
            })
        });

        if (!apiResponse.ok) throw new Error('Błąd odpowiedzi serwera.');

        const data = await apiResponse.json();
        const responseText = data.answer || "Przepraszam, wystąpił błąd.";
        const imageUrl = data.imageUrl || null;
        const sourceContext = data.sourceContext || null;

        hideTypingIndicator();
        chatHistory.push({ role: 'model', parts: [{ text: responseText }] });
        
        appendMessage(responseText, 'bot-message', 'Asystent', imageUrl);
        displaySourceContext(sourceContext);

    } catch (error) {
        hideTypingIndicator();
        console.error("Błąd API:", error);
        appendMessage("Przepraszam, mam problem z połączeniem. Spróbuj ponownie.", 'bot-message', 'Asystent');
    }
}

function appendMessage(text, className, author, imageUrl = null) {
    const chatWindow = document.querySelector('.chat-window');
    const messageContainer = document.createElement('div');
    messageContainer.className = className;
    
    const textElement = document.createElement('p');
    const authorStrong = document.createElement('strong');
    authorStrong.innerText = `${author}: `;
    textElement.appendChild(authorStrong);
    textElement.append(text);
    messageContainer.appendChild(textElement);

    if (imageUrl) {
        const imageElement = document.createElement('img');
        imageElement.src = imageUrl;
        imageElement.style.maxWidth = '100%';
        imageElement.style.borderRadius = '10px';
        imageElement.style.marginTop = '10px';
        messageContainer.appendChild(imageElement);
    }
    
    chatWindow.appendChild(messageContainer);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function showTypingIndicator() {
    const chatWindow = document.querySelector('.chat-window');
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    chatWindow.appendChild(indicator);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

function displaySuggestionChips() {
    const chipsContainer = document.getElementById('suggestion-chips-container');
    chipsContainer.innerHTML = '';
    suggestionChipsData.forEach(chipData => {
        const chip = document.createElement('button');
        chip.className = 'suggestion-chip';
        chip.textContent = chipData[currentLang];
        chip.addEventListener('click', () => {
            handleUserInput(chipData[currentLang]);
        });
        chipsContainer.appendChild(chip);
    });
}

function hideSuggestionChips() {
    const chipsContainer = document.getElementById('suggestion-chips-container');
    chipsContainer.innerHTML = '';
}

function displaySourceContext(context) {
    const infoContentDiv = document.getElementById('info-content');
    const sdkDemos = document.getElementById('sdk-demos');
    
    if (context && context.text_chunk) {
        sdkDemos.style.display = 'flex';
        infoContentDiv.innerHTML = `
            <h4 data-key="source_header">${translations.source_header[currentLang]}</h4>
            <p><strong><span data-key="source_file">${translations.source_file[currentLang]}</span>:</strong> ${context.filename}</p>
            <blockquote>${context.text_chunk}</blockquote>
        `;
    } else {
        sdkDemos.style.display = 'none';
        infoContentDiv.innerHTML = `<p>${translations.no_source_text[currentLang]}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const sendButton = document.getElementById('send-btn');
    const inputField = document.getElementById('user-input');
    const summarizeButton = document.getElementById('summarize-btn');
    const translateButton = document.getElementById('translate-btn');
    const infoContentDiv = document.getElementById('info-content');

    setLanguage(currentLang);

    if (sendButton && inputField) {
        sendButton.addEventListener('click', () => handleUserInput());
        inputField.addEventListener('keypress', (e) => e.key === 'Enter' && handleUserInput());
    }
    
    document.getElementById('lang-pl').addEventListener('click', () => setLanguage('pl'));
    document.getElementById('lang-en').addEventListener('click', () => setLanguage('en'));

    if (summarizeButton) {
        summarizeButton.addEventListener('click', async () => {
            const blockquote = infoContentDiv.querySelector('blockquote');
            if (!blockquote || !blockquote.innerText) {
                infoContentDiv.innerHTML += "<p style='color: #ffcc00;'>Nie ma źródła do podsumowania.</p>";
                return;
            }
            const textToSummarize = blockquote.innerText;
            infoContentDiv.innerHTML = "<p>Przygotowuję streszczenie...</p>";
            
            try {
                const response = await fetch('/api/summarize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textToSummarize })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                infoContentDiv.innerHTML = `<h4>Streszczenie:</h4><p>${data.summary}</p>`;
            } catch (error) {
                infoContentDiv.innerHTML = `<p style="color: red;">Błąd: ${error.message}</p>`;
            }
        });
    }

    if (translateButton) {
        translateButton.addEventListener('click', async () => {
            const blockquote = infoContentDiv.querySelector('blockquote');
            if (!blockquote || !blockquote.innerText) {
                infoContentDiv.innerHTML += "<p style='color: #ffcc00;'>Nie ma źródła do przetłumaczenia.</p>";
                return;
            }
            const textToTranslate = blockquote.innerText;
            infoContentDiv.innerHTML = "<p>Tłumaczę na angielski...</p>";

            try {
                const response = await fetch('/api/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textToTranslate })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                infoContentDiv.innerHTML = `<h4>Tłumaczenie (EN):</h4><p>${data.translatedText}</p>`;
            } catch (error) {
                infoContentDiv.innerHTML = `<p style="color: red;">Błąd: ${error.message}</p>`;
            }
        });
    }
});