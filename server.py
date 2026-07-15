from collections import deque
from flask import Flask, request, send_file, jsonify
import asyncio
import base64
import io
import os
import threading
import time

import requests
from dotenv import load_dotenv


load_dotenv()

app = Flask(__name__)

GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
MAX_TTS_TEXT_LENGTH = 5000
MAX_REQUEST_BYTES = 16 * 1024
RATE_LIMIT_REQUESTS = 60
RATE_LIMIT_WINDOW_SECONDS = 60

EDGE_VOICE_MAP = {
    'edge_female': ('tr-TR-EmelNeural', '+0Hz', '+0%'),
    'edge_male': ('tr-TR-AhmetNeural', '+0Hz', '+0%'),
    'edge_tolga': ('tr-TR-AhmetNeural', '-4Hz', '-10%'),
}

EDGE_TO_GOOGLE_FALLBACK = {
    'edge_female': 'female_gtts',
    'edge_male': 'male_gtts',
    'edge_tolga': 'male_wavenet_d',
}

GOOGLE_VOICE_CONFIG = {
    'female_gtts': {
        'languageCode': 'tr-TR',
        'name': 'tr-TR-Wavenet-D',
        'ssmlGender': 'FEMALE'
    },
    'male_gtts': {
        'languageCode': 'tr-TR',
        'name': 'tr-TR-Wavenet-B',
        'ssmlGender': 'MALE'
    },
    'male_local': {
        'languageCode': 'tr-TR',
        'name': 'tr-TR-Standard-B',
        'ssmlGender': 'MALE'
    },
    'male_wavenet_d': {
        'languageCode': 'tr-TR',
        'name': 'tr-TR-Wavenet-E',
        'ssmlGender': 'MALE'
    },
    'female_gtts2': {
        'languageCode': 'tr-TR',
        'name': 'tr-TR-Wavenet-A',
        'ssmlGender': 'FEMALE'
    }
}

VOICE_AUDIO_CONFIG = {
    'male_wavenet_d': {"audioEncoding": "MP3", "speakingRate": 0.9, "pitch": -4.0},
    'female_gtts2': {"audioEncoding": "MP3", "speakingRate": 1.0, "pitch": 4.0},
    'female_gtts': {"audioEncoding": "MP3", "speakingRate": 1.0, "pitch": 0.0}
}

ALLOWED_VOICES = set(EDGE_VOICE_MAP) | set(GOOGLE_VOICE_CONFIG)
LOCAL_ALLOWED_ORIGINS = {
    'http://localhost:8000',
    'http://127.0.0.1:8000',
}

_rate_buckets = {}
_rate_lock = threading.Lock()


def configured_origins():
    configured = {
        value.strip().rstrip('/')
        for value in os.environ.get('CINOCODE_ALLOWED_ORIGINS', '').split(',')
        if value.strip()
    }
    return LOCAL_ALLOWED_ORIGINS | configured


def is_origin_allowed(origin):
    return not origin or origin.rstrip('/') in configured_origins()


def is_rate_limited(client_ip):
    if not client_ip:
        return False
    now = time.monotonic()
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    with _rate_lock:
        bucket = _rate_buckets.setdefault(client_ip, deque())
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_REQUESTS:
            return True
        bucket.append(now)
        return False


def google_tts(text, voice_key, api_key):
    voice_cfg = GOOGLE_VOICE_CONFIG.get(voice_key, GOOGLE_VOICE_CONFIG['female_gtts'])
    audio_cfg = VOICE_AUDIO_CONFIG.get(
        voice_key,
        {"audioEncoding": "MP3", "speakingRate": 1.0, "pitch": 0.0}
    )
    payload = {
        "input": {"text": text},
        "voice": voice_cfg,
        "audioConfig": audio_cfg
    }
    response = requests.post(f"{GOOGLE_TTS_URL}?key={api_key}", json=payload, timeout=15)
    response.raise_for_status()
    return base64.b64decode(response.json()['audioContent'])


