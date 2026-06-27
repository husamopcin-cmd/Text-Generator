from flask import Flask, request, send_file, jsonify
import requests
import os
import io
import base64

app = Flask(__name__)

GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"

# Ses konfigürasyonları
VOICE_CONFIG = {
    'female_gtts': {
        'languageCode': 'tr-TR',
        'name': 'tr-TR-Wavenet-E',
        'ssmlGender': 'FEMALE'
    },
    'edge_female': {
        'languageCode': 'tr-TR', 
        'name': 'tr-TR-Wavenet-E',
        'ssmlGender': 'FEMALE'
    },
    'male_gtts': {
        'languageCode': 'tr-TR',
        'name': 'tr-TR-Wavenet-B',
        'ssmlGender': 'MALE'
    },
    'edge_male_tolga': {
        'languageCode': 'tr-TR',
        'name': 'tr-TR-Wavenet-B', 
        'ssmlGender': 'MALE'
    },
    'male_local': {
        'languageCode': 'tr-TR',
        'name': 'tr-TR-Standard-B',
        'ssmlGender': 'MALE'
    }
}

@app.route('/')
def index():
    return jsonify({"status": "CinoCode TTS Sunucusu çalışıyor! 🎙️"})

@app.route('/api/tts')
def tts():
    text = request.args.get('text', '').strip()
    voice = request.args.get('voice', 'female_gtts')
    api_key = os.environ.get('GOOGLE_TTS_KEY', '')
    
    if not text:
        return "No text", 400
    
    if not api_key:
        return "API key eksik", 500

    voice_cfg = VOICE_CONFIG.get(voice, VOICE_CONFIG['female_gtts'])
    
    payload = {
        "input": {"text": text},
        "voice": voice_cfg,
        "audioConfig": {
            "audioEncoding": "MP3",
            "speakingRate": 1.0,
            "pitch": 0.0
        }
    }
    
    # Tolga için pitch ayarı
    if voice == 'edge_male_tolga':
        payload["audioConfig"]["pitch"] = -4.0
        payload["audioConfig"]["speakingRate"] = 0.9

    try:
        resp = requests.post(
            f"{GOOGLE_TTS_URL}?key={api_key}",
            json=payload,
            timeout=15
        )
        resp.raise_for_status()
        audio_b64 = resp.json()['audioContent']
        audio_data = base64.b64decode(audio_b64)
        return send_file(
            io.BytesIO(audio_data),
            mimetype="audio/mpeg",
            as_attachment=False,
            download_name="speech.mp3"
        )
    except Exception as e:
        print("TTS Error:", e)
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
