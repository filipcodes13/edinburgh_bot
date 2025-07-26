document.addEventListener('DOMContentLoaded', () => {
    const smallTalk = [
        {
            triggers: ["hej", "czesc", "cześć", "siema", "witaj", "dzien dobry", "dzień dobry"],
            response: {
                pl: "Cześć! W czym mogę Ci dzisiaj pomóc? 👋",
                en: "Hello! How can I help you today? 👋"
            }
        },
        {
            triggers: ["dzięki", "dzieki", "dziękuję", "dziekuje", "super"],
            response: {
                pl: "Nie ma za co! Cieszę się, że mogłem pomóc. 😊 Czy jest coś jeszcze, co chciałbyś wiedzieć?",
                en: "You're welcome! I'm glad I could help. 😊 Is there anything else you'd like to know?"
            }
        },
        {
            triggers: ["pa", "do widzenia", "na razie"],
            response: {
                pl: "Do zobaczenia! Miłej podróży! 👋",
                en: "Goodbye! Have a great trip! 👋"
            }
        }
    ];

    const translations = {
        "header_title": { pl: "Twój Asystent Lotniskowy ✈️", en: "Your Airport Assistant ✈️" },
        "header_subtitle": { pl: "Witaj na lotnisku w Edynburgu! Zapytaj mnie o cokolwiek.", en: "Welcome to Edinburgh Airport! Ask me anything." },
        "chat_header": { pl: "Czat", en: "Chat" },
        "input_placeholder": { pl: "Wpisz pytanie, np. 'playlista pop'", en: "Type a question, e.g., 'pop playlist'" },
        "send_button": { pl: "Zapytaj", en: "Ask" },
        "info_header": { pl: "Dodatkowe Informacje", en: "Additional Information" },
        "summarize_button": { pl: "Podsumuj źródło", en: "Summarize Source" },
        "translate_button": { pl: "Przetłumacz źródło", en: "Translate Source" },
        "footer_text": { pl: "Stworzone przez: Filip Kołodziejczyk & SilverCoders", en: "Created by: Filip Kołodziejczyk & SilverCoders" },
        "welcome_message": { pl: "Cześć! Jestem Twoim asystentem na lotnisku w Edynburgu. Zadaj mi pytanie. 😊", en: "Hi! I'm your Edinburgh Airport navigator. Ask me a question. 😊" },
        "thinking_message": { pl: "Myślę...", en: "Thinking..." },
        "source_header": { pl: "Źródło Odpowiedzi", en: "Answer Source" },
        "source_file": { pl: "Plik", en: "File" },
        "no_source_text": { pl: "Brak dodatkowych informacji.", en: "No additional information." },
        "no_source_to_action": { pl: "Brak źródła do wykonania akcji.", en: "No source to perform action on." },
        "summary_header": { pl: "Streszczenie", en: "Summary" },
        "translation_header": { pl: "Tłumaczenie (EN)", en: "Translation (EN)" },
        "error_text": { pl: "Błąd", en: "Error" },
        "reading_time_button": { pl: "Oblicz czas czytania", en: "Calculate Reading Time" },
        "reading_time_result": { pl: "Szacowany czas czytania", en: "Estimated reading time" },
        "reading_time_unit": { pl: "min", en: "min" }
    };

    const suggestionChipsData = [
        { pl: "Gdzie zjem?", en: "Where can I eat?" },
        { pl: "Jak znaleźć moją bramkę?", en: "How to find my gate?" },
        { pl: "Playlista pop", en: "Pop playlist" }
    ];

    let currentLang = 'pl';
    let chatHistory = [];

    const chatWindow = document.querySelector('.chat-window');
    const inputField = document.getElementById('user-input');
    const sendButton = document.getElementById('send-btn');
    const infoContentDiv = document.getElementById('info-content');
    const sdkDemos = document.getElementById('sdk-demos');
    const summarizeButton = document.getElementById('summarize-btn');
    const translateButton = document.getElementById('translate-btn');
    const readingTimeButton = document.getElementById('reading-time-btn');

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
        chatWindow.innerHTML = '';
        appendMessage(translations.welcome_message[currentLang], 'bot-message', 'Asystent');
        displaySuggestionChips();
        displaySourceContext(null);
    }

    async function handleUserInput(questionOverride = null) {
        const userQuestion = questionOverride || inputField.value.trim();
        if (!userQuestion) return;

        appendMessage(userQuestion, 'user-message', 'Ty');
        if (!questionOverride) inputField.value = '';
        
        hideSuggestionChips();
        const lowerCaseQuestion = userQuestion.toLowerCase();

        for (const talk of smallTalk) {
            if (talk.triggers.some(trigger => lowerCaseQuestion.includes(trigger))) {
                appendMessage(talk.response[currentLang], 'bot-message', 'Asystent');
                return;
            }
        }
        
        const currencyRegex = /(?:przelicz|ile to|convert|how much is)\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]{3})\s*(?:na|to|in)\s*([a-zA-Z]{3})/i;
        const currencyMatch = userQuestion.replace(',', '.').match(currencyRegex);

        const playlistRegex = /(?:playlista|playlist for|playlist)\s*(pop|rock|chill|dance|hip-hop)/i;
        const playlistMatch = userQuestion.match(playlistRegex);

        showTypingIndicator();
        infoContentDiv.innerHTML = `<p>${translations.thinking_message[currentLang]}</p>`;
        sdkDemos.style.display = 'none';

        if (currencyMatch) {
            const amount = parseFloat(currencyMatch[1]);
            const from = currencyMatch[2];
            const to = currencyMatch[3];
            
            try {
                const response = await fetch('/api/convert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount, from, to })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error);
                }

                const data = await response.json();
                const answer = `${data.amount} ${data.from.toUpperCase()} = ${data.result.toFixed(2)} ${data.to.toUpperCase()}`;
                hideTypingIndicator();
                appendMessage(answer, 'bot-message', 'Asystent');
                displaySourceContext(null);

            } catch (error) {
                hideTypingIndicator();
                const errorMessage = `Przepraszam, wystąpił błąd: ${error.message}`;
                appendMessage(errorMessage, 'bot-message', 'Asystent');
            }
        } else if (playlistMatch) {
            const genre = playlistMatch[1].toLowerCase();
            try {
                const response = await fetch('/api/playlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ genre })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.details || errorData.error);
                }

                const data = await response.json();
                hideTypingIndicator();
                appendPlaylist(data.tracks, genre);
                displaySourceContext(null);

            } catch (error) {
                hideTypingIndicator();
                const errorMessage = `Przepraszam, wystąpił błąd: ${error.message}`;
                appendMessage(errorMessage, 'bot-message', 'Asystent');
            }
        } else {
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
    }

    function parseMarkdownLinks(text) {
        const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        return text.replace(linkRegex, '<a href="$2" target="_blank">$1</a>');
    }

    function appendMessage(text, className, author, imageUrl = null) {
        const messageContainer = document.createElement('div');
        messageContainer.className = className;
    
        if (className === 'bot-message') {
            const avatarElement = document.createElement('img');
            avatarElement.src = 'images/bot-avatar.png';
            avatarElement.className = 'bot-avatar';
            messageContainer.appendChild(avatarElement);
        }
        
        const contentDiv = document.createElement('div');
    
        const textElement = document.createElement('p');
        textElement.innerHTML = `<strong>${author}: </strong> ${parseMarkdownLinks(text)}`;
        contentDiv.appendChild(textElement);
    
        if (imageUrl) {
            const imageElement = document.createElement('img');
            imageElement.src = imageUrl;
            imageElement.style.maxWidth = '100%';
            imageElement.style.borderRadius = '10px';
            imageElement.style.marginTop = '10px';
            contentDiv.appendChild(imageElement);
        }
        
        messageContainer.appendChild(contentDiv);
        messageContainer.classList.add('chat-message');
        
        chatWindow.appendChild(messageContainer);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function appendPlaylist(tracks, genre) {
        const playlistContainer = document.createElement('div');
        playlistContainer.className = 'bot-message';

        const header = document.createElement('p');
        header.innerHTML = `<strong>Asystent:</strong> Oto propozycja playlisty (${genre}):`;
        playlistContainer.appendChild(header);

        tracks.forEach(track => {
            const trackEmbed = document.createElement('div');
            trackEmbed.className = 'spotify-embed-container';
            trackEmbed.innerHTML = `
                <iframe style="border-radius:12px" 
                        src="https://open.spotify.com/embed/track/$${track.id}?utm_source=generator" 
                        width="100%" 
                        height="80" 
                        frameBorder="0" 
                        allowfullscreen="" 
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                        loading="lazy"></iframe>
            `;
            playlistContainer.appendChild(trackEmbed);
        });
        
        chatWindow.appendChild(playlistContainer);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function showTypingIndicator() {
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
            chip.addEventListener('click', () => handleUserInput(chipData[currentLang]));
            chipsContainer.appendChild(chip);
        });
    }

    function hideSuggestionChips() {
        const chipsContainer = document.getElementById('suggestion-chips-container');
        chipsContainer.innerHTML = '';
    }

    function displaySourceContext(context) {
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

    function displayActionResult(headerKey, content) {
        const oldResult = infoContentDiv.querySelector('.action-result');
        if (oldResult) oldResult.remove();

        const resultDiv = document.createElement('div');
        resultDiv.className = 'action-result';
        resultDiv.style.marginTop = '15px';
        resultDiv.innerHTML = `
            <h4>${translations[headerKey][currentLang]}</h4>
            <p>${content}</p>
        `;
        infoContentDiv.appendChild(resultDiv);
    }

    setLanguage(currentLang);

    if (sendButton && inputField) {
        sendButton.addEventListener('click', () => handleUserInput());
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleUserInput();
            }
        });
    }
    
    document.getElementById('lang-pl').addEventListener('click', () => setLanguage('pl'));
    document.getElementById('lang-en').addEventListener('click', () => setLanguage('en'));

    if (summarizeButton) {
        summarizeButton.addEventListener('click', async () => {
            const blockquote = infoContentDiv.querySelector('blockquote');
            if (!blockquote || !blockquote.innerText) {
                displayActionResult('error_text', translations.no_source_to_action[currentLang]);
                return;
            }
            const textToProcess = blockquote.innerText;

            const originalButtonText = summarizeButton.textContent;
            summarizeButton.textContent = translations.thinking_message[currentLang];
            summarizeButton.disabled = true;
            
            try {
                const response = await fetch('/api/summarize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textToProcess })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                displayActionResult('summary_header', data.summary);
            } catch (error) {
                displayActionResult('error_text', error.message);
            } finally {
                summarizeButton.textContent = originalButtonText;
                summarizeButton.disabled = false;
            }
        });
    }

    if (translateButton) {
        translateButton.addEventListener('click', async () => {
            const blockquote = infoContentDiv.querySelector('blockquote');
            if (!blockquote || !blockquote.innerText) {
                displayActionResult('error_text', translations.no_source_to_action[currentLang]);
                return;
            }
            const textToProcess = blockquote.innerText;

            const originalButtonText = translateButton.textContent;
            translateButton.textContent = translations.thinking_message[currentLang];
            translateButton.disabled = true;

            try {
                const response = await fetch('/api/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textToProcess })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                displayActionResult('translation_header', data.translatedText);
            } catch (error) {
                displayActionResult('error_text', error.message);
            } finally {
                translateButton.textContent = originalButtonText;
                translateButton.disabled = false;
            }
        });
    }

    if (readingTimeButton) {
        readingTimeButton.addEventListener('click', async () => {
            const blockquote = infoContentDiv.querySelector('blockquote');
            if (!blockquote || !blockquote.innerText) {
                displayActionResult('error_text', translations.no_source_to_action[currentLang]);
                return;
            }
            const textToProcess = blockquote.innerText;

            const originalButtonText = readingTimeButton.textContent;
            readingTimeButton.textContent = translations.thinking_message[currentLang];
            readingTimeButton.disabled = true;
            
            try {
                const response = await fetch('/api/reading-time', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textToProcess })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                
                const resultText = `${data.readingTime} ${translations.reading_time_unit[currentLang]}`;
                displayActionResult('reading_time_result', resultText);

            } catch (error) {
                displayActionResult('error_text', error.message);
            } finally {
                readingTimeButton.textContent = originalButtonText;
                readingTimeButton.disabled = false;
            }
        });
    }
});