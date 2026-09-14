"""Standalone evaluation harness for the RAG pipeline's retrieval and answer quality.

This is a dev tool, not part of the automated pytest suite: it calls the real
OpenAI API (embeddings, the chat model, and a judge call per question), so it
costs a small amount of money and requires OPENAI_API_KEY to be set.

    python eval/run_eval.py
"""

import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402
from langchain_core.messages import HumanMessage, SystemMessage  # noqa: E402

from eval.golden_set import GOLDEN_SET  # noqa: E402
from src.llm import get_chat_model  # noqa: E402
from src.rag import RAGPipeline  # noqa: E402

load_dotenv()

SAMPLE_DIR = PROJECT_ROOT / "data" / "sample"
EVAL_PERSIST_DIR = PROJECT_ROOT / "eval_chroma_db"

JUDGE_PROMPT = """You are grading a RAG system's answer against a rubric.

Question: {question}
Rubric: {criteria}
Answer given: {answer}

Reply with exactly one word: PASS or FAIL."""


def judge_answer(question: str, criteria: str, answer: str) -> bool:
    model = get_chat_model()
    response = model.invoke(
        [
            SystemMessage(content="You are a strict, terse grading assistant."),
            HumanMessage(
                content=JUDGE_PROMPT.format(question=question, criteria=criteria, answer=answer)
            ),
        ]
    )
    return response.content.strip().upper().startswith("PASS")


def main() -> None:
    shutil.rmtree(EVAL_PERSIST_DIR, ignore_errors=True)
    pipeline = RAGPipeline(persist_dir=EVAL_PERSIST_DIR)

    sample_files = sorted(
        str(p) for p in SAMPLE_DIR.glob("*") if p.suffix in {".pdf", ".txt", ".csv"}
    )
    pipeline.ingest(sample_files)

    retrieval_checked = 0
    retrieval_hits = 0
    answer_passes = 0

    print(f"Running eval over {len(GOLDEN_SET)} questions...\n")
    for case in GOLDEN_SET:
        result = pipeline.answer(case["question"])
        retrieved_sources = {s["source"] for s in result.sources}

        retrieval_note = "n/a"
        if case["expect_answerable"]:
            retrieval_checked += 1
            hit = case["expected_source"] in retrieved_sources
            retrieval_hits += hit
            retrieval_note = "HIT" if hit else "MISS"

        passed = judge_answer(case["question"], case["answer_criteria"], result.answer)
        answer_passes += passed

        print(f"- {case['question']}")
        print(f"  retrieval: {retrieval_note} | answer: {'PASS' if passed else 'FAIL'}")
        print(f"  answer given: {result.answer[:150]}")
        print()

    print("=" * 60)
    if retrieval_checked:
        pct = 100 * retrieval_hits / retrieval_checked
        print(f"Retrieval hit-rate:  {retrieval_hits}/{retrieval_checked} ({pct:.0f}%)")
    pct = 100 * answer_passes / len(GOLDEN_SET)
    print(f"Answer quality:      {answer_passes}/{len(GOLDEN_SET)} ({pct:.0f}%)")

    shutil.rmtree(EVAL_PERSIST_DIR, ignore_errors=True)


if __name__ == "__main__":
    main()
