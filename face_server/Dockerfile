FROM python:3.11-slim

# opencv / onnxruntime need these system libs at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/face_server

# Build context is the repo root (see docker-compose.yml), so we can place
# /app/assets as a sibling of /app/face_server, matching app.py's
# `os.path.join(face_server_dir, '..', 'assets')` path logic exactly.
COPY face_server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY face_server/ .

RUN mkdir -p /app/assets

EXPOSE 5001

CMD ["python", "app.py"]
