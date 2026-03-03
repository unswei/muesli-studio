#!/usr/bin/env python3
"""Validate mbt.evt.v1 JSONL logs against the runtime-contract schema."""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Iterable


DEFAULT_SCHEMA = pathlib.Path("schemas/event_log/v1/mbt.evt.v1.schema.json")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate mbt.evt.v1 JSONL logs.")
    parser.add_argument(
        "--schema",
        default=str(DEFAULT_SCHEMA),
        help=f"Path to JSON Schema file (default: {DEFAULT_SCHEMA}).",
    )
    parser.add_argument("logs", nargs="+", help="One or more JSONL log files.")
    return parser.parse_args(argv)


def load_json(path: pathlib.Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - CLI error path
        raise RuntimeError(f"failed to load JSON from {path}: {exc}") from exc


def iter_lines(path: pathlib.Path) -> Iterable[tuple[int, str]]:
    with path.open("r", encoding="utf-8") as handle:
        for idx, line in enumerate(handle, start=1):
            text = line.strip()
            if not text:
                continue
            yield idx, text


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    schema_path = pathlib.Path(args.schema)
    if not schema_path.is_file():
        print(f"error: schema file not found: {schema_path}", file=sys.stderr)
        return 2

    try:
        from jsonschema import Draft202012Validator
    except ImportError:
        print(
            "error: jsonschema is required. Install with: python3 -m pip install jsonschema",
            file=sys.stderr,
        )
        return 2

    try:
        schema = load_json(schema_path)
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)
    except Exception as exc:
        print(f"error: invalid JSON Schema {schema_path}: {exc}", file=sys.stderr)
        return 2

    had_error = False
    for log_arg in args.logs:
        log_path = pathlib.Path(log_arg)
        if not log_path.is_file():
            print(f"error: log file not found: {log_path}", file=sys.stderr)
            had_error = True
            continue

        for line_no, text in iter_lines(log_path):
            try:
                event = json.loads(text)
            except json.JSONDecodeError as exc:
                print(f"error: {log_path}:{line_no}: invalid JSON: {exc}", file=sys.stderr)
                had_error = True
                continue

            schema_version = event.get("schema")
            if schema_version != "mbt.evt.v1":
                print(
                    f"error: {log_path}:{line_no}: unsupported schema '{schema_version}', expected 'mbt.evt.v1'",
                    file=sys.stderr,
                )
                had_error = True
                continue

            errors = sorted(validator.iter_errors(event), key=lambda e: e.path)
            if errors:
                for err in errors:
                    path = ".".join(str(p) for p in err.absolute_path) or "<root>"
                    print(f"error: {log_path}:{line_no}: {path}: {err.message}", file=sys.stderr)
                had_error = True

    if had_error:
        return 1

    print("event log validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
