![IllumiSign Banner](https://drive.google.com/uc?export=view&id=1Ar3DopmSy2SAy2cisr0BN7FidUuOlUZn)

# IllumiSign

IllumiSign is an open-source, browser-based communication system built for people with ALS (Amyotrophic Lateral Sclerosis) and others with severe speech or mobility impairments. Using only a standard webcam and a web browser, IllumiSign empowers users to express themselves through **eye tracking, scanning controls, with no expensive hardware required.

---

## Inspiration

For many people with ALS, communication becomes nearly impossible once both speech and mobility are lost. Commercial assistive devices often cost thousands of dollars and remain inaccessible to those who need them most. We wanted to build an **affordable, open-source, and accessible alternative** that restores independence and dignity by turning a simple laptop or tablet into a powerful voice.

---

## Features

- **Eye Tracking with WebGazer.js** – Select words and phrases by looking at tiles on a grid.
- **Scanning Mode** – A cycling highlight system for single-switch or minimal mobility users.
- **AI Smart Compose (Gemini API)** – Expands short inputs like "help" or "thirsty" into fluent, natural sentences.
- **Text-to-Speech Voice Output** – Messages are spoken aloud using the Web Speech Synthesis API.
- **Fully Browser-Based** – Works on any modern browser with a webcam—no installation required.
- **Accessibility Settings:**
  - Adjustable dwell time and scanning speed
  - High-contrast mode
  - Customizable font size
  - Voice and language selection
  - Replay past messages from history

---

## How We Built It

- **Frontend:** JavaScript, HTML, CSS
- **Eye Tracking:** WebGazer.js with dwell-based input and smoothing functions
- **Scanning Mode:** Custom cycle-based keyboard interface for single-switch control
- **Speech Output:** Web Speech Synthesis API for real-time voice playback
- **Storage:** Local storage preserving vocabulary, categories, and message history

---

## Challenges

- Achieving reliable eye tracking with only a webcam required extensive calibration and smoothing.
- Designing adaptable dwell and scanning speeds to suit diverse physical needs.
- Formatting AI output into concise, user-friendly suggestions.
- Ensuring accessibility with ARIA roles, focus handling, and proper contrast for readability.

---

## Accomplishments

- A fully functional web-based communication system that **requires no special hardware**.
- Dual communication options: **eye-tracking mode** and **scanning fallback**.
- Successfully integrated AI-powered Smart Compose for natural, expressive speech.
- Modular, emoji-labeled vocabulary with history replay for efficient communication.

---

## What We Learned

- How to merge **computer vision** with accessibility-first UI design.
- The importance of **customization** in assistive technologies (dwell, contrast, scanning pace).
- Real-world lessons from **AI in accessibility**, ensuring generated suggestions remain concise and supportive.
- That building assistive technology isn’t just about function—it’s about *restoring dignity and independence*.

---

## Getting Started

### Requirements

- Modern browser (Chromium Based, or Firefox recommended)
- Webcam access

### Run Locally

git clone https://github.com/ankthba/hack-the-nest-2025.git

Open `index.html` in your browser and grant camera access when prompted.

---

## Tech Stack

- **Languages:** JavaScript, HTML, CSS
- **Libraries/APIs:** WebGazer.js, Gemini API, Web Speech Synthesis

---

## Future Directions

- Multi-language support for global accessibility
- Cloud-synced custom vocabularies across devices
- Improved calibration techniques for different lighting conditions
- Integration with external accessibility hardware (switches, adaptive controllers)

---

## Contributors

- Aniketh Bandlamudi, Backend
- Lauren Kim, Frontend
- Celine Liu, Logo
---
