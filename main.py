import base64
import json
import io
import cv2
import numpy as np
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

class TranslateRequest(BaseModel):
    text: str
    target_lang: str

class TTSRequest(BaseModel):
    text: str
    lang: str

# 1. الاتصال المباشر (للكاميرا والفيديو)
@app.websocket("/ws/detect")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            if not model:
                continue
                
            img_data = base64.b64decode(data.split(",")[1])
            np_arr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            if frame is None:
                continue

            results = model.predict(frame, conf=0.5, verbose=False)
            res = results[0]
            
            detection_result = {"label": None, "confidence": 0.0}
            if len(res.boxes) > 0:
                top_idx = res.boxes.conf.argmax().item()
                detection_result["label"] = res.names[int(res.boxes.cls[top_idx].item())]
                detection_result["confidence"] = float(res.boxes.conf[top_idx].item())
            
            await websocket.send_text(json.dumps(detection_result))
            
    except WebSocketDisconnect:
        print("العميل قطع الاتصال")

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

    # ⚡ تسريع المعالجة: تصغير حجم الصورة الممررة للموديل لـ 320px لسرعة فائقة
    results = model.predict(frame, imgsz=320, conf=0.4, verbose=False)
    res = results[0]
    
    annotated = res.plot()
    
    # ضغط الصورة الناتجة لتقليل حجم النقل عبر الشبكة
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

# === دمج الواجهة الأمامية مع الخادم (يجب أن يكون في النهاية) ===
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
