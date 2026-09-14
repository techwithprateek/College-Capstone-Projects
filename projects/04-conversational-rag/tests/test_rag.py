from langchain_core.documents import Document

from src.rag import NOT_INDEXED_MESSAGE, NO_MATCH_MESSAGE, ConversationalRAGPipeline

from .fakes import FakeChatModel, FakeEmbeddings


def test_answer_before_ingest_does_not_call_the_llm(monkeypatch, tmp_path):
    monkeypatch.setattr("src.rag.get_chat_model", lambda: FakeChatModel(responses=[]))
    pipeline = ConversationalRAGPipeline(persist_dir=str(tmp_path / "chroma"))

    result = pipeline.ask("anything")

    assert result.answer == NOT_INDEXED_MESSAGE
    assert result.sources == []
    assert result.standalone_question == "anything"
    assert pipeline._chat_model is None  # never even constructed


def test_ingest_and_answer_returns_cited_sources_real_plumbing(monkeypatch, tmp_path):
    # Exercises the real ingest -> chunk -> embed -> retrieve path (with fake
    # embeddings), not a mocked-out retrieval step, to prove the full
    # pipeline is actually wired together correctly.
    monkeypatch.setattr("src.vectorstore.get_embeddings", lambda: FakeEmbeddings())
    monkeypatch.setattr("src.rag.get_chat_model", lambda: FakeChatModel(responses=["FAKE ANSWER"]))
    pipeline = ConversationalRAGPipeline(persist_dir=str(tmp_path / "chroma"), score_threshold=None)

    doc = tmp_path / "notes.txt"
    doc.write_text("The capital of France is Paris.")
    pipeline.ingest([str(doc)])

    result = pipeline.ask("What is the capital of France?")

    assert result.answer == "FAKE ANSWER"
    assert result.standalone_question == "What is the capital of France?"  # first turn: unchanged
    assert len(result.sources) > 0
    assert all(s["source"] == "notes.txt" for s in result.sources)


def _mock_retrieval(monkeypatch, chunk_text="Employees may work remotely up to 2 days per week."):
    def fake_search_relevant(vectorstore, query, k, threshold):
        fake_search_relevant.last_query = query
        return [Document(page_content=chunk_text, metadata={"source": "handbook.pdf", "chunk_id": "handbook.pdf#chunk0"})]

    monkeypatch.setattr("src.rag.search_relevant", fake_search_relevant)
    return fake_search_relevant


def test_first_turn_skips_rewrite_llm_call(monkeypatch, tmp_path):
    spy = _mock_retrieval(monkeypatch)
    chat_model = FakeChatModel(responses=["Up to 2 days per week [handbook.pdf#chunk0]."])
    monkeypatch.setattr("src.rag.get_chat_model", lambda: chat_model)

    pipeline = ConversationalRAGPipeline(persist_dir=str(tmp_path / "chroma"))
    pipeline._vectorstore = object()  # sentinel: retrieval is mocked, real vectorstore never touched

    result = pipeline.ask("What is the remote work policy?")

    assert result.standalone_question == "What is the remote work policy?"
    assert spy.last_query == "What is the remote work policy?"
    assert len(chat_model.call_log) == 1  # only the answer call, no rewrite call


def test_second_turn_rewrites_the_follow_up_before_retrieving(monkeypatch, tmp_path):
    spy = _mock_retrieval(monkeypatch)
    chat_model = FakeChatModel(
        responses=[
            "Up to 2 days per week [handbook.pdf#chunk0].",  # turn 1 answer
            "How many days per week can employees work remotely?",  # turn 2 rewrite
            "2 days per week [handbook.pdf#chunk0].",  # turn 2 answer
        ]
    )
    monkeypatch.setattr("src.rag.get_chat_model", lambda: chat_model)

    pipeline = ConversationalRAGPipeline(persist_dir=str(tmp_path / "chroma"))
    pipeline._vectorstore = object()

    pipeline.ask("What is the remote work policy?")
    result = pipeline.ask("How many days is that per week?")

    # the REWRITTEN question, not the raw follow-up, was what retrieval saw
    assert spy.last_query == "How many days per week can employees work remotely?"
    assert result.standalone_question == "How many days per week can employees work remotely?"
    assert len(chat_model.call_log) == 3


def test_no_relevant_chunks_skips_generation_and_does_not_hallucinate(monkeypatch, tmp_path):
    def empty_search(vectorstore, query, k, threshold):
        return []

    monkeypatch.setattr("src.rag.search_relevant", empty_search)
    chat_model = FakeChatModel(responses=[])  # generation must NOT be called
    monkeypatch.setattr("src.rag.get_chat_model", lambda: chat_model)

    pipeline = ConversationalRAGPipeline(persist_dir=str(tmp_path / "chroma"))
    pipeline._vectorstore = object()

    result = pipeline.ask("What is the stock ticker symbol?")

    assert result.answer == NO_MATCH_MESSAGE
    assert result.sources == []
    assert chat_model.call_log == []


def test_history_accumulates_across_turns(monkeypatch, tmp_path):
    _mock_retrieval(monkeypatch)
    chat_model = FakeChatModel(responses=["answer1", "standalone2", "answer2"])
    monkeypatch.setattr("src.rag.get_chat_model", lambda: chat_model)

    pipeline = ConversationalRAGPipeline(persist_dir=str(tmp_path / "chroma"))
    pipeline._vectorstore = object()

    pipeline.ask("Q1")
    pipeline.ask("Q2")

    assert [t.question for t in pipeline.history.turns] == ["Q1", "Q2"]
    assert [t.answer for t in pipeline.history.turns] == ["answer1", "answer2"]


def test_summarization_triggers_end_to_end_with_a_tiny_budget(monkeypatch, tmp_path):
    _mock_retrieval(monkeypatch)
    chat_model = FakeChatModel(responses=["resp"] * 20)
    monkeypatch.setattr("src.rag.get_chat_model", lambda: chat_model)

    pipeline = ConversationalRAGPipeline(persist_dir=str(tmp_path / "chroma"), history_max_tokens=1)
    pipeline._vectorstore = object()

    pipeline.ask("Q1")
    pipeline.ask("Q2")
    pipeline.ask("Q3")

    # only the most recent turn is ever kept verbatim once over budget
    assert len(pipeline.history.turns) == 1
    assert pipeline.history.turns[0].question == "Q3"
    assert pipeline.history.summary is not None
