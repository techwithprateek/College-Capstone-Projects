"""Streamlit UI for the RAG chatbot: upload files, then ask questions about them."""

import tempfile
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from src.rag import RAGPipeline

load_dotenv()

st.set_page_config(page_title="RAG Chatbot", page_icon="📄")
st.title("📄 RAG Chatbot")
st.caption("Chat with your PDF, TXT, and CSV files — every answer cites its source.")

if "pipeline" not in st.session_state:
    st.session_state.pipeline = RAGPipeline()
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


st.header("2. Ask questions")

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])
        render_sources(message.get("sources", []))

if question := st.chat_input("Ask a question about your documents..."):
    st.session_state.messages.append({"role": "user", "content": question})
    with st.chat_message("user"):
        st.markdown(question)

    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):
            result = st.session_state.pipeline.answer(question)
        st.markdown(result.answer)
        render_sources(result.sources)

    st.session_state.messages.append(
        {"role": "assistant", "content": result.answer, "sources": result.sources}
    )
