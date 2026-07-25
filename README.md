# 🤟 Arabic Sign Language AI Translator

<p align="center">
An AI-powered real-time Arabic Sign Language Translator built with <b>YOLOv26</b>, <b>FastAPI</b>, and a modern Web interface.
</p>

<p align="center">

![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-green)
![YOLO](https://img.shields.io/badge/YOLO-v26-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)

</p>

---

# 📖 Overview

Arabic Sign Language AI Translator is a full-stack AI application that translates Arabic Sign Language into readable and spoken text in real time.

The system utilizes a custom-trained **YOLOv26** model to recognize sign language gestures from:

* 📷 Live webcam
* 🖼 Images
* 🎥 Video files

The recognized characters are intelligently combined into words and sentences before being translated and spoken using Text-to-Speech.

---

# ✨ Features

## 🎥 Real-Time Detection

* Live webcam recognition
* Up to 30 FPS processing
* WebSocket streaming

## 🖼 Image Recognition

Upload an image containing sign language and receive instant predictions.

## 🎬 Video Recognition

Analyze recorded videos frame by frame.

## 🧠 Smart Sentence Builder

* Stability Threshold
* Removes repeated predictions
* Automatically builds meaningful text

## 🌍 Translation

Translate generated Arabic text into:

* English
* French
* German

## 🔊 Text To Speech

Convert recognized text into natural speech.

## 📱 Responsive UI

Modern interface built using HTML, JavaScript and Tailwind CSS.

---

# 🏗 Tech Stack

| Layer           | Technology              |
| --------------- | ----------------------- |
| Frontend        | HTML5, CSS3, JavaScript |
| Styling         | Tailwind CSS            |
| Backend         | FastAPI                 |
| AI Model        | YOLOv26                 |
| Computer Vision | OpenCV                  |
| Deep Learning   | Ultralytics             |
| Communication   | WebSockets              |

---

# 📂 Project Structure

```text
arabic-sign-language-ai/
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── models/
│       └── yolov26s.pt
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── assets/
│
├── outputs/
│
├── README.md
└── LICENSE
```

---

# 🚀 Installation

Clone the repository

```bash
git clone https://github.com/yourusername/arabic-sign-language-ai.git
```

Move into the project

```bash
cd arabic-sign-language-ai
```

Install dependencies

```bash
pip install -r requirements.txt
```

Run the backend

```bash
uvicorn backend.main:app --reload
```

Open your browser

```
http://localhost:8000
```

---

# 🖥 Usage

1. Start the FastAPI server.
2. Open the web application.
3. Choose:

   * Webcam
   * Image
   * Video
4. The model predicts sign language.
5. Characters are converted into words.
6. Translate or listen using Text-to-Speech.

---

# 📊 AI Model

Model: **YOLOv26**

Capabilities:

* Arabic Sign Language Detection
* High-speed inference
* Real-time processing
* Optimized for deployment

---

# 📸 Screenshots

```
assets/
 ├── home.png
 ├── webcam.png
 ├── prediction.png
 └── translation.png
```

---

# 🔮 Future Improvements

* Mobile Application
* Sentence Correction using LLMs
* Voice Commands
* Cloud Deployment
* User Accounts
* Continuous Learning

---

# 🤝 Contributing

Contributions are welcome!

```bash
Fork → Create Branch → Commit → Push → Pull Request
```

---

# 📜 License

This project is licensed under the MIT License.

---

# 👨‍💻 Author

**Ahmed Abdelaziz Atallah**

Artificial Intelligence Engineer • Data Analyst • Machine Learning Engineer

GitHub: https://github.com/yourusername

LinkedIn: https://linkedin.com/in/yourprofile
