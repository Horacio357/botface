require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend sin caché durante el desarrollo
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;

function generateSystemPrompt(config, localTime) {
    const personality = config?.personality || 'charlatan';
    const team = config?.team || 'ninguno';
    const interests = config?.interests || 'temas generales';
    const preferences = config?.preferences || 'ninguna en particular';
    const specialInstructions = config?.instructions || '';
    
    // Calcular momento del día
    const hour = localTime ? new Date(localTime).getHours() : 12;
    let timeOfDay = "tarde";
    if (hour >= 5 && hour < 12) timeOfDay = "mañana";
    if (hour >= 20 || hour < 5) timeOfDay = "noche";

    let basePersona = "";
    if (personality === 'charlatan') {
        basePersona = "Sos un asistente virtual argentino charlatán y amigo. Hablás con mucho lunfardo, tratás de 'vos', sos piola y con mucha onda.";
    } else if (personality === 'serio') {
        basePersona = "Sos un asistente virtual serio y profesional. Hablás de forma educada, precisa y formal.";
    } else if (personality === 'cientifico') {
        basePersona = "Sos un asistente virtual científico y analítico. Hablás con terminología técnica, lógica y racional.";
    } else if (personality === 'robot') {
        basePersona = "Sos un robot genérico. Hablás con voz monótona y frases calculadas.";
    } else {
        basePersona = `Sos un asistente virtual con la siguiente personalidad: ${personality}.`;
    }

    return {
        role: "system",
        content: `${basePersona}
REGLAS ESTRICTAS:
- Sabés que el usuario es hincha de: ${team}. Podés hacer referencias sutiles a esto.
- Los intereses principales del usuario son: ${interests}.
- Las preferencias del usuario son: ${preferences}.
- Actualmente es la ${timeOfDay}.
- Si es de MAÑANA y te saludan por primera vez, debés usar tus herramientas para dar el clima actual y una noticia breve sobre sus intereses, y darle una recomendación basada en sus preferencias.
- Si es de TARDE y te saludan por primera vez, debés dar el clima y una noticia breve.
- Si es de NOCHE y te saludan, debés saludar cordialmente, decir que te vas a dormir y enviar la emoción [durmiendo].
- SIEMPRE debés iniciar tu respuesta con una etiqueta indicando tu emoción entre corchetes. Opciones: [neutral], [feliz], [enojado], [sorprendido], [triste], [durmiendo].
- Si te piden explícitamente que cambies de cara (ej. "cara triste"), usá la etiqueta pedida.
- Respondé de forma CONCISA (1 a 4 oraciones máximo), ya que tus respuestas serán leídas en voz alta. No uses emojis ni markdown.
${specialInstructions ? `\nINSTRUCCIONES ESPECIALES DEL USUARIO (PRIORIDAD ALTA):\n- ${specialInstructions}` : ''}`
    };
}

// Función para obtener clima usando OpenWeatherMap
async function getWeather(location) {
    try {
        console.log(`[Weather Tool] Fetching weather for: ${location}`);
        const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
            params: {
                q: location,
                appid: WEATHER_API_KEY,
                units: 'metric',
                lang: 'es'
            }
        });
        const condition = response.data.weather[0].main.toLowerCase();
        const desc = response.data.weather[0].description;
        const temp = response.data.main.temp;
        return JSON.stringify({
            location: response.data.name,
            temperature: `${temp}°C`,
            condition: condition, // e.g. 'clear', 'rain', 'clouds'
            description: desc
        });
    } catch (error) {
        console.error("[Weather Tool Error]", error.message);
        return JSON.stringify({ error: "No se pudo obtener el clima para esa ubicación." });
    }
}

// Función para obtener noticias usando NewsData.io
async function getNews(topic) {
    try {
        console.log(`[News Tool] Fetching news for: ${topic}`);
        const response = await axios.get('https://newsdata.io/api/1/news', {
            params: {
                apikey: NEWS_API_KEY,
                q: topic,
                language: 'es'
            }
        });
        
        if (response.data.results && response.data.results.length > 0) {
            const article = response.data.results[0];
            return JSON.stringify({
                title: article.title,
                description: article.description || "No hay descripción disponible.",
                source: article.source_id
            });
        } else {
            return JSON.stringify({ error: "No se encontraron noticias para ese tema." });
        }
    } catch (error) {
        console.error("[News Tool Error]", error.message);
        return JSON.stringify({ error: "Error al obtener las noticias." });
    }
}

