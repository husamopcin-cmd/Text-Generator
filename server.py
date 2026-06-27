from flask import Flask, request, send_file, jsonify
from gtts import gTTS
import os
import io
import sqlite3
import hashlib
import uuid
import asyncio
import edge_tts

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


# --- TTS HELPERS ---
async def save_edge_tts(text, voice, out_file, pitch=None):
    if pitch:
        communicate = edge_tts.Communicate(text, voice, pitch=pitch)
    else:
        communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_file)

# --- TTS ENDPOINT ---

@app.route('/api/tts')
def tts():
    text = request.args.get('text', '').strip()
    if not text:
        return "No text", 400
        
    try:
        # Google'ın Varsayılan Türkçe Sesi (Engellenmez, stabil ve hızlıdır)
        tts_engine = gTTS(text=text, lang='tr')
        mp3_fp = io.BytesIO()
        tts_engine.write_to_fp(mp3_fp)
        mp3_fp.seek(0)
        return send_file(mp3_fp, mimetype="audio/mpeg", as_attachment=False, download_name="speech.mp3")
    except Exception as e:
        print("TTS Error:", e)
        return str(e), 500
    finally:
        if os.path.exists(out_file):
            try:
                os.remove(out_file)
            except Exception:
                pass

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
    port = int(os.environ.get("PORT", 8001))
    app.run(host='0.0.0.0', port=port, threaded=True)
