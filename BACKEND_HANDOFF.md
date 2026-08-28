# Pitwall Copilot — Backend Handoff

This document is the starting point for the backend work. The frontend is already connected to the API contract described below, so backend changes should preserve these routes and response fields unless we agree on a coordinated update.

## 1. Current repository layout

```text
Pitwall Copilot/
├── frontend/                 # React + Vite cockpit interface
│   ├── src/
│   ├── vite.config.js        # Proxies /api to localhost:8787
│   └── package.json
├── backend/                  # Node.js radio-analysis service
│   ├── server.mjs
│   ├── data/f1-radio-examples.json
│   └── package.json
├── package.json              # Root workspace commands
└── package-lock.json
```

The backend is intentionally independent from the frontend. It can eventually be deployed as its own service or converted into serverless functions without changing the UI folder.

## 2. Run the project locally

From the repository root:

```bash
npm install
```

Start the frontend in one terminal:

```bash
npm run dev
```

Start the backend in a second terminal:

```bash
npm run server
```

The API listens on `http://localhost:8787`. Vite forwards browser requests beginning with `/api` to that address. The frontend still has a local fallback if the API is unavailable.

You can also run each workspace directly:

```bash
npm --workspace frontend run dev
npm --workspace backend run start
```

## 3. Current backend behavior

`backend/server.mjs` currently does three things:

1. Validates and receives a radio message.
2. Retrieves the closest example from `backend/data/f1-radio-examples.json` using lightweight word similarity.
3. Falls back to deterministic F1 rules, or calls Hugging Face zero-shot classification when `HF_API_TOKEN` is configured.

The output is deliberately constrained to the communication format used by the cockpit UI. The driver display receives a short keyword, not unrestricted model text.

## 4. API contract

### Health check

```http
GET /api/health
```

Example response:

```json
{
  "ok": true,
  "examples": 11,
  "model": "facebook/bart-large-mnli"
}
```

### Driver → Engineer

```http
POST /api/analyse/driver
Content-Type: application/json
```

Request:

```json
{
  "message": "The rear is sliding badly through Turn 2",
  "team": "Haas"
}
```

Response shape:

```json
{
  "state": "FRUSTRATED",
  "issue": "REAR SLIP",
  "keyword": "REAR SLIP T2",
  "confidence": 0.92,
  "direction": "driver_to_engineer",
  "team": "Haas",
  "original": "The rear is sliding badly through Turn 2",
  "matchedExample": "...",
  "retrievalScore": 0.31,
  "provider": "hub-dataset-retrieval"
}
```

### Engineer → Driver

```http
POST /api/analyse/engineer
Content-Type: application/json
```

Request:

```json
{
  "message": "Take less curb at Turn 2",
  "team": "Haas"
}
```

The important field for the driver-facing display is `keyword`, for example `LESS CURB T2`, `BOX THIS LAP`, or `SAFETY CAR`.

## 5. Hugging Face integration plan

The current JSON file is a small local reference set. The next backend milestone is to use the full Hugging Face dataset:

`MikCil/f1-team-radio`

Recommended progression:

### Phase A — Dataset ingestion

- Load the dataset with the Hugging Face `datasets` library.
- Inspect its transcription, audio, driver/team, session, and direction fields.
- Create a normalized table containing `utterance`, `direction`, `intent`, `team`, and optional audio metadata.
- Keep a small checked-in evaluation set for repeatable testing.

### Phase B — Text intent classification

- Start with retrieval: embed or compare the incoming transcription against dataset examples.
- Add intent labels such as `rear_slip`, `front_grip`, `radio_failure`, `pit_request`, `safety_car`, and `blue_flag`.
- Use a Hugging Face classifier or fine-tuned model when retrieval confidence is low.
- Preserve the deterministic fallback for demos and offline use.

### Phase C — Voice input

The eventual request flow is:

```text
Browser microphone
    ↓ audio blob
Speech-to-text model (Whisper on Hugging Face)
    ↓ transcription
F1 intent / issue classifier
    ↓ constrained communication object
Frontend engineer view + driver keyword display
```

For the first working version, accept a short uploaded audio file or browser `MediaRecorder` blob. Do not train an audio model from scratch. Use a Hugging Face Whisper checkpoint for transcription, then reuse the text classifier pipeline.

## 6. Output safety and product rules

- Never send unrestricted generated text directly to the driver display.
- Always map model output to an allowlisted intent and a two- or three-word keyword.
- Return a confidence score and provider name for debugging and the demo.
- Keep the original transcription visible to the engineer for verification.
- If confidence is low, return `REVIEW RADIO` and ask for confirmation.
- Do not present stress or mood detection as a medical or psychological diagnosis; label it as an operational signal.

## 7. Suggested work split

### Backend owner

- Dataset ingestion and normalization.
- `/api/analyse/*` service layer.
- Hugging Face model integration.
- Audio upload/transcription endpoint.
- Unit tests for intent mapping and keyword constraints.

### Frontend owner

- Microphone permission and recording control.
- Upload/recording progress states.
- Engineer interpretation panel and driver display states.
- Error, low-confidence, and offline fallback states.
- Demo polish and end-to-end testing against the API.

## 8. Recommended next milestones

1. Add a backend `lib/` or `src/` service module so `server.mjs` only handles HTTP.
2. Add tests for the existing deterministic rules and response schema.
3. Load and label a small slice of `MikCil/f1-team-radio`.
4. Add a `POST /api/transcribe` endpoint for audio files.
5. Connect browser microphone capture to transcription and then classification.
6. Add a real evaluation table: intent accuracy, keyword validity, confidence, and latency.
7. Deploy the backend separately and set the frontend API base URL through an environment variable.

## 9. Git workflow

Keep backend work isolated and easy to review:

```bash
git switch -c backend/radio-classifier
git add backend BACKEND_HANDOFF.md package.json package-lock.json README.md
git commit -m "Start backend workspace and radio API handoff"
git push -u origin backend/radio-classifier
```

Before opening a pull request, run:

```bash
npm run build
node --check backend/server.mjs
```

The key principle for the next stage is: Hugging Face can provide the transcription/classification intelligence, but our backend owns the F1-specific context, confidence handling, and strict communication format.
