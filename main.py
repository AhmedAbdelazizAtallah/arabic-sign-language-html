import base64
import json
import io
import cv2
import numpy as np
import asyncio
from collections import deque, Counter
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from ultralytics import YOLO
from deep_translator import GoogleTranslator
from gtts import gTTS

app = FastAPI(title="Arabic Sign Language API")

# السماح للواجهة بالاتصال
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# تحميل الموديل
try:
    model = YOLO("models/yolov26s.pt")
except Exception as e:
    print(f"تحذير: الموديل غير موجود - {e}")
    model = None

# ذاكرة تراكمية لآخر 7 إطارات لتحقيق التصويت الأغلب (Majority Voting)
history_buffer = deque(maxlen=7)

class TranslateRequest(BaseModel):
    text: str
    target_lang: str

class TTSRequest(BaseModel):
    text: str
    lang: str

# 1. الاتصال المباشر (الكاميرا مع التتبع الذكي)
# 1. الاتصال المباشر (الكاميرا مع التتبع الذكي)
@app.websocket("/ws/detect")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    history_buffer.clear() # إعادة ضبط الذاكرة مع كل اتصال جديد
    
    try:
        while True:
            # استلام البيانات
            data = await websocket.receive_bytes()
            
            # ✅ التعديل الجذري: حماية المعالجة بـ try داخلي لمنع انهيار الاتصال بالكامل
            try:
                if not model:
                    await websocket.send_text(json.dumps({"label": None, "confidence": 0.0, "is_stable": False}))
                    continue
                    
                np_arr = np.frombuffer(data, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                
                if frame is None:
                    await websocket.send_text(json.dumps({"label": None, "confidence": 0.0, "is_stable": False}))
                    continue

                def run_inference():
                    return model.track(frame, imgsz=416, conf=0.45, persist=True, verbose=False)
                
                results = await asyncio.to_thread(run_inference)
                res = results[0]
                
                current_label = None
                current_conf = 0.0

                if len(res.boxes) > 0:
                    top_idx = res.boxes.conf.argmax().item()
                    current_label = res.names[int(res.boxes.cls[top_idx].item())]
                    current_conf = float(res.boxes.conf[top_idx].item())
                    history_buffer.append(current_label)
                else:
                    history_buffer.append(None)

                valid_predictions = [lbl for lbl in history_buffer if lbl is not None]
                smart_label = None
                is_stable = False
                
                if len(valid_predictions) >= 4:
                    most_common, count = Counter(valid_predictions).most_common(1)[0]
                    if count / len(history_buffer) >= 0.6:
                        smart_label = most_common
                        is_stable = True

                await websocket.send_text(json.dumps({
                    "label": smart_label,
                    "confidence": current_conf,
                    "is_stable": is_stable
                }))
                
            except Exception as inner_e:
                # إذا حدث خطأ في إطار واحد، اطبع الخطأ وأرسل رد فارغ بدلاً من فصل الاتصال
                print(f"خطأ في معالجة الإطار: {inner_e}")
                await websocket.send_text(json.dumps({"label": None, "confidence": 0.0, "is_stable": False}))
                
    except WebSocketDisconnect:
        print("العميل قطع الاتصال")
    except Exception as e:
        print(f"حدث خطأ فادح أدى لفصل الاتصال: {e}")

# 2. تحليل الصور الثابتة
@app.post("/detect-image")
async def detect_image(file: UploadFile = File(...)):
    if not model:
        return {"error": "الموديل غير متوفر"}
        
    contents = await file.read()
    np_arr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    
    if frame is None:
        return {"error": "صورة غير صالحة"}

    results = model.predict(frame, imgsz=416, conf=0.30, verbose=False)
    res = results[0]
    
    annotated = res.plot()
    
    _, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 70])
    img_base64 = base64.b64encode(buffer).decode('utf-8')
    
    detection_result = {"label": None, "confidence": 0.0, "image": img_base64}
    
    if len(res.boxes) > 0:
        top_idx = res.boxes.conf.argmax().item()
        detection_result["label"] = res.names[int(res.boxes.cls[top_idx].item())]
        detection_result["confidence"] = float(res.boxes.conf[top_idx].item())
        
    return detection_result

# 3. الترجمة
@app.post("/translate")
async def translate_text(req: TranslateRequest):
    try:
        translated = GoogleTranslator(source='ar', target=req.target_lang).translate(req.text)
        return {"translated_text": translated}
    except Exception as e:
        return {"error": str(e)}

# 4. النطق الصوتي
@app.post("/tts")
async def text_to_speech(req: TTSRequest):
    try:
        tts = gTTS(text=req.text, lang=req.lang)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        return StreamingResponse(fp, media_type="audio/mp3")
    except Exception as e:
        return {"error": str(e)}

# === دمج الواجهة الأمامية مع الخادم ===
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
