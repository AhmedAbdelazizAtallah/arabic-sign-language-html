// ================= 0. الروابط والعناصر الأساسية =================
const API_BASE = window.location.origin;
const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const WS_URL = wsProtocol + window.location.host + "/ws/detect";

// العناصر
const video = document.getElementById('videoElement');
const image = document.getElementById('imageElement');
const canvas = document.getElementById('canvasElement');
const ctx = canvas.getContext('2d');
const statusBadge = document.getElementById('statusBadge');
const liveResult = document.getElementById('liveResult');
const sentenceBox = document.getElementById('sentenceBox');
const fileInput = document.getElementById('fileInput');
const guideBox = document.getElementById('guideBox'); // متغير المربع الثابت

// الأزرار
const btnWebcam = document.getElementById('btnWebcam');
const btnVideo = document.getElementById('btnVideo');
const btnImage = document.getElementById('btnImage');

// متغيرات النظام
let ws = null;
let currentText = "";
let lastDetected = "";
let inCooldown = false;
let currentMode = "webcam"; 
let videoInterval = null; 

const COOLDOWN_MS = 1000;   

// ================= 1. إدارة الوسائط والفيديو =================

function clearVideoInterval() {
    if (videoInterval) {
        clearInterval(videoInterval);
        videoInterval = null;
    }
}

function stopMedia() {
    clearVideoInterval();
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    video.pause();
    video.src = "";
}

function updateTabStyles(activeBtn) {
    [btnWebcam, btnVideo, btnImage].forEach(btn => {
        btn.className = "flex-1 py-2 rounded-lg text-slate-400 hover:bg-slate-800 transition-all text-sm md:text-base";
    });
    activeBtn.className = "flex-1 py-2 rounded-lg bg-[#7c5cff22] text-[#7c5cff] font-bold transition-all text-sm md:text-base";
}

// الكاميرا المباشرة
btnWebcam.onclick = () => {
    currentMode = "webcam";
    updateTabStyles(btnWebcam);
    image.classList.add('hidden');
    video.classList.remove('hidden');
    video.classList.add('scale-x-[-1]'); // عكس الكاميرا المباشرة فقط
    guideBox.classList.remove('hidden'); // إظهار المربع الثابت
    stopMedia();
    
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then(stream => { 
            video.srcObject = stream; 
            video.play(); 
            // تشغيل التتبع إذا كان الاتصال مفتوحاً
            if(ws && ws.readyState === WebSocket.OPEN) {
                requestAnimationFrame(sendFrame);
            }
        })
        .catch(err => alert("يرجى السماح بالوصول للكاميرا."));
};

// رفع ملف فيديو أو صورة
btnVideo.onclick = () => { fileInput.accept = "video/*"; fileInput.click(); };
btnImage.onclick = () => { fileInput.accept = "image/*"; fileInput.click(); };

fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    stopMedia();
    guideBox.classList.add('hidden'); // إخفاء المربع الثابت في حالة الصور والفيديو

    // 🎥 1. حالة رفع فيديو
    if (file.type.startsWith('video/')) {
        currentMode = "video";
        updateTabStyles(btnVideo);

        image.classList.add('hidden');
        video.classList.remove('hidden');
        video.classList.remove('scale-x-[-1]'); 

        const videoURL = URL.createObjectURL(file);
        video.src = videoURL;
        
        let lastVideoLabel = "";
        let isProcessingFrame = false; 

        video.onloadeddata = () => {
            video.play().catch(err => console.log("خطأ تشغيل الفيديو:", err));
            liveResult.textContent = "⏳ جاري تحليل الفيديو بذكاء...";

            videoInterval = setInterval(() => {
                if (video.paused || video.ended || isProcessingFrame) return;

                isProcessingFrame = true; 

                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 480;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        isProcessingFrame = false;
                        return;
                    }
                    const formData = new FormData();
                    formData.append("file", blob, "frame.jpg");

                    try {
                        const res = await fetch(`${API_BASE}/detect-image`, { method: "POST", body: formData });
                        if (res.ok) {
                            const data = await res.json();

                            if (data.label && data.confidence >= 0.30) {
                                const confPercent = Math.round(data.confidence * 100);
                                liveResult.textContent = `${data.label} (${confPercent}%)`;

                                if (data.label !== lastVideoLabel) {
                                    currentText += data.label;
                                    lastVideoLabel = data.label;
                                    updateUI();
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Video processing error:", err);
                    } finally {
                        isProcessingFrame = false; 
                    }
                }, 'image/jpeg', 0.85); 
            }, 200);
        };

        video.onended = () => {
            clearVideoInterval();
            liveResult.textContent = "✅ اكتمل تحليل الفيديو";
        };
    } 
    // 🖼️ 2. حالة رفع صورة
    else if (file.type.startsWith('image/')) {
        currentMode = "image";
        updateTabStyles(btnImage);

        video.classList.add('hidden');
        image.classList.remove('hidden');
        
        image.src = URL.createObjectURL(file);
        liveResult.textContent = "⏳ جاري التحليل...";
        
        const formData = new FormData();
        formData.append("file", file);
        
        try {
            const res = await fetch(`${API_BASE}/detect-image`, { method: "POST", body: formData });

            if (!res.ok) throw new Error(`Server Error: ${res.status}`);

            const data = await res.json();

            if (data.image) {
                image.src = "data:image/jpeg;base64," + data.image;
            }

            if (data.label) {
                const confPercent = Math.round((data.confidence || 0) * 100);
                liveResult.textContent = `${data.label} (${confPercent}%)`;

                currentText += data.label;
                updateUI();
            } else {
                liveResult.textContent = "❌ لم يتم التعرف على إشارة";
            }

        } catch (err) {
            console.error("Image detection error:", err);
            liveResult.textContent = "⚠️ فشل الاتصال بالسيرفر";
        }
    }
    fileInput.value = ""; 
};

