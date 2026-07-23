# backend/Dockerfile - Airgapped & Offline Ready
FROM python:3.11-slim

WORKDIR /app

# Prevent bytecode & buffer issues
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy requirements and local wheelhouse if present for offline installation
COPY requirements.txt .
COPY wheels* ./wheels/

# Install from local wheelhouse if available, or cached pip layer
RUN if [ -d "./wheels" ] && [ "$(ls -A ./wheels 2>/dev/null)" ]; then \
        pip install --no-index --find-links=./wheels -r requirements.txt ; \
    else \
        pip install --no-cache-dir -r requirements.txt ; \
    fi

# Copy backend application source code
COPY app/ /app/

EXPOSE 8000 8099

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]