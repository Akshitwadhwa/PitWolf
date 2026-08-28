# Pitwall Copilot

Pitwall Copilot is an F1 communication intelligence interface for the pit wall. It turns driver and engineer radio messages into concise, race-ready information while keeping the experience grounded in an immersive cockpit UI.

## Live demo

[Open Pitwall Copilot on Vercel](https://pitwall-copilot.vercel.app)

The frontend is deployed on Vercel. The backend can be run locally during development and is the next service to deploy independently.

## What is included

- Cinematic F1 welcome screen with an animated background video.
- Team selection for Haas, Audi, and McLaren.
- Team-specific car imagery, driver profiles, season briefing, points, championship position, podiums, and race rounds.
- Driver photos and radio-channel styling for the selected team.
- Animated cockpit sequence with an interactive steering wheel and team radio signal panel.
- Driver → Engineer and Engineer → Driver communication modes.
- Predefined radio demonstrations plus free-form message input.
- Engineer-side interpretation showing driver state, issue, keyword, confidence, original message, and analysis provider.
- Driver-facing output constrained to short two- or three-word commands such as `REAR SLIP T2`, `LESS CURB T2`, and `BOX THIS LAP`.
- Local fallback rules so the demo remains usable when the API or Hugging Face is unavailable.
- One-shot radio ambience that follows the team-selection and cockpit flow.

## Repository structure

```text
Pitwall Copilot/
├── frontend/                    # React + Vite cockpit interface
│   ├── src/
│   │   ├── App.jsx
│   │   ├── styles.css
│   │   ├── overrides.css
│   │   └── assets/
│   ├── index.html
│   ├── vite.config.js            # /api proxy for local backend
│   └── package.json
├── backend/                     # Node.js radio-analysis API
│   ├── server.mjs
│   ├── data/f1-radio-examples.json
│   └── package.json
├── BACKEND_HANDOFF.md            # Backend implementation plan and API contract
├── package.json                  # Root workspace commands
└── package-lock.json
```

## Run locally

From the repository root:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Start the API in a second terminal:

```bash
npm run server
```

The frontend runs on Vite and proxies `/api` requests to `http://127.0.0.1:8787`. The API listens on port `8787` by default. To change it:

```bash
PORT=9000 npm run server
```

Useful checks:

```bash
npm run build
node --check backend/server.mjs
```

## Radio-analysis API

### Health check

```http
GET /api/health
```

### Driver → Engineer

```http
POST /api/analyse/driver
Content-Type: application/json
```

```json
{
  "message": "The rear is sliding badly through Turn 2",
  "team": "Haas"
}
```

### Engineer → Driver

```http
POST /api/analyse/engineer
Content-Type: application/json
```

```json
{
  "message": "Take less curb at Turn 2",
  "team": "Haas"
}
```

The response includes `state`, `issue`, `keyword`, `confidence`, `direction`, `team`, `original`, `matchedExample`, `retrievalScore`, and `provider`. The frontend uses `keyword` for the driver display and the remaining fields for engineer-side context.

## Hugging Face integration

The current service uses the checked-in examples at `backend/data/f1-radio-examples.json` for F1-aware retrieval and deterministic rules for reliable demo behavior. When an API token is present, low-similarity messages are sent to the Hugging Face zero-shot classifier `facebook/bart-large-mnli`:

```bash
HF_API_TOKEN=your_token npm run server
```

The planned voice pipeline is:

```text
Microphone or uploaded audio
        ↓
Hugging Face Whisper transcription
        ↓
F1 radio intent / issue classification
        ↓
Constrained communication object
        ↓
Engineer interpretation + driver keyword
```

The project will use the Hugging Face dataset [MikCil/f1-team-radio](https://huggingface.co/datasets/MikCil/f1-team-radio) as the larger source of F1 radio examples and training/evaluation data. See [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md) for the implementation plan.

## Vercel deployment

The current Vercel deployment serves the Vite frontend from the `frontend` workspace. For a fresh Vercel project, set:

- **Root Directory:** `frontend`
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm install`

The production frontend is available at [pitwall-copilot.vercel.app](https://pitwall-copilot.vercel.app). When the backend is deployed separately, configure the frontend API base URL to point to that service and enable the required CORS origin.

## Output safety

The model never writes unrestricted text directly to the driver-facing display. Backend responses are mapped to an allowlisted intent and a short keyword. Low-confidence messages return a review state so an engineer can verify the interpretation.

## Next backend milestones

1. Move the HTTP handlers into testable backend service modules.
2. Load and normalize a slice of the Hugging Face radio dataset.
3. Add repeatable intent and keyword-constraint tests.
4. Add audio upload and Whisper transcription.
5. Connect browser microphone capture to transcription and classification.
6. Deploy the backend independently and connect it to the Vercel frontend.
