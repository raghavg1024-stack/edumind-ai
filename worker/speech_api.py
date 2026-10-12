"""A private prerecorded-audio API. Run on localhost or a private worker network."""
import os
import tempfile
import threading
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from faster_whisper import WhisperModel

model = None
lock = threading.Lock()

@asynccontextmanager
async def lifespan(app):
    global model
    if os.getenv('SPEECH_HOST', '127.0.0.1') not in ('127.0.0.1', 'localhost') and not os.getenv('STT_API_KEY'):
        raise RuntimeError('Set STT_API_KEY before exposing the speech service beyond localhost.')
    model = WhisperModel(os.getenv('WHISPER_MODEL', 'tiny.en'), device='cpu', compute_type='int8',
                         cpu_threads=int(os.getenv('WHISPER_THREADS', '4')),
                         download_root=os.getenv('WHISPER_CACHE', './work/whisper-models'))
    yield

app = FastAPI(lifespan=lifespan)

@app.get('/health')
def health():
    return {'ready': model is not None, 'model': os.getenv('WHISPER_MODEL', 'tiny.en')}

@app.post('/transcribe')
def transcribe(file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    key = os.getenv('STT_API_KEY')
    if key and authorization != f'Bearer {key}':
        raise HTTPException(401, 'Invalid speech API credential.')
    if model is None:
        raise HTTPException(503, 'Speech model is loading.')
    if not lock.acquire(blocking=False):
        raise HTTPException(429, 'Speech worker is busy. Retry this job shortly.')
    try:
        with tempfile.TemporaryDirectory(prefix='edumind-speech-') as folder:
            path = Path(folder) / 'audio.wav'
            size = 0
            with path.open('wb') as target:
                while data := file.file.read(1024 * 1024):
                    size += len(data)
                    if size > 125_000_000:
                        raise HTTPException(413, 'Audio too large.')
                    target.write(data)
            # No initial prompt: recognition must come from audio, never from lecture titles.
            raw, info = model.transcribe(str(path), beam_size=5, word_timestamps=True, vad_filter=True)
            if info.duration <= 0 or info.duration > 3600:
                raise HTTPException(400, 'Automatic transcription supports up to one hour.')
            segments = []
            for segment in raw:
                sentence = []
                for word in segment.words or []:
                    if word.end <= word.start:
                        continue
                    sentence.append(word)
                    if word.word.rstrip().endswith(('.', '?', '!')) or len(sentence) >= 35:
                        segments.append({'start': sentence[0].start, 'end': sentence[-1].end,
                                         'text': ''.join(w.word for w in sentence).strip()})
                        sentence = []
                if sentence:
                    segments.append({'start': sentence[0].start, 'end': sentence[-1].end,
                                     'text': ''.join(w.word for w in sentence).strip()})
            if not segments:
                raise HTTPException(400, 'No speech detected in this audio.')
            return {'segments': segments, 'language': info.language, 'duration': info.duration}
    finally:
        lock.release()

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host=os.getenv('SPEECH_HOST', '127.0.0.1'), port=int(os.getenv('SPEECH_PORT', '8787')))
