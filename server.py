from flask import Flask, request, send_file, jsonify
from gtts import gTTS
import subprocess
import sys
import os
import io
import sqlite3
import hashlib

app = Flask(__name__)

# --- DATABASE SETUP ---
DB_FILE = 'users.db'

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

# --- AUTH ENDPOINTS ---

@app.route('/api/register', methods=['POST', 'OPTIONS'])
def register():
    if request.method == 'OPTIONS':
        return '', 200
    data = request.json
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Kullanıcı adı ve şifre gereklidir.'}), 400
    
    username = data['username'].strip()
    password = data['password']
    
    if len(username) < 3:
        return jsonify({'error': 'Kullanıcı adı en az 3 karakter olmalıdır.'}), 400
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', (username, hash_password(password)))
        conn.commit()
        return jsonify({'success': True, 'message': 'Kayıt başarılı!'})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Bu kullanıcı adı zaten alınmış.'}), 400
    finally:
        conn.close()

@app.route('/api/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return '', 200
    data = request.json
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Kullanıcı adı ve şifre gereklidir.'}), 400
        
    username = data['username'].strip()
    password = data['password']
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT password_hash FROM users WHERE username = ?', (username,))
    row = c.fetchone()
    conn.close()
    
    if row and row[0] == hash_password(password):
        return jsonify({'success': True, 'username': username})
    else:
        return jsonify({'error': 'Geçersiz kullanıcı adı veya şifre.'}), 401


# --- TTS ENDPOINT ---

@app.route('/api/tts')
def tts():
    text = request.args.get('text', '').strip()
    voice = request.args.get('voice', 'gtts_male')
    if not text:
        return "No text", 400
        
    try:
        if voice == 'edge_female':
            # Edge-TTS (Emel Neural - Gercek Kadin Sesi)
            out_file = "temp_speech.mp3"
            cmd = [
                sys.executable, "-m", "edge_tts",
                "--voice", "tr-TR-EmelNeural",
                "--text", text,
                "--write-media", out_file
            ]
            subprocess.run(cmd, check=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            
            with open(out_file, "rb") as f:
                data = f.read()
            return send_file(io.BytesIO(data), mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")
            
        elif voice == 'female_gtts':
            # gTTS (Google'in Varsayilan Kadin Sesi - Ayse Abla)
            tts_engine = gTTS(text=text, lang='tr')
            mp3_fp = io.BytesIO()
            tts_engine.write_to_fp(mp3_fp)
            mp3_fp.seek(0)
            return send_file(mp3_fp, mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")
            
        elif voice == 'edge_male_tolga':
            # edge-tts (Ahmet Neural - Pitch -15Hz - Tolga)
            out_file = "temp_speech_tolga.mp3"
            cmd = [
                sys.executable, "-m", "edge_tts",
                "--voice", "tr-TR-AhmetNeural",
                "--pitch=-15Hz",
                "--text", text,
                "--write-media", out_file
            ]
            subprocess.run(cmd, check=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            
            with open(out_file, "rb") as f:
                data = f.read()
            return send_file(io.BytesIO(data), mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")
            
        else:
            # edge-tts (Ahmet Neural - Gercek Erkek Sesi - Cuneyt Abi)
            out_file = "temp_speech_male.mp3"
            cmd = [
                sys.executable, "-m", "edge_tts",
                "--voice", "tr-TR-AhmetNeural",
                "--text", text,
                "--write-media", out_file
            ]
            subprocess.run(cmd, check=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            
            with open(out_file, "rb") as f:
                data = f.read()
            return send_file(io.BytesIO(data), mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")
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
    print("==========================================")
    print(" CinoCode Coklu Ses Sunucusu Basladi!     ")
    print(" Lutfen bu pencereyi KAPATMAYIN!          ")
    print("==========================================")
    app.run(host='0.0.0.0', port=8001, threaded=True)
