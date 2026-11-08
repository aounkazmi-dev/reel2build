# Reel2Build

Reel2Build turns a project demo in an Instagram Reel or MP4 into a short analysis and a step-by-step build roadmap. It separates what the video shows from details the viewer needs to confirm.

[**Try Reel2Build live**](https://reel2build.onrender.com)

Paste a public Instagram Reel link or upload an MP4, then select **Analyze video**. If Reel2Build detects a project demo, select **Generate build roadmap** to get step-by-step instructions. The first visit after inactivity can take about a minute while the free Render service wakes up.

## Run locally

The project was tested with Python 3.13 and Node.js 22. The following commands use PowerShell.

In one terminal, install the backend dependencies from the repository root:

~~~powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
~~~

Create a file named **backend/.env** and add your [Groq API key](https://console.groq.com/keys):

~~~dotenv
GROQ_API_KEY=your_key_here
~~~

Start the backend from the **backend** directory:

~~~powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
~~~

In another terminal, start the frontend from the repository root:

~~~powershell
cd frontend
npm ci
npm run dev
~~~

Open [Reel2Build](http://127.0.0.1:5173/). FastAPI exposes [interactive API docs](http://127.0.0.1:8000/docs).

## Deploy on Render

Create a Docker web service from the `main` branch with the repository root as its build context. The Dockerfile builds React and serves it from FastAPI on the same URL. Use `/health` for the health check.

Set `GROQ_API_KEY` to your Groq key under the service's **Environment** settings. On the free plan, local uploads and cached results are cleared when the service restarts.

## How it works

1. **Import video** downloads a public Instagram Reel with yt-dlp or accepts an uploaded MP4. The app accepts videos up to 50 MB and three minutes. MP4 upload is the fallback when Instagram blocks downloads.
2. **Analyze video** runs the LangGraph workflow. FFmpeg samples frames locally, Whisper Large V3 Turbo transcribes available audio through Groq, and Qwen3.8-27B analyzes the frames and transcript. The result shows a classification, timestamped observations, and uncertainties.
3. **Generate build roadmap** appears for project demos. GPT-OSS 20B on Groq receives the analysis as text and returns assumptions, build steps, and a check for each step.

~~~mermaid
flowchart TD
    I["Instagram link or MP4"] --> A["Analyze video"]
    subgraph LG["LangGraph"]
        F["Extract frames locally"] --> T["Transcribe audio when available"]
        T --> V["Describe frames and speech"]
    end
    A --> F
    V --> D{"Project demo?"}
    D -->|Yes| R["Generate roadmap on request"]
    D -->|Other or unclear| S["Show analysis"]
~~~

A fresh analysis uses up to two model requests, and a new roadmap uses one. Results are cached locally, so matching completed requests reuse the saved results. The backend keeps imported videos and cached outputs in **backend/data/**, which Git ignores along with **backend/.env**.

With only **HF_TOKEN** set, the app uses Qwen3.5-35B-A3B through Hugging Face Inference Providers for frame analysis and roadmap generation. That route requires inference credits and skips speech transcription.

## Code map

- [React UI](frontend/src/App.jsx) and [Vite API proxy](frontend/vite.config.js)
- [FastAPI endpoints](backend/main.py) and [video ingestion](backend/media.py)
- [LangGraph, model requests, and roadmap generation](backend/analysis.py)
- [Local result cache](backend/result_cache.py)
