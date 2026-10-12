FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/speech-requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY worker/speech_api.py ./speech_api.py
ENV SPEECH_HOST=0.0.0.0
ENV WHISPER_CACHE=/models
EXPOSE 8787
CMD ["python", "speech_api.py"]
