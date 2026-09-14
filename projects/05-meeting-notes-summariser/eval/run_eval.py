"""Standalone evaluation harness — not part of pytest, since it calls the
real OpenAI API and costs a small amount of money. Requires OPENAI_API_KEY.

    python eval/run_eval.py

Checks two different things:
1. Extraction quality: were the actual decisions/action items captured?
2. No-hallucination: on the transcript with a deliberately unassigned
   action item, did the model correctly leave it unassigned rather than
   inventing an owner or date?
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

from eval.golden_set import GOLDEN_SET  # noqa: E402
from src.grounding import check_grounding  # noqa: E402
from src.summarize import Summarizer  # noqa: E402

load_dotenv()

TRANSCRIPTS_DIR = PROJECT_ROOT / "data" / "sample_transcripts"


def check_decisions(summary, expected_keywords) -> bool:
    all_text = " ".join(d.description.lower() for d in summary.key_decisions)
    return any(kw.lower() in all_text for kw in expected_keywords)


def check_action_items(summary, expected_items) -> list[bool]:
    results = []
    for expected in expected_items:
        found = any(
            item.owner
            and expected["owner_contains"] in item.owner.lower()
            and item.due_date
            and expected["due_date_contains"] in item.due_date.lower()
            for item in summary.action_items
        )
        results.append(found)
    return results


def check_unassigned_item_exists(summary) -> bool:
    return any(item.owner is None and item.due_date is None for item in summary.action_items)


def main() -> None:
    summarizer = Summarizer()
    total_checks = 0
    passed_checks = 0

    for case in GOLDEN_SET:
        transcript = (TRANSCRIPTS_DIR / case["transcript_file"]).read_text()
        summary = summarizer.summarize(transcript)
        warnings = check_grounding(summary, transcript)

        print(f"\n{'=' * 70}\n{case['transcript_file']}\n{'=' * 70}")
        print(f"Summary: {summary.summary}")
        print(f"Decisions: {[d.description for d in summary.key_decisions]}")
        for item in summary.action_items:
            print(f"  - {item.description} | owner={item.owner!r} due={item.due_date!r}")
        if warnings:
            print(f"Grounding warnings: {[w.reason for w in warnings]}")

        decision_ok = check_decisions(summary, case["expected_decision_keywords"])
        total_checks += 1
        passed_checks += decision_ok
        print(f"[{'PASS' if decision_ok else 'FAIL'}] expected decision keywords found")

        if "expected_action_items" in case:
            item_results = check_action_items(summary, case["expected_action_items"])
            for expected, ok in zip(case["expected_action_items"], item_results):
                total_checks += 1
                passed_checks += ok
                label = f"{expected['owner_contains']} / {expected['due_date_contains']}"
                print(f"[{'PASS' if ok else 'FAIL'}] action item matched: {label}")

        if case.get("expect_an_unassigned_action_item"):
            unassigned_ok = check_unassigned_item_exists(summary)
            total_checks += 1
            passed_checks += unassigned_ok
            print(f"[{'PASS' if unassigned_ok else 'FAIL'}] an unassigned action item was correctly left unassigned")

        grounding_ok = len(warnings) == 0
        total_checks += 1
        passed_checks += grounding_ok
        print(f"[{'PASS' if grounding_ok else 'FAIL'}] no grounding warnings")

    print(f"\n{'=' * 70}")
    print(f"Total: {passed_checks}/{total_checks} checks passed ({100 * passed_checks / total_checks:.0f}%)")


if __name__ == "__main__":
    main()
