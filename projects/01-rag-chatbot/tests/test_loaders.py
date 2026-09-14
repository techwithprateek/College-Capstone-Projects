import csv

import pytest

from src.loaders import load_file, load_files


def test_load_txt_sets_source_metadata(tmp_path):
    path = tmp_path / "notes.txt"
    path.write_text("hello world")

    docs = load_file(path)

    assert len(docs) == 1
    assert docs[0].metadata["source"] == "notes.txt"
    assert docs[0].page_content == "hello world"


def test_load_csv_creates_one_document_per_row(tmp_path):
    path = tmp_path / "rows.csv"
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "role"])
        writer.writerow(["Ada", "Engineer"])
        writer.writerow(["Grace", "Admiral"])

    docs = load_file(path)

    assert len(docs) == 2
    assert all(d.metadata["source"] == "rows.csv" for d in docs)


def test_unsupported_extension_raises(tmp_path):
    path = tmp_path / "image.png"
    path.write_bytes(b"not really a png")

    with pytest.raises(ValueError, match="Unsupported file type"):
        load_file(path)


def test_load_files_combines_multiple_sources(tmp_path):
    txt_path = tmp_path / "a.txt"
    txt_path.write_text("a")
    csv_path = tmp_path / "b.csv"
    csv_path.write_text("col\nval\n")

    docs = load_files([txt_path, csv_path])

    assert {d.metadata["source"] for d in docs} == {"a.txt", "b.csv"}
