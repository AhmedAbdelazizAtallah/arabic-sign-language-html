// الروابط الديناميكية (تكتشف تلقائياً إذا كانت تعمل محلياً أو على سيرفر)
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
let ws;
let currentText = "";
let lastDetected = "";
let stabilityCount = 0;
let inCooldown = false;
let currentMode = "webcam"; 

const STABILITY_FRAMES = 8; 
const COOLDOWN_MS = 1000;   
const MIN_CONFIDENCE = 0.5; 

// ================= 1. إدارة الوسائط =================

function stopMedia() {
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

    if (file.type.startsWith('video/')) {
        currentMode = "video";
        updateTabStyles(btnVideo);
        stopMedia();
        image.classList.add('hidden');
        video.classList.remove('hidden');
        video.classList.remove('scale-x-[-1]');
        video.src = URL.createObjectURL(file);
        video.play();
    } 
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
            // استخدام رابط صريح وديناميكي بدون كاش
            const targetUrl = `${window.location.origin}/detect-image`;
            console.log("Sending request to:", targetUrl);

            const res = await fetch(targetUrl, { 
                method: "POST", 
                body: formData 
            });

            if (!res.ok) {
                throw new Error(`Server status: ${res.status}`);
            }

            const data = await res.json();
            console.log("Server Response:", data);
            
            // 1. عرض الصورة المرسومة من السيرفر فوراً
            if (data.image) {
                image.src = "data:image/jpeg;base64," + data.image;
            }
            
            // 2. تحديث النتيجة بغض النظر عن نسبة الثقة لرؤية ما يراه الموديل
            if (data.label) {
                const confPercent = Math.round((data.confidence || 0) * 100);
                liveResult.textContent = `${data.label} (${confPercent}%)`;
                
                // إضافة الحرف للجملة
                currentText += labelTranslationMap[data.label] || data.label;
                updateUI();
            } else {
                liveResult.textContent = "❌ لم يتم اكتشاف أي إشارة في الصورة";
            }

        } catch (err) {
            console.error("Fetch Error:", err);
            liveResult.textContent = "⚠️ فشل الاتصال بالسيرفر";
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
        setInterval(sendFrame, 100); 
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleDetection(data.label, data.confidence);
    };

    ws.onclose = () => {
        statusBadge.textContent = "غير متصل ❌";
        statusBadge.className = "bg-red-500/80 px-4 py-2 rounded-full backdrop-blur-sm text-sm";
        setTimeout(connectWebSocket, 2000);
    };
}

function sendFrame() {
    if (ws.readyState === WebSocket.OPEN && video.videoWidth > 0 && currentMode !== "image") {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ws.send(canvas.toDataURL('image/jpeg', 0.5));
    }
}

// ================= 3. منطق الجملة =================

function handleDetection(label, conf) {
    if (label && conf >= MIN_CONFIDENCE) {
        liveResult.textContent = `${label} (${Math.round(conf * 100)}%)`;

        if (!inCooldown) {
            if (label === lastDetected) {
                stabilityCount++;
                if (stabilityCount >= STABILITY_FRAMES) {
                    currentText += label;
                    updateUI();
                    inCooldown = true;
                    setTimeout(() => { inCooldown = false; }, COOLDOWN_MS);
                    stabilityCount = 0;
                }
            } else {
                lastDetected = label;
                stabilityCount = 1;
            }
        }
    } else {
        if(currentMode !== "image") liveResult.textContent = "-";
        stabilityCount = 0;
        lastDetected = "";
    }
}

function updateUI() {
    sentenceBox.innerHTML = currentText || '<span class="opacity-40 text-lg font-normal">ابدأ بالإشارة...</span>';
}

// ================= 4. أدوات التحكم =================

document.getElementById('btnSpace').onclick = () => { currentText += " "; updateUI(); };
document.getElementById('btnDel').onclick = () => { currentText = currentText.slice(0, -1); updateUI(); };
document.getElementById('btnClear').onclick = () => { currentText = ""; updateUI(); document.getElementById('translationResultBox').classList.add("hidden"); };

async function playAudio(text, lang) {
    if(!text) return;
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
        if(data.translated_text) {
            document.getElementById('translationText').textContent = data.translated_text;
            document.getElementById('translationResultBox').classList.remove("hidden");
        }
    } catch (err) { console.error("خطأ:", err); }
};

// بدء التشغيل
btnWebcam.click();
connectWebSocket();
