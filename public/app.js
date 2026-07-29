const face = document.getElementById('face');
const micBtn = document.getElementById('micBtn');
const statusIndicator = document.getElementById('statusIndicator');
const transcriptBox = document.getElementById('transcriptBox');
const settingsBtn = document.getElementById('settingsBtn');
const setupModal = document.getElementById('setupModal');
const saveConfigBtn = document.getElementById('saveConfigBtn');

let conversationHistory = [];
let userConfig = {};

// Load config and history
function loadConfig() {
    const savedHistory = localStorage.getItem('botface_history');
    if (savedHistory) {
        try {
            conversationHistory = JSON.parse(savedHistory);
        } catch(e) {
            console.error("Error loading history", e);
        }
    }

    const saved = localStorage.getItem('botface_config');
    if (saved) {
        userConfig = JSON.parse(saved);
        document.getElementById('configPersonality').value = userConfig.personality || 'charlatan';
        document.getElementById('configTeam').value = userConfig.team || '';
        document.getElementById('configInterests').value = userConfig.interests || '';
        document.getElementById('configPreferences').value = userConfig.preferences || '';
        document.getElementById('configInstructions').value = userConfig.instructions || '';
        // Voice will be set after voices are loaded
    } else {
        setupModal.classList.add('active');
    }
}

saveConfigBtn.addEventListener('click', () => {
    userConfig = {
        personality: document.getElementById('configPersonality').value,
        team: document.getElementById('configTeam').value,
        interests: document.getElementById('configInterests').value,
        preferences: document.getElementById('configPreferences').value,
        instructions: document.getElementById('configInstructions').value,
        voiceName: document.getElementById('configVoice').value
    };
    localStorage.setItem('botface_config', JSON.stringify(userConfig));
    setupModal.classList.remove('active');
});

settingsBtn.addEventListener('click', () => {
    setupModal.classList.add('active');
});

loadConfig();

// Configuración de Voces
let voices = [];
function populateVoiceList() {
    voices = window.speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('configVoice');
    voiceSelect.innerHTML = '';
    
    // Filtrar preferentemente voces en español
    const esVoices = voices.filter(v => v.lang.startsWith('es'));
    const displayVoices = esVoices.length > 0 ? esVoices : voices;
    
    displayVoices.forEach((voice) => {
        const option = document.createElement('option');
        option.textContent = `${voice.name} (${voice.lang})`;
        option.value = voice.name;
        voiceSelect.appendChild(option);
    });

    if (userConfig.voiceName) {
        voiceSelect.value = userConfig.voiceName;
    }
}
if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = populateVoiceList;
}

// Configuración de Reconocimiento de Voz
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'es-AR'; // Español de Argentina
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        setFaceState('listening');
        statusIndicator.innerText = "Escuchando...";
        micBtn.classList.add('active');
        transcriptBox.innerText = "...";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        transcriptBox.innerText = transcript;
        processUserMessage(transcript);
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        setFaceState('neutral');
        statusIndicator.innerText = "Error al escuchar";
        micBtn.classList.remove('active');
    };

    recognition.onend = () => {
        micBtn.classList.remove('active');
        if(statusIndicator.innerText === "Escuchando...") {
            statusIndicator.innerText = "Esperando...";
            setFaceState('neutral');
        }
    };
} else {
    statusIndicator.innerText = "Tu navegador no soporta reconocimiento de voz.";
    micBtn.style.display = 'none';
}

micBtn.addEventListener('click', () => {
    if (recognition) {
        // Stop any ongoing speech before listening again
        window.speechSynthesis.cancel();
        try {
            recognition.start();
        } catch(e) {
            console.warn("Recognition already started");
        }
    }
});

function setFaceState(state, emotion = 'neutral') {
    // states: neutral, listening, thinking, speaking
    // emotion: neutral, feliz, enojado, sorprendido
    face.className = `face ${state} ${emotion}`;
}

async function processUserMessage(text) {
    setFaceState('thinking');
    statusIndicator.innerText = "Pensando...";
    
    // Agregamos el mensaje del usuario al historial
    conversationHistory.push({ role: "user", content: text });

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                messages: conversationHistory,
                config: userConfig,
                localTime: new Date().toISOString()
            })
        });

        const data = await response.json();
        
        if (data.reply) {
            let replyText = data.reply;
            let emotion = "neutral";
            
            const match = replyText.match(/\[(.*?)\]/);
            if (match) {
                emotion = match[1].toLowerCase();
                replyText = replyText.replace(/\[.*?\]\s*/, '').trim();
            }

            // Agregamos la respuesta al historial
            conversationHistory.push({ role: "assistant", content: data.reply });
            
            // Guardamos el historial en localStorage (limitamos a 30 para no saturar memoria)
            if (conversationHistory.length > 30) {
                conversationHistory = conversationHistory.slice(conversationHistory.length - 30);
            }
            localStorage.setItem('botface_history', JSON.stringify(conversationHistory));

            speakResponse(replyText, emotion);
        } else {
            throw new Error("Respuesta vacía");
        }
    } catch (error) {
        console.error(error);
        transcriptBox.innerText = "Error de conexión.";
        setFaceState('neutral');
        statusIndicator.innerText = "Error.";
    }
}

function speakResponse(text, emotion) {
    setFaceState('speaking', emotion);
    statusIndicator.innerText = "Hablando...";
    transcriptBox.innerText = text;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-AR';
    
    if (userConfig.voiceName) {
        const selectedVoice = voices.find(v => v.name === userConfig.voiceName);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
    }

    // Un poco más rápido y agudo para darle onda
    utterance.rate = 1.1; 
    utterance.pitch = 1.0;

    utterance.onend = () => {
        setFaceState('neutral', emotion);
        statusIndicator.innerText = "Esperando...";
    };

    utterance.onerror = () => {
        setFaceState('neutral', emotion);
        statusIndicator.innerText = "Esperando...";
    };

    window.speechSynthesis.speak(utterance);
}

// Cargar voces en caso de que sean asíncronas (como en algunos navegadores)
window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
};

// Activar PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('SW registrado con éxito:', registration.scope);
        }).catch(err => {
            console.log('Fallo el registro del SW:', err);
        });
    });
}