// ================= 2. الاتصال المباشر (WebSocket) والطلب المتزامن =================

function connectWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        statusBadge.textContent = "متصل ✅";
        statusBadge.className = "bg-green-500/80 px-4 py-2 rounded-full backdrop-blur-sm text-sm";
        
        // إرسال الإطار الأول فقط ليبدأ الـ Loop
        if (currentMode === "webcam") {
            requestAnimationFrame(sendFrame);
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.is_stable && data.label) {
            const confPercent = Math.round((data.confidence || 0) * 100);
            liveResult.textContent = `${data.label} (${confPercent}%)`;

            if (!inCooldown && data.label !== lastDetected) {
                currentText += data.label;
                lastDetected = data.label;
                updateUI();
                
                inCooldown = true;
                setTimeout(() => { inCooldown = false; }, COOLDOWN_MS);
            }
        } else {
            if (currentMode === "webcam") liveResult.textContent = "⏳ جاري التتبع...";
        }

        // لا نرسل الإطار الجديد إلا بعد استلام الرد لمنع التقطيع (Server Flooding)
        if (currentMode === "webcam" && ws.readyState === WebSocket.OPEN) {
            requestAnimationFrame(sendFrame);
        }
    };

    ws.onclose = () => {
        statusBadge.textContent = "غير متصل ❌";
        statusBadge.className = "bg-red-500/80 px-4 py-2 rounded-full backdrop-blur-sm text-sm";
        setTimeout(connectWebSocket, 2000);
    };
}

// دالة إرسال الإطار معدلة لتقوم بقص المربع الأوسط بحجم 416x416 كما تدرب الموديل
function sendFrame() {
    if (ws && ws.readyState === WebSocket.OPEN && video.videoWidth > 0 && currentMode === "webcam") {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        
        // حساب المربع الأوسط (Crop Box) بناءً على أبعاد الكاميرا الأصلية
        const minDim = Math.min(vw, vh); 
        const cropX = (vw - minDim) / 2; 
        const cropY = (vh - minDim) / 2; 
        
        // إجبار الكانفاس ليكون 416x416 بالضبط
        canvas.width = 416;
        canvas.height = 416;
        
        // قص المربع الأوسط من الفيديو، ورسمه في الكانفاس بدون أي تشويه
        ctx.drawImage(video, cropX, cropY, minDim, minDim, 0, 0, 416, 416);
        
        // استخدام Blob للإرسال الثنائي لتخفيف الحمل بدلاً من Base64
        canvas.toBlob((blob) => {
            if (blob) {
                ws.send(blob);
            } else {
                requestAnimationFrame(sendFrame);
            }
        }, 'image/jpeg', 0.6);
    } else if (currentMode === "webcam" && ws && ws.readyState === WebSocket.OPEN) {
        setTimeout(sendFrame, 100);
    }
}

// ================= 3. إدارة الواجهة للجملة =================

function updateUI() {
    sentenceBox.innerHTML = currentText || '<span class="opacity-40 text-lg font-normal">ابدأ بالإشارة...</span>';
    sentenceBox.scrollTop = sentenceBox.scrollHeight;
}

// ================= 4. أدوات التحكم والخدمات =================

document.getElementById('btnSpace').onclick = () => { currentText += " "; updateUI(); };
document.getElementById('btnDel').onclick = () => { currentText = currentText.slice(0, -1); updateUI(); };
document.getElementById('btnClear').onclick = () => { 
    currentText = ""; 
    lastDetected = "";
    updateUI(); 
    document.getElementById('translationResultBox').classList.add("hidden"); 
};

async function playAudio(text, lang) {
    if (!text) return;
    try {
        const res = await fetch(`${API_BASE}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, lang })
        });
        const blob = await res.blob();
        document.getElementById('audioPlayer').src = URL.createObjectURL(blob);
        document.getElementById('audioPlayer').play();
    } catch (err) { console.error("خطأ:", err); }
}

document.getElementById('btnAudioAr').onclick = () => playAudio(currentText, "ar");
document.getElementById('btnAudioTrans').onclick = () => playAudio(document.getElementById('translationText').textContent, document.getElementById('targetLang').value);

document.getElementById('btnTranslate').onclick = async () => {
    if (!currentText.trim()) return;
    try {
        const res = await fetch(`${API_BASE}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: currentText, target_lang: document.getElementById('targetLang').value })
        });
        const data = await res.json();
        if (data.translated_text) {
            document.getElementById('translationText').textContent = data.translated_text;
            document.getElementById('translationResultBox').classList.remove("hidden");
        }
    } catch (err) { console.error("خطأ:", err); }
};

// بدء التشغيل
btnWebcam.click();
connectWebSocket();
