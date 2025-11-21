![IllumiSign Banner](https://drive.google.com/uc?export=view&id=1Ar3DopmSy2SAy2cisr0BN7FidUuOlUZn)

# IllumiSign

**Memo:**  
_Built at Hack the Nest 2025 (Social Justice Track winner), IllumiSign delivers affordable, highly accessible communication without any special hardware, giving users independence and dignity._

***

## Features

- **Eye Tracking with WebGazer.js:**  
  Select words and phrases by simply looking at tiles on a grid.
- **Scanning Mode:**  
  Cycling highlight for single-switch or minimal mobility users.
- **Text-to-Speech Voice Output:**  
  Real-time speech using Web Speech Synthesis API.
- **Browser-Based:**  
  Works on any modern browser with a webcam—no installation needed.
- **Accessibility Settings:**  
  - Adjustable dwell time and scanning speed
  - High-contrast mode
  - Customizable font size
  - Voice and language selection
  - Replay and history of past messages

***

## Getting Started

### Requirements

- Modern browser (Chromium-based or Firefox recommended)
- Webcam access

### Run Locally

```bash
git clone https://github.com/ankthba/hack-the-nest-2025.git
```
Open `index.html` in your browser and grant camera access when prompted.

***

## Usage

- Select Eye Tracking or Scanning Mode on startup.
- Gaze at tiles or use scanning to select words and phrases.
- Use Smart Compose to expand basic inputs.
- Press "Speak" or use auto-speak to broadcast messages.
- Customize accessibility options in the settings panel.

***

## FAQs

**How accurate is webcam eye tracking?**  
Results depend on webcam quality, lighting, and calibration. The app optimizes input with smoothing and adaptive dwell times.

**Is the system secure and private?**  
All processing occurs locally in your browser except for AI Smart Compose, which connects to Gemini API as needed.

***

## Roadmap & Future Directions

- Integration with the OCRadar parent organization
- Multi-language interface support
- Improved calibration for diverse conditions

***