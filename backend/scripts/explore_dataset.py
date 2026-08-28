from datasets import load_dataset
import json

print("Loading dataset...")
ds = load_dataset("MikCil/f1-team-radio", split="train")

print(f"Total rows: {len(ds)}")
print("\nFirst 3 rows:")
for i in range(3):
    print(json.dumps(ds[i], indent=2, default=str))
