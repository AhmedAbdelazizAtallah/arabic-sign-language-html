// الروابط الديناميكية (تكتشف تلقائياً البيئة)
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

const COOLDOWN_MS = 1200; // وقت الانتظار لمنع تكرار إضافة نفس الحرف فورياً

// ================= 1. إدارة الوسائط =================

function stopMedia() {
    video.ontimeupdate = null; // إيقاف معالجة الفيديو عند التنقل
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

// الكاميرا
btnWebcam.onclick = () => {
    currentMode = "webcam";
    updateTabStyles(btnWebcam);
    image.classList.add('hidden');
    video.classList.remove('hidden');
    video.classList.add('scale-x-[-1]');
    stopMedia();
    
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then(stream => { video.srcObject = stream; video.play(); })
        .catch(err => alert("يرجى السماح بالوصول للكاميرا."));
};

// الفيديو والصورة
btnVideo.onclick = () => { fileInput.accept = "video/*"; fileInput.click(); };
btnImage.onclick = () => { fileInput.accept = "image/*"; fileInput.click(); };

fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 🎥 1. التعامل الذكي مع الفيديو المرفوع
    if (file.type.startsWith('video/')) {
        currentMode = "video";
        updateTabStyles(btnVideo);
        stopMedia();

        image.classList.add('hidden');
        video.classList.remove('hidden');
        video.classList.remove('scale-x-[-1]');

        video.src = URL.createObjectURL(file);
        video.play();

        let lastVideoLabel = "";

        // التتبع الذكي أثناء تقدم خط زمن الفيديو
        video.ontimeupdate = async () => {
            if (video.paused || video.ended) return;

            // أخذ فريم خفيف أبعاده 320px
            canvas.width = 320;
            canvas.height = (video.videoHeight / video.videoWidth) * 320 || 240;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(async (blob) => {
                if (!blob) return;
                const formData = new FormData();
                formData.append("file", blob, "frame.jpg");

                try {
                    const res = await fetch(`${API_BASE}/detect-image`, { method: "POST", body: formData });
                    if (!res.ok) return;

                    const data = await res.json();

                    if (data.label && data.confidence >= 0.55) {
                        const confPercent = Math.round(data.confidence * 100);
                        liveResult.textContent = `${data.label} (${confPercent}%)`;

                        // لا نضيف الحرف للجملة إلا إذا تغير عن السلسلة السابقة
                        if (data.label !== lastVideoLabel) {
                            currentText += data.label;
                            lastVideoLabel = data.label;
                            updateUI();
                        }
                    }
                } catch (err) {
                    console.error("خطأ معالجة الفيديو:", err);
                }
            }, 'image/jpeg', 0.5);
        };
    } 
    // 🖼️ 2. التعامل مع الصورة
    else if (file.type.startsWith('image/')) {
        currentMode = "image";
        updateTabStyles(btnImage);
        stopMedia();

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
            liveResult.textContent = "⚠️ حدث خطأ أثناء معالجة النتيجة";
        }
    }
    fileInput.value = ""; 
};

// ================= 2. الاتصال (WebSocket) =================

function connectWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        statusBadge.textContent = "متصل ✅";
        statusBadge.className = "bg-green-500/80 px-4 py-2 rounded-full backdrop-blur-sm text-sm";
        setInterval(sendFrame, 90); // إرسال إطار كل 90ms لسرعة متزنة
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // استخدام خاصية الاستقرار الذكية (is_stable) المرسلة من السيرفر
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
    };

    ws.onclose = () => {
        statusBadge.textContent = "غير متصل ❌";
        statusBadge.className = "bg-red-500/80 px-4 py-2 rounded-full backdrop-blur-sm text-sm";
        setTimeout(connectWebSocket, 2000);
    };
}

function sendFrame() {
    if (ws && ws.readyState === WebSocket.OPEN && video.videoWidth > 0 && currentMode === "webcam") {
        canvas.width = 320; // إرسال أبعاد خفيفة للباك إند
        canvas.height = (video.videoHeight / video.videoWidth) * 320 || 240;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ws.send(canvas.toDataURL('image/jpeg', 0.5));
    }
}

// ================= 3. منطق الجملة والواجهة =================

function updateUI() {
    sentenceBox.innerHTML = currentText || '<span class="opacity-40 text-lg font-normal">ابدأ بالإشارة...</span>';
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
