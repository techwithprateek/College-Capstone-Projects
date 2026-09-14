"""Streamlit UI for the conversational RAG chatbot.

Unlike the basic RAG chatbot, this shows the rewritten standalone question
for every turn after the first — so you can actually see "how many days is
that per week?" become "how many days per week can employees work
remotely?" before it hits retrieval, instead of that step being invisible.
"""

import tempfile
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from src.rag import ConversationalRAGPipeline

load_dotenv()

st.set_page_config(page_title="Conversational RAG", page_icon="💬")
st.title("💬 Conversational RAG")
st.caption("Chat with your documents — ask a follow-up like \"tell me more about that\" and it understands what \"that\" means.")

if "pipeline" not in st.session_state:
    st.session_state.pipeline = ConversationalRAGPipeline()
if "messages" not in st.session_state:
    st.session_state.messages = []
if "indexed" not in st.session_state:
    st.session_state.indexed = False

with st.sidebar:
    st.header("1. Upload documents")
    st.caption("Try the bundled files in data/sample/, or upload your own.")
    uploaded_files = st.file_uploader(
        "PDF, TXT, or CSV", type=["pdf", "txt", "csv"], accept_multiple_files=True
    )
    if st.button("Build knowledge base", disabled=not uploaded_files):
        with st.spinner("Loading, chunking, and embedding..."):
            tmp_dir = Path(tempfile.mkdtemp())
            paths = []
            for uploaded in uploaded_files:
                dest = tmp_dir / uploaded.name
                dest.write_bytes(uploaded.getbuffer())
                paths.append(str(dest))
            n_chunks = st.session_state.pipeline.ingest(paths)
            st.session_state.indexed = True
        st.success(f"Indexed {n_chunks} chunks from {len(uploaded_files)} file(s).")

    if st.session_state.indexed:
        st.success("Knowledge base ready ✅")

    st.divider()
    if st.button("Clear conversation"):
        st.session_state.messages = []
        st.session_state.pipeline.history.turns = []
        st.session_state.pipeline.history.summary = None
        st.rerun()


def render_sources(sources: list[dict]) -> None:
    if not sources:
        return
    with st.expander(f"Sources ({len(sources)})"):
        for source in sources:
            st.markdown(f"**{source['chunk_id']}**")
            preview = source["text"][:300]
            if len(source["text"]) > 300:
                preview += "..."
            st.caption(preview)


st.header("2. Have a conversation")

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])
        if message["role"] == "assistant" and message.get("rewritten") and message["rewritten"] != message.get("original"):
            st.caption(f"🔎 Searched for: *{message['rewritten']}*")
        render_sources(message.get("sources", []))

if question := st.chat_input("Ask a question, then try a follow-up..."):
    st.session_state.messages.append({"role": "user", "content": question})
    with st.chat_message("user"):
        st.markdown(question)

    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):
            result = st.session_state.pipeline.ask(question)
        st.markdown(result.answer)
        if result.standalone_question != question:
            st.caption(f"🔎 Searched for: *{result.standalone_question}*")
        render_sources(result.sources)

    st.session_state.messages.append(
        {
            "role": "assistant",
            "content": result.answer,
            "sources": result.sources,
            "original": question,
            "rewritten": result.standalone_question,
        }
    )
