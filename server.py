from flask import Flask, request, send_file, jsonify
from gtts import gTTS
import os
import io

app = Flask(__name__)

@app.route('/')
def index():
    return jsonify({"status": "CinoCode TTS Sunucusu çalışıyor! 🎙️"})

@app.route('/api/tts')
def tts():
    text = request.args.get('text', '').strip()
    voice = request.args.get('voice', 'female_gtts')
    if not text:
        return "No text", 400

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
