"""Create a compact 2019+ metadata source from the Hugging Face F1 radio Parquet files.

The query projects only text and race metadata. It deliberately does not download
the audio column; audio is used later when we add the audio-cleaning pipeline.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import duckdb


PARQUET_URLS = [
    f"https://huggingface.co/datasets/MikCil/f1-team-radio/resolve/refs%2Fconvert%2Fparquet/default/train/{index:04d}.parquet"
    for index in range(5)
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-year", type=int, default=2019)
    parser.add_argument("--limit", type=int, default=1400)
    parser.add_argument(
        "--output",
        default=str(Path(__file__).resolve().parents[1] / "data" / "f1-radio-raw-2019.json"),
    )
    args = parser.parse_args()

    # A per race-driver cap makes the candidate pool varied before the Node
    # turn splitter applies its own final 1,000-row diversity selection.
    connection = duckdb.connect()
    urls = ", ".join(repr(url) for url in PARQUET_URLS)
    query = f"""
        WITH eligible AS (
          SELECT
            id, driver_id, racing_number, grand_prix, race_id,
            session_date, message_timestamp, transcription,
            row_number() OVER (
              PARTITION BY substr(session_date, 1, 4), grand_prix, driver_id
              ORDER BY hash(id)
            ) AS group_rank
          FROM read_parquet([{urls}], union_by_name = true)
          WHERE session_date >= '{args.from_year}-01-01'
            AND length(trim(transcription)) >= 8
        )
        SELECT id, driver_id, racing_number, grand_prix, race_id,
               session_date, message_timestamp, transcription
        FROM eligible
        WHERE group_rank <= 5
        ORDER BY hash(id)
        LIMIT {args.limit}
    """
    print(f"Querying 2019+ F1 radio metadata; target candidate pool: {args.limit} rows")
    rows = connection.execute(query).fetchall()
    columns = [item[0] for item in connection.description]
    payload = [dict(zip(columns, row)) for row in rows]

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Saved {len(payload)} metadata rows to {output}")


if __name__ == "__main__":
    main()
