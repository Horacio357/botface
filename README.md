# BotFace - Tu Asistente Virtual Personalizado

BotFace es un asistente virtual/PWA con rostro, emociones, voz y visión artificial, diseñado para correr rápido y ser totalmente personalizable.

## Características Principales

* **Interacción por Voz:** Reconocimiento y síntesis de voz usando Web Speech API.
* **Visión Artificial:** Capacidad de "ver" a través de la cámara de tu dispositivo usando LLMs multimodales.
* **Rutinas Dinámicas:** Consciente de la hora del día para darte reportes de clima y noticias.
* **Personalización Total:** Define su personalidad, tu equipo de fútbol, tus intereses y preferencias.
* **Privacidad Primero:** Todo el historial de conversación y la configuración se guardan de forma local en tu navegador (`localStorage`). No usa bases de datos externas.

## Tecnologías

* **Frontend:** HTML5, CSS (Vanilla), JavaScript, PWA (Progressive Web App).
* **Backend:** Node.js, Express.
* **IA / Cerebro:** Groq API (`llama-3.1-8b-instant` para texto veloz y `llama-3.2-11b-vision-preview` para visión).

## Instalación Local

1. Clona este repositorio:
   ```bash
   git clone https://github.com/tu-usuario/botface.git
   cd botface
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura las Variables de Entorno:
   Crea un archivo llamado `.env` en la raíz del proyecto basándote en el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```
   Abre el archivo `.env` y coloca tus propias API Keys (Groq, OpenWeather y NewsData).

4. Inicia el servidor:
   ```bash
   node server.js
   ```

5. Abre tu navegador en `http://localhost:3000`.

## Despliegue en Vercel

El proyecto está configurado con un archivo `vercel.json` para ser desplegado fácilmente en Vercel como *Serverless Function*. Solo asegúrate de agregar las Variables de Entorno (`GROQ_API_KEY`, `WEATHER_API_KEY`, `NEWS_API_KEY`) en el panel de configuración de Vercel antes de desplegar.
