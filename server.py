from flask import Flask, request, send_file, jsonify
from gtts import gTTS
import os
import io
import requests

app = Flask(__name__)

@app.route('/')
def index():
    return jsonify({"status": "CinoCode TTS Sunucusu çalışıyor! 🎙️"})

def speak_azure(text, voice, api_key, region, pitch=None):
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    headers = {
        'Ocp-Apim-Subscription-Key': api_key,
        'Content-Type': 'application/ssml+xml',
        'User-Agent': 'CinoCodeTTS',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
    }
    
    if pitch:
        ssml = f"<speak version='1.0' xml:lang='tr-TR'><voice xml:lang='tr-TR' name='{voice}'><prosody pitch='{pitch}'>{text}</prosody></voice></speak>"
    else:
        ssml = f"<speak version='1.0' xml:lang='tr-TR'><voice xml:lang='tr-TR' name='{voice}'>{text}</voice></speak>"
        
    response = requests.post(url, headers=headers, data=ssml.encode('utf-8'))
    if response.status_code == 200:
        return response.content
    else:
        raise Exception(f"Azure TTS failed: {response.status_code} - {response.text}")

@app.route('/api/tts')
def tts():
    text = request.args.get('text', '').strip()
    voice = request.args.get('voice', 'female_gtts')
    api_key = request.args.get('azure_key', '').strip()
    region = request.args.get('azure_region', '').strip()
    
    if not text:
        return "No text", 400

    if api_key and region:
        try:
            azure_voice = "tr-TR-AhmetNeural"
            pitch = None
            
            if voice == 'edge_female':
                azure_voice = "tr-TR-EmelNeural"
            elif voice == 'female_gtts':
                azure_voice = "tr-TR-DilaraNeural"
            elif voice == 'edge_male_tolga':
                azure_voice = "tr-TR-AhmetNeural"
                pitch = "-15Hz"
            elif voice == 'gtts_male':
                azure_voice = "tr-TR-AhmetNeural"
                
            audio_data = speak_azure(text, azure_voice, api_key, region, pitch)
            return send_file(io.BytesIO(audio_data), mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")
        except Exception as e:
            print("Azure TTS Error, falling back to gTTS:", e)
            pass

    try:
        # Hepsi gTTS ile - edge-tts Render'da çalışmıyor (Microsoft engeli)
        lang = 'tr'
        slow = False
        
        if voice == 'edge_male_tolga':
            slow = True  # Tolga = yavaş/bas efekti
        
        tts_engine = gTTS(text=text, lang=lang, slow=slow)
        mp3_fp = io.BytesIO()
        tts_engine.write_to_fp(mp3_fp)
        mp3_fp.seek(0)
        return send_file(mp3_fp, mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")

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
