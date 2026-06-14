#!/usr/bin/env python3
"""Send ntfy alerts; optionally watch a Cursor terminal until a build finishes."""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path

import requests

TOPIC = "elyasaf_cursor_alerts"
DEFAULT_POLL_SECONDS = 2.0
DEFAULT_TIMEOUT_SECONDS = 4 * 60 * 60

SUCCESS_PATTERNS = (
    re.compile(r"BUILD SUCCESSFUL", re.IGNORECASE),
    re.compile(r"BUILD SUCCEEDED", re.IGNORECASE),
    re.compile(r"› Opening .+ on .+", re.IGNORECASE),
)

FAILURE_PATTERNS = (
    re.compile(r"BUILD FAILED", re.IGNORECASE),
    re.compile(r"FAILURE: Build failed", re.IGNORECASE),
    re.compile(r"Error: Unable to resolve module", re.IGNORECASE),
)


def send_notification(
    message: str = "המשימה הסתיימה בהצלחה!",
    *,
    title: str = "Cursor Update",
    priority: str = "high",
) -> bool:
    try:
        response = requests.post(
            f"https://ntfy.sh/{TOPIC}",
            data=message.encode("utf-8"),
            headers={"Title": title, "Priority": priority},
            timeout=15,
        )
        if response.status_code == 200:
            print("Notification sent!")
            return True
        print(f"Failed to send: {response.status_code}")
        return False
    except Exception as exc:
        print(f"Error: {exc}")
        return False


def resolve_terminal_path(watch: str) -> Path:
    candidate = Path(watch).expanduser()
    if candidate.is_file():
        return candidate

    name = watch if watch.endswith(".txt") else f"{watch}.txt"

    env_dir = os.environ.get("CURSOR_TERMINALS_DIR")
    if env_dir:
        env_path = Path(env_dir) / name
        if env_path.is_file():
            return env_path

    projects_root = Path.home() / ".cursor" / "projects"
    matches = sorted(
        projects_root.glob(f"*/terminals/{name}"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if matches:
        return matches[0]

    raise FileNotFoundError(
        f"Terminal file not found for {watch!r}. "
        "Pass a full path or set CURSOR_TERMINALS_DIR."
    )


def classify_build_output(text: str) -> str | None:
    for pattern in FAILURE_PATTERNS:
        if pattern.search(text):
            return "failure"
    for pattern in SUCCESS_PATTERNS:
        if pattern.search(text):
            return "success"
    return None


def watch_terminal(
    terminal_path: Path,
    *,
    poll_seconds: float = DEFAULT_POLL_SECONDS,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    notify_on_failure: bool = True,
    from_start: bool = False,
) -> int:
    print(f"Watching {terminal_path} for build completion...", flush=True)
    start = time.monotonic()
    try:
        last_size = 0 if from_start else terminal_path.stat().st_size
    except OSError as exc:
        print(f"Could not read terminal file: {exc}")
        return 1

    if not from_start:
        print("Ignoring existing terminal output; waiting for new lines only.", flush=True)

    seen_text = ""

    while True:
        if time.monotonic() - start > timeout_seconds:
            print(f"Timed out after {int(timeout_seconds)}s.")
            return 2

        try:
            content = terminal_path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            print(f"Could not read terminal file: {exc}")
            return 1

        if len(content) >= last_size:
            new_chunk = content[last_size:]
            last_size = len(content)
            seen_text = (seen_text + new_chunk)[-200_000:]
            status = classify_build_output(new_chunk)
            if status is None:
                status = classify_build_output(seen_text)

            if status == "success":
                send_notification(
                    "הבנייה הצליחה!",
                    title="Cursor Build",
                )
                return 0

            if status == "failure":
                message = "הבנייה נכשלה — בדוק את הטרמינל."
                if notify_on_failure:
                    send_notification(
                        message,
                        title="Cursor Build Failed",
                        priority="urgent",
                    )
                else:
                    print(message)
                return 1

        time.sleep(poll_seconds)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send ntfy alerts from Cursor.")
    parser.add_argument(
        "message",
        nargs="?",
        default="המשימה ב-Cursor הסתיימה!",
        help="Notification body when not using --watch",
    )
    parser.add_argument(
        "--watch",
        "-w",
        metavar="ID_OR_PATH",
        help="Watch a Cursor terminal file until the build succeeds or fails",
    )
    parser.add_argument(
        "--poll",
        type=float,
        default=DEFAULT_POLL_SECONDS,
        help=f"Poll interval in seconds (default: {DEFAULT_POLL_SECONDS})",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"Stop watching after this many seconds (default: {int(DEFAULT_TIMEOUT_SECONDS)})",
    )
    parser.add_argument(
        "--no-failure-alert",
        action="store_true",
        help="Do not send a notification when the build fails",
    )
    parser.add_argument(
        "--from-start",
        action="store_true",
        help="Scan the full terminal history instead of only new output",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])

    if args.watch:
        terminal_path = resolve_terminal_path(args.watch)
        return watch_terminal(
            terminal_path,
            poll_seconds=args.poll,
            timeout_seconds=args.timeout,
            notify_on_failure=not args.no_failure_alert,
            from_start=args.from_start,
        )

    return 0 if send_notification(args.message) else 1


if __name__ == "__main__":
    raise SystemExit(main())
