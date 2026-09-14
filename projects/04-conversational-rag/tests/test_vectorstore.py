from langchain_core.documents import Document

from src.vectorstore import filter_by_relevance


def test_filter_by_relevance_drops_low_scores():
    scored = [
        (Document(page_content="a", metadata={"chunk_id": "a#0"}), 0.9),
        (Document(page_content="b", metadata={"chunk_id": "b#0"}), 0.1),
    ]

    kept = filter_by_relevance(scored, threshold=0.25)

    assert [d.metadata["chunk_id"] for d in kept] == ["a#0"]


def test_filter_by_relevance_none_threshold_keeps_everything():
    scored = [
        (Document(page_content="a", metadata={}), 0.9),
        (Document(page_content="b", metadata={}), 0.01),
    ]

    kept = filter_by_relevance(scored, threshold=None)

    assert len(kept) == 2


def test_filter_by_relevance_empty_when_nothing_clears_bar():
    scored = [(Document(page_content="a", metadata={}), 0.1)]

    kept = filter_by_relevance(scored, threshold=0.5)

    assert kept == []
