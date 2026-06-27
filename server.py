from flask import Flask, request, send_file, jsonify
from gtts import gTTS
import edge_tts
import asyncio
import os
import io

app = Flask(__name__)

async def edge_tts_generate(text, voice, rate="+0%", pitch="+0Hz"):
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    mp3_fp = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            mp3_fp.write(chunk["data"])
    mp3_fp.seek(0)
    return mp3_fp

@app.route('/')
def index():
    return jsonify({"status": "CinoCode TTS Sunucusu çalışıyor! 🎙️"})

@app.route('/api/tts')
def tts():
    text = request.args.get('text', '').strip()
    voice = request.args.get('voice', 'gtts_male')
    if not text:
        return "No text", 400

    try:
        if voice == 'female_gtts':
            # Ayşe Abla - gTTS Google Kadın Sesi
            tts_engine = gTTS(text=text, lang='tr')
            mp3_fp = io.BytesIO()
            tts_engine.write_to_fp(mp3_fp)
            mp3_fp.seek(0)
            return send_file(mp3_fp, mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")

        elif voice == 'edge_female':
            # Cino Abla - Edge TTS Emel Neural (HD Kadın)
            mp3_fp = asyncio.run(edge_tts_generate(text, "tr-TR-EmelNeural"))
            return send_file(mp3_fp, mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")

        elif voice == 'edge_male_tolga':
            # Tolga - Edge TTS Ahmet Neural bas pitch
            mp3_fp = asyncio.run(edge_tts_generate(text, "tr-TR-AhmetNeural", pitch="-15Hz"))
            return send_file(mp3_fp, mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")

        else:
            # Cüneyt Abi - Edge TTS Ahmet Neural (HD Erkek)
            mp3_fp = asyncio.run(edge_tts_generate(text, "tr-TR-AhmetNeural"))
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
