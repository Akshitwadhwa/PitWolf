# Pitwall Copilot — PPT Brief

## One-line pitch

**Pitwall Copilot is an F1-inspired AI communication assistant that turns fast, ambiguous driver and engineer radio messages into clear, action-ready race information.**

It acts as a “silent co-driver” on the pit wall: it helps engineers understand what a driver means and helps drivers receive only the shortest, safest version of an engineer’s instruction.

---

## 1. The problem

During a race, radio communication is fast, noisy, emotional and safety-critical. A driver may say:

> “The rear is really unstable when I get on the throttle at Turn 2.”

An engineer must quickly understand whether this is a car-performance issue, a communication issue, or an urgent race-control event—while also watching telemetry, lap times and strategy.

There are two important communication failures:

1. **Driver → Engineer:** the driver describes a problem in natural language, often under pressure.
2. **Engineer → Driver:** the engineer may give too much information when the driver needs a short, glanceable instruction.

The project is especially relevant to radio reliability: lost acknowledgement, broken microphones, unclear audio and delayed understanding can make an already stressful situation worse.

---

## 2. Our solution

Pitwall Copilot creates a controlled, two-way radio workflow:

| Direction | What the AI does | Example output |
| --- | --- | --- |
| Driver → Engineer | Understands the message, identifies the issue and estimates the driver state | `FRUSTRATED` / `REAR SLIP` / `REAR SLIP T2` |
| Engineer → Driver | Compresses an instruction into a safe, short display phrase | `LESS CURB T2` |

The key design decision is that the driver display is **constrained to 2–3 words where possible**. The AI is not allowed to produce a long, uncontrolled instruction on the driver-facing screen.

---

## 3. Product story / user journey

The interface is deliberately designed like a modern F1 cockpit rather than a normal dashboard.

1. **Welcome page** — “Welcome to the pit wall.” The product introduces itself as F1 communication intelligence.
2. **Team selection** — the user selects Haas, Audi or McLaren. This gives the session a team identity and a visual theme.
3. **Cockpit-link experience** — a large interactive F1 steering wheel is the centre of the screen. The first message is: “Your wheel is the signal.”
4. **Scroll-to-lock interaction** — on scroll, the wheel locks into the cockpit/hood. Only when it is locked does the selected team’s radio card appear at the side.
5. **Radio desk** — clicking the final radio card opens the two-way analysis workspace.
6. **Driver and engineer workflows** — the user can choose a known demo message or type a custom radio message.

This makes the demo feel like an experience: users do not simply open a form; they enter a race communication environment.

---

## 4. Main features in the current prototype

### A. Interactive cockpit UI

- F1-inspired steering wheel built as an interactive SVG.
- Driver Radio and Engineer Radio controls are integrated into the wheel itself.
- Scroll animation transitions from a large wheel to a locked cockpit state.
- Animated team radio card includes a typing effect and moving sound-wave bars.
- Team-aware colour palette and branding for Haas, Audi and McLaren.

### B. Driver → Engineer analysis

The user enters or selects a driver message. The system returns:

- **Driver state:** for example `FRUSTRATED`, `ELEVATED`, `URGENT` or `FOCUSED`
- **Issue:** for example `REAR SLIP`, `FRONT GRIP`, `RADIO FAILURE`, `PIT REQUEST`
- **Race shorthand:** for example `REAR SLIP T2`
- **Confidence score** and the analysis provider used

Example:

```text
Input:  “The rear is sliding badly through Turn 2.”
Output: Driver state: FRUSTRATED
        Issue: REAR SLIP
        Keyword: REAR SLIP T2
```

### C. Engineer → Driver compression

The user enters or selects an engineer instruction. The system converts it into a compact driver-display command.

Example:

```text
Input:  “Take less curb at Turn 2.”
Output: LESS CURB T2
```

### D. Reliable demo inputs plus free-form input

The interface supports both:

- Predefined demonstration calls, such as “Box this lap,” “Safety car,” “I can’t hear you,” and “The front tyres are gone.”
- A custom text box, so judges can test whether the AI understands a new sentence instead of only a scripted dropdown option.

---

## 5. AI and Hugging Face architecture

```text
Radio message
      ↓
F1 reference-example retrieval
      ↓
Known match? ── Yes → structured F1 intent
      │
      No
      ↓
Hugging Face zero-shot classifier
      ↓
Safe deterministic fallback
      ↓
Constrained engineer summary / driver display keyword
```

