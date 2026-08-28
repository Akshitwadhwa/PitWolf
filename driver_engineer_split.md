# F1 Speaker Segmentation & Dataset Ingestion Design

This document details the strategy, heuristics, and algorithmic rules for splitting mixed driver/engineer transcripts and training our classification pipeline to differentiate speaker roles.

---

## 1. The Challenge of Mixed Transcripts
In the Hugging Face `f1-team-radio` dataset, many entries contain concatenated dialogues (e.g. Driver feedback followed by Engineer instructions, or vice-versa) in a single string. 

**Example Row:**
> *"There's a lot of liquid coming out the back of the car. Okay, copy. Okay, Lewis, so we are getting over temp on the PU, so we need to introduce some lifting coast. I need to push it to the lever right in a second."*

To train or match our models accurately, the system must separate these single records into discrete, turn-based segments and classify the active speaker. 

To achieve a representative vocabulary balance without impacting in-memory execution speeds, the ingestion pipeline will target **at least 500 and a maximum of 1,000 rows** of the raw Hugging Face dataset. This size ensures a rich diversity of both driver and engineer communication scenarios while keeping search matching times under 2ms.

---

## 2. Conversation Turn Splitting Heuristics
When parsing raw data during ingestion, the script follows a **Sentence-Level Turn Splitter**:

1. **Tokenize Sentences:** Split the paragraph into sentences using punctuation boundaries (`.`, `?`, `!`).
2. **Analyze Turns:** Evaluate each sentence against a set of lexical rules to check if the speaker has shifted.
3. **Re-Group:** Group consecutive sentences belonging to the same speaker.

### Splitting Algorithm Rules:
For each sentence, check the classification rules below. When a sentence maps to a different speaker role than the preceding one, a **Turn Split** is triggered:

```text
Message Block
     ↓
[Sentence Tokenizer]
     ↓
For each sentence:
   ├── Matches Driver Rules?   → Set Role = DRIVER
   └── Matches Engineer Rules? → Set Role = ENGINEER
     ↓
Did Role change from previous sentence?
   ├── Yes → Start a new turn segment
   └── No  → Append to current turn segment
```

---

## 3. Speaker Role Classification Logic
To decide if a sentence belongs to the **Driver** or the **Engineer**, we apply keyword patterns and grammatical indicators.

### A. Driver Identifiers (`driver_to_engineer`)
Drivers report physical conditions, request strategies, or ask biometric questions.

| Indicator Type | Grammatical/Keyword Pattern | Example Matches |
| :--- | :--- | :--- |
| **First-Person Pronouns** | Sentence contains: `\b(I|my|we)\b` | *"I have no traction"*, *"My rear is sliding"* |
| **Biometric/Car Reporting** | References to grip, tires, power, or noise | *"No power"*, *"The rear is unstable at T4"* |
| **Strategy Inquiries** | Questions containing *"do we"*, *"should we"*, *"can I"* | *"Do we box?"*, *"Should I push now?"* |
| **Complaints/Expletives** | Severe frustration or cuss words | *"This is undriveable"*, *"The car is terrible"* |

### B. Engineer Identifiers (`engineer_to_driver`)
Engineers give commands, call out driver names, or confirm radio signals.

| Indicator Type | Grammatical/Keyword Pattern | Example Matches |
| :--- | :--- | :--- |
| **Imperative Commands** | Action verbs: `\b(try|need|avoid|push|lift|coast|manage)\b` | *"Try to take less curb"*, *"We need to manage tires"* |
| **Driver Name Address** | References to known drivers | *"Copy Lewis"*, *"Lando, safety car is out"* |
| **Telemetry Commands** | Standard pit commands: `\b(box|pit|drs|ers|delta)\b` | *"Box this lap"*, *"Use boost exit"* |
| **Radio Acknowledgement** | Confirmation statements | *"Okay, copy"*, *"Understood"*, *"Radio check"* |

---

## 4. Example Output Segmentation
Using the example row from Section 1, the parser splits and categorizes the text into three separate records in the dataset:

*   **Turn 1:**
    *   **Text:** *"There's a lot of liquid coming out the back of the car."*
    *   **Reasoning:** Matches "back of the car" / reporting car state.
    *   **Classified Direction:** `driver_to_engineer`
*   **Turn 2:**
    *   **Text:** *"Okay, copy. Okay, Lewis, so we are getting over temp on the PU, so we need to introduce some lifting coast."*
    *   **Reasoning:** Matches "Okay, copy", addresses driver "Lewis", commands "need to introduce lifting coast".
    *   **Classified Direction:** `engineer_to_driver`
*   **Turn 3:**
    *   **Text:** *"I need to push it to the lever right in a second."*
    *   **Reasoning:** Starts with first-person "I need to...".
    *   **Classified Direction:** `driver_to_engineer`

---

## 5. In-Memory Search & Fallback Pipeline
Once the dataset is split and saved into `hf-slice.json`, the matching model works as follows during live operation:

1. **Context Filter:** When the user presses the **Driver** or **Engineer** microphone, the frontend calls the corresponding API route, constraining the backend search to only match rows of that `direction`.
2. **Text Similarity (Local Search):** The backend computes a cosine similarity score. If it matches a split dataset sentence with a score $\ge 0.28$, it instantly resolves the telemetry intent.
3. **Zero-Shot Classification (Fallback):** If no match is found, the zero-shot classifier runs using role-specific labels to prevent crossing driver vs. engineer contexts.
