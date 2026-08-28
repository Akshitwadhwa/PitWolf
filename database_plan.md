# Database Implementation Plan: Pitwall Copilot History

The goal is to persist all live telemetry, driver biometrics, and the complete AI conversation history (driver speech, AI responses, engineer overrides) into a database. This allows for post-race analysis and keeps a historical record of the driver's state.

## The Architecture: Supabase (PostgreSQL)

Because the system needs to integrate with a massive warehouse of **10-20 years of historical race data**, a simple local file is not sufficient. We will build this using a centralized cloud database architecture (like **Supabase / PostgreSQL**).

**How it works:**
* The Pitwall Copilot will act as a client that connects to this massive central database to read historical datasets and write new live telemetry/logs.
* **Data Privacy:** To ensure that teams cannot see each other's data in the cloud, the database will use **Row-Level Security (RLS)**. This is a multi-tenant architecture where every row of data is tagged with a `team_id`. The database strictly rejects any query trying to read or write data that doesn't belong to the authenticated team.

---

## Proposed Data Schema

We will need three primary tables to store the relational data:

### 1. `Sessions`
Stores the metadata for the specific race simulation.
* `id` (Primary Key)
* `team_id` (Foreign Key) - *Crucial for Row-Level Security to ensure McLaren can't see Ferrari's data.*
* `circuit_name` (e.g., BAHRAIN / 2023)
* `driver_name` (e.g., Lando Norris)
* `created_at` (Timestamp)

### 2. `Telemetry_Snapshots`
Logs the state of the car and driver at specific points in time.
* `id` (Primary Key)
* `session_id` (Foreign Key -> Sessions)
* `timestamp` 
* `lap_number`
* `cockpit_temp`
* `track_temp`
* `g_force`
* `hydration_pct`
* `psi_score`
* `heart_rate`
* `breathing_rate`

### 3. `Radio_Logs`
Stores the exact timeline of communication and the AI's classification.
* `id` (Primary Key)
* `session_id` (Foreign Key -> Sessions)
* `telemetry_id` (Foreign Key -> Telemetry_Snapshots) - *Links the radio message to the exact car state when it was spoken.*
* `timestamp`
* `role` (driver | engineer | ai)
* `transcript` (The actual text spoken)
* `detected_mood` (e.g., CALM, ANGRY)
* `fused_issue` (e.g., CRITICAL HEALTH RISK, DRIVER DISTRESS)

---

## Step-by-Step Implementation Plan

### Phase 1: Database Setup
1. Install the database driver in the `backend/` folder (e.g., `npm install better-sqlite3`).
2. Create a database initialization script to automatically generate the `Sessions`, `Telemetry_Snapshots`, and `Radio_Logs` tables if they don't exist.

### Phase 2: Backend API Endpoints
1. Modify `server.mjs` to add a new `POST /api/history/start-session` route.
2. Add a `POST /api/history/log-event` route. This route will accept a combined JSON payload of the current telemetry and the radio message, and insert them into their respective tables.

### Phase 3: Frontend Integration (`App.jsx`)
1. When the user clicks "Start Lap", ping the backend to create a new `Session`.
2. Inside `handleDriverUp` and `handleEngineerUp`, right after we update `setConversationLog`, we will fire off an async fetch request to the backend to permanently save that entry along with the current `stressMetrics`.

### Phase 4: History Viewer (Optional Future Step)
1. Build a new page or tab in the UI called "Post-Race Analysis".
2. Fetch data from `GET /api/history/sessions` to let you review previous runs, read the transcripts, and see how the driver's PSI evolved over the race.

## User Action Required
**Please review this plan and let me know:**
1. Do you agree with using Local SQLite to keep it simple, or do you explicitly want to set up Supabase?
2. Does the data schema capture everything you want to save?

Click **Proceed** if you want me to start writing the code for this!
