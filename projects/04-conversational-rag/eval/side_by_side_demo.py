"""Proves query rewriting matters, rather than just asserting it: the same
follow-up question, answered with and without resolving it against
conversation history first.

Not part of the automated test suite — this makes real API calls and costs
a few cents. Requires OPENAI_API_KEY.

    python eval/side_by_side_demo.py
"""

import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402
from langchain_core.messages import HumanMessage, SystemMessage  # noqa: E402

from src.rag import SYSTEM_PROMPT, ConversationalRAGPipeline  # noqa: E402
from src.vectorstore import search_relevant  # noqa: E402

load_dotenv()

SAMPLE_DIR = PROJECT_ROOT / "data" / "sample"
EVAL_PERSIST_DIR = PROJECT_ROOT / "eval_chroma_db"

FIRST_QUESTION = "What is Northwind Robotics' remote work policy?"
FOLLOW_UP = "How many days is that per week?"


def answer_without_rewriting(pipeline: ConversationalRAGPipeline, question: str):
    """Runs retrieval directly on the raw follow-up, the way a non-
    conversational RAG pipeline (no history awareness at all) would. Reaches
    into the pipeline's internals deliberately — this bypass has no reason
    to exist in the real public API, only in this side-by-side comparison.
    """
    retrieved = search_relevant(pipeline._vectorstore, question, pipeline.top_k, pipeline.score_threshold)
    if not retrieved:
        return "I don't have enough information in the provided documents to answer that.", []

    context = "\n\n".join(f"[{d.metadata.get('chunk_id')}]\n{d.page_content}" for d in retrieved)
    response = pipeline._get_chat_model().invoke(
        [
            SystemMessage(content=SYSTEM_PROMPT.format(context=context)),
            HumanMessage(content=question),
        ]
    )
    return response.content, [d.metadata.get("chunk_id") for d in retrieved]


def main() -> None:
    shutil.rmtree(EVAL_PERSIST_DIR, ignore_errors=True)
    pipeline = ConversationalRAGPipeline(persist_dir=EVAL_PERSIST_DIR)

    sample_files = sorted(
        str(p) for p in SAMPLE_DIR.glob("*") if p.suffix in {".pdf", ".txt", ".csv"}
    )
    pipeline.ingest(sample_files)

    print(f"Turn 1: {FIRST_QUESTION}")
    turn1 = pipeline.ask(FIRST_QUESTION)
    print(f"  -> {turn1.answer}\n")

    print(f"Turn 2 (follow-up): {FOLLOW_UP!r}\n")

    print("=" * 70)
    print("WITHOUT query rewriting — raw follow-up sent straight to retrieval:")
    naive_answer, naive_sources = answer_without_rewriting(pipeline, FOLLOW_UP)
    print(f"  retrieved chunks: {naive_sources}")
    print(f"  answer: {naive_answer}")

    print()
    print("WITH query rewriting — this project's actual behavior:")
    turn2 = pipeline.ask(FOLLOW_UP)
    print(f"  rewritten to: {turn2.standalone_question!r}")
    print(f"  retrieved chunks: {[s['chunk_id'] for s in turn2.sources]}")
    print(f"  answer: {turn2.answer}")
    print("=" * 70)

    shutil.rmtree(EVAL_PERSIST_DIR, ignore_errors=True)


if __name__ == "__main__":
    main()