async def edge_tts_async(text, voice, pitch, rate):
    import edge_tts
    buffer = io.BytesIO()
    communicate = edge_tts.Communicate(text, voice, pitch=pitch, rate=rate)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buffer.write(chunk["data"])
    buffer.seek(0)
    return buffer.read()


def mp3_response(audio_data):
    return send_file(
        io.BytesIO(audio_data),
        mimetype="audio/mpeg",
        as_attachment=False,
        download_name="speech.mp3"
    )


@app.before_request
def protect_request():
    origin = request.headers.get('Origin', '')
    if not is_origin_allowed(origin):
        return jsonify({"ok": False, "error": "origin_not_allowed"}), 403

    if request.content_length and request.content_length > MAX_REQUEST_BYTES:
        return jsonify({"ok": False, "error": "request_too_large"}), 413

    if request.path == '/api/tts' and request.method != 'OPTIONS':
        forwarded_ip = request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
        if is_rate_limited(forwarded_ip or request.remote_addr):
            response = jsonify({"ok": False, "error": "rate_limited"})
            response.status_code = 429
            response.headers['Retry-After'] = str(RATE_LIMIT_WINDOW_SECONDS)
            return response

    if request.method == 'OPTIONS':
        return '', 204

    return None


@app.route('/')
def index():
    return jsonify({"status": "CinoCode TTS Sunucusu çalışıyor!"})


@app.route('/api/tts', methods=['GET', 'POST', 'OPTIONS'])
def tts():
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
        text = str(payload.get('text', '')).strip()
        voice = str(payload.get('voice', 'female_gtts')).strip()
    else:
        text = request.args.get('text', '').strip()
        voice = request.args.get('voice', 'female_gtts').strip()

    if not text:
        return jsonify({"ok": False, "error": "missing_text"}), 400
    if len(text) > MAX_TTS_TEXT_LENGTH:
        return jsonify({"ok": False, "error": "text_too_long"}), 413
    if voice not in ALLOWED_VOICES:
        return jsonify({"ok": False, "error": "invalid_voice"}), 400

    api_key = os.environ.get('GOOGLE_TTS_KEY', '').strip()

    if voice in EDGE_VOICE_MAP:
        edge_voice, pitch, rate = EDGE_VOICE_MAP[voice]
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            audio_data = loop.run_until_complete(edge_tts_async(text, edge_voice, pitch, rate))
            if not audio_data:
                raise RuntimeError("Edge TTS boş veri")
            return mp3_response(audio_data)
        except Exception as edge_error:
            app.logger.warning("Edge TTS failed for %s: %s", voice, edge_error)
            if not api_key:
                return jsonify({"ok": False, "error": "tts_provider_failed"}), 502
            fallback_voice = EDGE_TO_GOOGLE_FALLBACK.get(voice, 'female_gtts')
            try:
                return mp3_response(google_tts(text, fallback_voice, api_key))
            except Exception as google_error:
                app.logger.error("Google TTS fallback failed: %s", google_error)
                return jsonify({"ok": False, "error": "tts_provider_failed"}), 502
        finally:
            loop.close()

    if not api_key:
        return jsonify({"ok": False, "error": "tts_not_configured"}), 503

    try:
        return mp3_response(google_tts(text, voice, api_key))
    except Exception as error:
        app.logger.error("Google TTS failed for %s: %s", voice, error)
        return jsonify({"ok": False, "error": "tts_provider_failed"}), 502


@app.after_request
def add_security_headers(response):
    origin = request.headers.get('Origin', '')
    if origin and is_origin_allowed(origin):
        response.headers['Access-Control-Allow-Origin'] = origin.rstrip('/')
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    response.headers['Vary'] = 'Origin'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8001))
    default_host = '0.0.0.0' if os.environ.get('RENDER') else '127.0.0.1'
    host = os.environ.get('HOST', default_host)
    app.run(host=host, port=port)
