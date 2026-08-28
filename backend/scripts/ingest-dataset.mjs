import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ingestDataset() {
  console.log("Fetching dataset from Hugging Face API...");
  const response = await fetch("https://datasets-server.huggingface.co/rows?dataset=MikCil%2Ff1-team-radio&config=default&split=train&offset=0&length=50");
  const data = await response.json();
  
  if (!data.rows) {
    console.error("Failed to fetch data", data);
    return;
  }
  
  const mapped = data.rows.map(row => {
    const r = row.row;
    
    // Very basic heuristic for intent and direction since the dataset doesn't have labels natively
    const text = (r.transcription || "").toLowerCase();
    let intent = "other";
    let direction = "driver_to_engineer";
    
    if (text.includes("box") || text.includes("pit")) intent = "pit request";
    if (text.includes("tyre") || text.includes("tire")) intent = "tyre wear";
    if (text.includes("blue flag")) intent = "blue flag";
    if (text.includes("push")) { intent = "instruction"; direction = "engineer_to_driver"; }
    
    return {
      utterance: r.transcription,
      direction: direction,
      intent: intent,
      team: "Unknown (Driver " + r.driver_id + ")"
    };
  }).filter(r => r.utterance);

  const outPath = path.join(__dirname, '..', 'data', 'hf-slice.json');
  writeFileSync(outPath, JSON.stringify(mapped, null, 2));
  console.log(`Saved ${mapped.length} examples to ${outPath}`);
}

ingestDataset().catch(console.error);