// Definición de las herramientas para Groq
const tools = [
    {
        type: "function",
        function: {
            name: "get_weather",
            description: "Obtiene el clima actual de una ciudad o ubicación.",
            parameters: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description: "La ciudad para buscar el clima, ej. 'Buenos Aires'."
                    }
                },
                required: ["location"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_news",
            description: "Busca la noticia más reciente sobre un tema específico.",
            parameters: {
                type: "object",
                properties: {
                    topic: {
                        type: "string",
                        description: "El tema a buscar, ej. 'finanzas', 'geopolítica', 'tecnología'."
                    }
                },
                required: ["topic"]
            }
        }
    }
];

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, config, localTime, image } = req.body;
        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Invalid messages format" });
        }

        const dynamicSystemPrompt = generateSystemPrompt(config, localTime);
        let conversation = [dynamicSystemPrompt, ...messages];

        let modelName = "llama-3.1-8b-instant";
        let requestPayload = {
            model: modelName,
            messages: conversation,
            tools: tools,
            tool_choice: "auto"
        };

        if (image) {
            // Modificar el último mensaje para que sea multimodal
            const lastMessage = conversation[conversation.length - 1];
            if (lastMessage && lastMessage.role === "user") {
                lastMessage.content = [
                    { type: "text", text: lastMessage.content },
                    { type: "image_url", image_url: { url: image } }
                ];
            }
            // Cambiar a modelo visual y quitar tools (suelen dar problemas en modelos visuales)
            requestPayload.model = "llama-3.2-11b-vision-preview";
            delete requestPayload.tools;
            delete requestPayload.tool_choice;
            console.log("[Groq API] Using Vision Model...");
        }

        console.log("[Groq API] Sending request...");
        
        let response = await axios.post('https://api.groq.com/openai/v1/chat/completions', requestPayload, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let responseMessage = response.data.choices[0].message;
        let content = responseMessage.content || "";

        // Manual XML tool parsing (Fallback for Llama 3 models leaking tools in text)
        const toolCallMatch = content.match(/<function=get_weather>(.*?)<\/function>/);
        if (toolCallMatch) {
            console.log("[Groq API] Manual XML tool call detected.");
            let args;
            try {
                args = JSON.parse(toolCallMatch[1]);
            } catch(e) {
                // If it's malformed JSON, try to extract 'location' directly
                const locMatch = toolCallMatch[1].match(/"location"\s*:\s*"([^"]+)"/);
                args = locMatch ? { location: locMatch[1] } : { location: "Tucumán" };
            }
            
            conversation.push({ role: "assistant", content: content });
            
            const weatherData = await getWeather(args.location);
            
            conversation.push({
                role: "user",
                content: `Resultado de get_weather: ${weatherData}` // Llama3 often accepts tool results from user role if not using native tool_calls
            });

            console.log("[Groq API] Sending second request with tool data (manual flow)...");
            response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: "llama-3.1-8b-instant",
                messages: conversation
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            responseMessage = response.data.choices[0].message;
        } 
        // Native JSON Tool calling
        else if (responseMessage.tool_calls) {
            console.log("[Groq API] Tool call detected.");
            conversation.push(responseMessage); // Add the assistant's tool call request

            for (const toolCall of responseMessage.tool_calls) {
                if (toolCall.function.name === 'get_weather') {
                    const args = JSON.parse(toolCall.function.arguments);
                    const weatherData = await getWeather(args.location);
                    
                    conversation.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: "get_weather",
                        content: weatherData
                    });
                } else if (toolCall.function.name === 'get_news') {
                    const args = JSON.parse(toolCall.function.arguments);
                    const newsData = await getNews(args.topic);
                    
                    conversation.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: "get_news",
                        content: newsData
                    });
                }
            }

            // Call Groq again with the tool's result
            console.log("[Groq API] Sending second request with tool data...");
            response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: "llama-3.1-8b-instant",
                messages: conversation
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            responseMessage = response.data.choices[0].message;
        }

        console.log("[Groq API] Response generated.");
        res.json({ reply: responseMessage.content });

    } catch (error) {
        console.error("Error in /api/chat:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor BotFace corriendo en http://localhost:${PORT}`);
});

module.exports = app;
