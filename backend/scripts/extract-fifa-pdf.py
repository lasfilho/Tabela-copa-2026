#!/usr/bin/env python3
"""Extrai texto do PDF oficial FIFA SquadLists para parse-fifa-squads.js."""
import sys
from pathlib import Path

try:
    import fitz
except ImportError:
    print("[extract-fifa-pdf] instale pymupdf: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = Path.home() / "OneDrive" / "Documentos" / "SquadLists-English.pdf"
OUTPUT = ROOT / "data" / "fifa-squad-lists.txt"


def main():
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    if not pdf_path.is_file():
        print(f"[extract-fifa-pdf] PDF não encontrado: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    doc = fitz.open(pdf_path)
    text = "\n".join(page.get_text("text") for page in doc)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(text, encoding="utf-8")
    print(f"[extract-fifa-pdf] {doc.page_count} paginas -> {OUTPUT} ({len(text)} chars)")


if __name__ == "__main__":
    main()
