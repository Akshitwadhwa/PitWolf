import argparse
import json

import fastf1

from fetch_f1_session import CACHE_DIR, clean, session_names


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, required=True)
    args = parser.parse_args()

    fastf1.set_log_level('ERROR')
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    schedule = fastf1.get_event_schedule(args.year, include_testing=False)

    events = []
    for _, row in schedule.iterrows():
        event_date = clean(row.get('EventDate'))
        events.append({
            'round': int(row['RoundNumber']),
            'name': row['EventName'],
            'officialName': row['OfficialEventName'],
            'country': row['Country'],
            'location': row['Location'],
            'date': str(event_date.date()) if event_date is not None else None,
            'sessions': session_names(row),
        })

    print(json.dumps({'year': args.year, 'events': events}))


if __name__ == '__main__':
    import sys
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        raise SystemExit(1)
