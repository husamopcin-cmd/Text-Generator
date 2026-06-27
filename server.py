from flask import Flask, request, send_file, jsonify
import requests
import os
import io
import base64
import asyncio

app = Flask(__name__)

GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"

EDGE_VOICE_MAP = {
    'edge_female': ('tr-TR-EmelNeural', '+0Hz', '+0%'),
    'edge_male':   ('tr-TR-AhmetNeural', '+0Hz', '+0%'),
    'edge_tolga':  ('tr-TR-AhmetNeural', '-4Hz', '-10%'),
}

# Edge ses -> Google fallback mapping (cloud ortamında edge_tts 403 verirse)
EDGE_TO_GOOGLE_FALLBACK = {
    'edge_female': 'female_gtts',
    'edge_male':   'male_gtts',
    'edge_tolga':  'male_wavenet_d',
}

GOOGLE_VOICE_CONFIG = {
    'female_gtts': {
        'languageCode': 'tr-TR',
        'name': 'tr-TR-Wavenet-E',
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
        'name': 'tr-TR-Wavenet-D',
        'ssmlGender': 'MALE'
    }
}


def google_tts(text, voice_key, api_key):
    voice_cfg = GOOGLE_VOICE_CONFIG.get(voice_key, GOOGLE_VOICE_CONFIG['female_gtts'])
    payload = {
        "input": {"text": text},
        "voice": voice_cfg,
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": 1.0, "pitch": 0.0}
    }
    resp = requests.post(f"{GOOGLE_TTS_URL}?key={api_key}", json=payload, timeout=15)
    resp.raise_for_status()
    return base64.b64decode(resp.json()['audioContent'])


async def edge_tts_async(text, voice, pitch, rate):
    import edge_tts
    buf = io.BytesIO()
    communicate = edge_tts.Communicate(text, voice, pitch=pitch, rate=rate)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    buf.seek(0)
    return buf.read()


def mp3_response(audio_data):
    return send_file(
        io.BytesIO(audio_data),
        mimetype="audio/mpeg",
        as_attachment=False,
        download_name="speech.mp3"
    )


@app.route('/')
def index():
    return jsonify({"status": "CinoCode TTS Sunucusu çalışıyor!"})


@app.route('/api/tts')
def tts():
    text = request.args.get('text', '').strip()
    voice = request.args.get('voice', 'female_gtts')
    api_key = os.environ.get('GOOGLE_TTS_KEY', '')

    if not text:
        return "No text", 400
    if not api_key:
        return "API key eksik", 500

    if voice in EDGE_VOICE_MAP:
        edge_voice, pitch, rate = EDGE_VOICE_MAP[voice]
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            audio_data = loop.run_until_complete(edge_tts_async(text, edge_voice, pitch, rate))
            loop.close()
            if not audio_data:
                raise Exception("Edge TTS boş veri")
            return mp3_response(audio_data)
        except Exception as e:
            print(f"Edge TTS hata ({voice}), Google fallback: {e}")
            fallback_voice = EDGE_TO_GOOGLE_FALLBACK.get(voice, 'female_gtts')
            try:
                return mp3_response(google_tts(text, fallback_voice, api_key))
            except Exception as e2:
                print(f"Google fallback hata: {e2}")
                return str(e2), 500

    try:
        return mp3_response(google_tts(text, voice, api_key))
    except Exception as e:
        print(f"Google TTS hata: {e}")
        return str(e), 500


@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    return response


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8001))
    app.run(host='0.0.0.0', port=port)
