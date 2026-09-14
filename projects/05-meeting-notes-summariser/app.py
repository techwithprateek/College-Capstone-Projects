"""Streamlit UI: paste a messy transcript, get a structured summary back,
with any possibly-hallucinated field flagged rather than trusted silently.
"""

from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from src.grounding import check_grounding
from src.summarize import Summarizer

load_dotenv()

SAMPLE_DIR = Path(__file__).parent / "data" / "sample_transcripts"

st.set_page_config(page_title="Meeting Notes Summariser", page_icon="📝")
st.title("📝 Meeting Notes Summariser")
st.caption("Paste a messy transcript. Get a clean summary, decisions, and action items — nothing invented.")

if "summarizer" not in st.session_state:
    st.session_state.summarizer = Summarizer()
if "transcript" not in st.session_state:
    st.session_state.transcript = ""

with st.sidebar:
    st.header("Try an example")
    for path in sorted(SAMPLE_DIR.glob("*.txt")):
        if st.button(path.stem.replace("_", " ").title()):
            st.session_state.transcript = path.read_text()

col1, col2 = st.columns(2)

with col1:
    st.subheader("Transcript")
    transcript = st.text_area(
        "Paste your meeting transcript here",
        value=st.session_state.transcript,
        height=500,
        key="transcript_input",
    )
    summarize_clicked = st.button("Summarize", type="primary", disabled=not transcript.strip())

with col2:
    st.subheader("Structured Notes")
    if summarize_clicked:
        with st.spinner("Extracting structured notes..."):
            summary = st.session_state.summarizer.summarize(transcript)
            warnings = check_grounding(summary, transcript)
        st.session_state.last_summary = summary
        st.session_state.last_warnings = warnings

    if "last_summary" in st.session_state:
        summary = st.session_state.last_summary
        warnings = st.session_state.last_warnings

        st.markdown("**Summary**")
        st.write(summary.summary)

        st.markdown("**Key Decisions**")
        if summary.key_decisions:
            for decision in summary.key_decisions:
                st.markdown(f"- {decision.description}")
        else:
            st.caption("No decisions were extracted.")

        st.markdown("**Action Items**")
        if summary.action_items:
            warned_fields = {(w.field, w.value) for w in warnings}
            for item in summary.action_items:
                owner = item.owner or "—"
                due = item.due_date or "—"
                owner_flag = " ⚠️" if ("action_item.owner", item.owner) in warned_fields else ""
                due_flag = " ⚠️" if ("action_item.due_date", item.due_date) in warned_fields else ""
                st.markdown(f"- {item.description}")
                st.caption(f"  Owner: {owner}{owner_flag}  |  Due: {due}{due_flag}")
        else:
            st.caption("No action items were extracted.")

        if warnings:
            st.warning(
                "⚠️ Some fields above couldn't be matched back to the transcript "
                "and may be hallucinated — double-check them:\n\n"
                + "\n".join(f"- {w.field}: {w.reason}" for w in warnings)
            )
    else:
        st.caption("Paste a transcript and click Summarize.")