### Hugging Face use

The project uses Hugging Face in two complementary ways:

1. **F1 reference dataset:** a local F1 radio-example knowledge base provides labelled examples of real racing language and expected outputs.
2. **Hugging Face Inference API:** uncertain/free-form messages can be classified using `facebook/bart-large-mnli`, a zero-shot natural-language classification model.

The model is asked to classify messages into controlled categories, such as:

- Driver-side: rear slip, front grip loss, radio failure, rain report, race control, blue flag, pit request
- Engineer-side: reduce curb, pit instruction, race control, blue flag, radio check

### Why this is stronger than a simple API call

The model does not directly create an unlimited instruction. The backend first uses F1-specific examples, then requests classification only when needed, and finally maps the result into an approved output format. This makes the result:

- More explainable
- More consistent for a demo
- Safer for a driver-facing display
- More grounded in F1 vocabulary

---

## 6. Backend design

The backend is a lightweight Node.js API with three endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Checks whether the radio-analysis service is running |
| `POST /api/analyse/driver` | Analyses Driver → Engineer messages |
| `POST /api/analyse/engineer` | Compresses Engineer → Driver messages |

For each request, the backend:

1. Reads the message and selected team.
2. Finds the closest F1 example using keyword similarity.
3. Uses the matching intent when confidence is high.
4. Calls Hugging Face for low-similarity/free-form cases when an API token is configured.
5. Falls back safely to deterministic rules if the service is unavailable.
6. Returns a structured JSON response, never free-form driver-facing text.

The frontend also has a local fallback, which means the hackathon demo stays usable even if the external API is unavailable.

---

## 7. Dataset contents

The current knowledge base contains labelled examples in both directions:

- Rear traction / rear slip
- Front tyre or grip loss
- Radio or microphone failure
- Rain report
- Safety car and race-control communication
- Blue flags
- Pit-stop requests and pit instructions
- Curb-use advice

Each example includes fields such as direction, original utterance, intent, driver state, engineer summary and a short driver-display command.

---

## 8. Tech stack

- **Frontend:** React + Vite
- **Visual design:** CSS animation, SVG cockpit steering wheel, Lucide icons
- **Backend:** Node.js HTTP server
- **AI:** Hugging Face Inference API with `facebook/bart-large-mnli`
- **Knowledge base:** structured JSON F1 radio examples
- **Integration:** Vite proxy routes frontend API calls to the local backend

---

## 9. Suggested live demo script

1. Open the landing page and select **Haas**.
2. Show the steering wheel cockpit. Explain: “The wheel is the signal—this is where the driver and pit wall communicate.”
3. Scroll until the wheel locks into the cockpit and the Haas Radio panel appears.
4. Click the radio panel to open the radio desk.
5. Select or type: “The rear is sliding badly through Turn 2.”
6. Show the result: `FRUSTRATED`, `REAR SLIP`, `REAR SLIP T2`.
7. Enter: “Take less curb at Turn 2.”
8. Show the driver display: `LESS CURB T2`.
9. Explain that free-form messages are checked against F1 examples first and then classified by Hugging Face when uncertain.

---

## 10. Differentiators / why this can stand out

- It is not only a chatbot; it is a complete **frontend + backend + AI** workflow.
- It solves both directions of communication rather than analysing only the driver.
- It uses a domain-specific F1 knowledge base before escalating to a general model.
- It constrains driver-facing output for clarity and safety.
- It has a polished, memorable F1 cockpit UI that makes the product easy to demonstrate.
- It remains resilient through local fallback logic.

---

## 11. Honest scope: current build vs. next phase

### Implemented now

- Text-based driver and engineer radio workflow
- F1 intent/issue extraction
- Driver-state labels
- Short command generation
- Team selection and F1-style cockpit UX
- Dataset retrieval, Hugging Face classification path and safe fallback

### Next phase

- Audio upload or live microphone capture
- Speech-to-text transcription
- Voice-tone/emotion detection for calm, stressed or tired states
- Lap-time and telemetry correlation chart
- Real team data and verified season statistics via an approved live data source
- More F1 radio examples and model evaluation metrics

Important PPT wording: describe audio mood detection and lap-time correlation as the **full product vision / next phase** unless they are added before the final demo. Do not claim they already work in the current code.

---

## 12. Closing line for the PPT

**Pitwall Copilot helps the pit wall hear what matters, understand it instantly, and send back only what the driver needs to see.**
