import argparse
import json
import time

import fastf1

from fetch_f1_session import CACHE_DIR, build_session_payload, session_names

CACHE_ROOT = CACHE_DIR.parent


def session_file(year, round_number, session_name):
    slug = session_name.lower().replace(' ', '_')
    return CACHE_ROOT / 'sessions' / str(year) / f'{round_number}_{slug}.json'


def is_rate_limited(error):
    text = str(error)
    return 'calls/h' in text or '429' in text or 'has not been loaded yet' in text


def fetch_with_retry(task, attempts=6):
    year, round_number, session_name = task
    target = session_file(year, round_number, session_name)
    if target.exists():
        return 'skip'
    delay = 3
    for attempt in range(attempts):
        try:
            payload = build_session_payload(year, round_number, session_name)
            if not payload.get('laps'):
                raise RuntimeError('session loaded with no laps')
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_name(target.name + '.tmp')
            tmp.write_text(json.dumps(payload))
            tmp.replace(target)
            time.sleep(2)
            return 'ok'
        except Exception as error:
            if attempt == attempts - 1:
                print(f'FAIL {task}: {error}', flush=True)
                return 'fail'
            if is_rate_limited(error):
                time.sleep(120)
            else:
                time.sleep(delay)
                delay *= 2


def wait_for_ondemand():
    lock = CACHE_ROOT / '.ondemand.lock'
    while lock.exists():
        try:
            if time.time() - lock.stat().st_mtime > 600:
                lock.unlink()
                break
        except OSError:
            break
        time.sleep(5)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start-year', type=int, default=2018)
    parser.add_argument('--end-year', type=int, default=2025)
    args = parser.parse_args()

    fastf1.set_log_level('ERROR')
    fastf1.Cache.enable_cache(str(CACHE_DIR))

    tasks = []
    for year in range(args.start_year, args.end_year + 1):
        schedule = fastf1.get_event_schedule(year, include_testing=False)
        for _, row in schedule.iterrows():
            for name in session_names(row):
                tasks.append((year, int(row['RoundNumber']), name))

    counts = {'ok': 0, 'skip': 0, 'fail': 0}
    started = time.time()
    for index, task in enumerate(tasks, 1):
        wait_for_ondemand()
        status = fetch_with_retry(task)
        counts[status] += 1
        if status != 'skip':
            print(f'[{index}/{len(tasks)}] {status} {task[0]} R{task[1]} {task[2]} ({time.time() - started:.0f}s)', flush=True)
    print(f'SUMMARY {args.start_year}-{args.end_year} ok={counts["ok"]} skip={counts["skip"]} fail={counts["fail"]}', flush=True)


if __name__ == '__main__':
    main()
