# Startup Copilot backend (FastAPI). Build from backend/: docker build -t startup-copilot-backend .
FROM python:3.12-slim

WORKDIR /app

# Install system deps for pgvector (optional at runtime if DATABASE_URL set) and ffmpeg (pitch reel)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/
COPY data/ data/

# Optional: copy .env.example only (do not bundle .env with secrets)
# ENV vars should be set at runtime by the platform (Railway, Render, App Runner, etc.)

EXPOSE 8000
# Use PORT so Render (and other hosts) can inject it; default 8000 for local runs
ENV PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
