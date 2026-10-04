"""Isolated parser worker. Only pinned local test PDFs; never a Liv service."""

import hashlib
import importlib.metadata
import io
import json
from pathlib import Path
import signal
import sys
import time

MAX_BYTES = 8 * 1024 * 1024
MAX_PAGES = 4
MAX_TEXT = 100_000


def prohibit_network(event, args):
    # Operational guard, not an OS sandbox for arbitrary native code.
    if event in {"socket.connect", "socket.connect_ex", "socket.getaddrinfo",
                 "socket.gethostbyname", "socket.sendto", "socket.bind"}:
        raise RuntimeError("document_evaluation_network_disabled")


def main():
    sys.addaudithook(prohibit_network)
    signal.alarm(30)
    engine, filename, expected_hash = sys.argv[1:]
    path = Path(filename)
    if not path.is_file() or path.stat().st_size > MAX_BYTES:
        raise ValueError("fixture_size_or_type")
    raw = path.read_bytes()
    if not raw.startswith(b"%PDF-"):
        raise ValueError("fixture_not_pdf")
    if hashlib.sha256(raw).hexdigest() != expected_hash:
        raise ValueError("fixture_hash_changed")

    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(raw), strict=True)
    if reader.is_encrypted:
        raise ValueError("encrypted_fixture")
    count = len(reader.pages)
    if not 0 < count <= MAX_PAGES:
        raise ValueError("fixture_page_limit")
    start = time.monotonic()
    provenance = []
    if engine == "pypdf":
        pages = [page.extract_text() or "" for page in reader.pages]
        versions = {"pypdf": importlib.metadata.version("pypdf")}
    elif engine == "pdfplumber":
        import pdfplumber
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        versions = {"pdfplumber": importlib.metadata.version("pdfplumber")}
    elif engine == "docling-native":
        from docling.datamodel.base_models import DocumentStream, InputFormat
        from docling.datamodel.pipeline_options import NativePdfPipelineOptions
        from docling.document_converter import DocumentConverter, NativePdfFormatOption
        options = NativePdfPipelineOptions(
            generate_page_images=False, parser_threads=2, document_timeout=20,
            enable_remote_services=False, enable_external_plugins=False,
        )
        converter = DocumentConverter(
            allowed_formats=[InputFormat.PDF],
            format_options={InputFormat.PDF: NativePdfFormatOption(pipeline_options=options)},
        )
        result = converter.convert(
            DocumentStream(name=path.name, stream=io.BytesIO(raw)),
            max_num_pages=MAX_PAGES, max_file_size=MAX_BYTES,
        )
        if result.status.value != "success":
            raise ValueError("incomplete_docling_conversion:" + result.status.value)
        if len(result.document.pages) != count:
            raise ValueError("docling_page_count_changed")
        parts = [[] for _ in range(count)]
        for item, _ in result.document.iterate_items():
            text = getattr(item, "text", None)
            if not text:
                continue
            if len(item.prov) != 1 or not 1 <= item.prov[0].page_no <= count:
                raise ValueError("ambiguous_item_provenance")
            source = item.prov[0]
            parts[source.page_no - 1].append(text)
            provenance.append({"page": source.page_no, "box": source.bbox.model_dump(mode="json"),
                               "textHash": hashlib.sha256(text.encode()).hexdigest()})
        pages = ["\n".join(items) for items in parts]
        versions = {name: importlib.metadata.version(name)
                    for name in ["docling-slim", "docling-core", "docling-parse"]}
    else:
        raise ValueError("unknown_engine")
    if sum(map(len, pages)) > MAX_TEXT:
        raise ValueError("extracted_text_limit")
    print(json.dumps({"engine": engine, "versions": versions,
                      "durationMs": round((time.monotonic() - start) * 1000),
                      "pages": pages, "itemProvenance": provenance,
                      "evidenceStatus": "extracted_unverified", "ocrPerformed": False,
                      "remoteServices": False}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": type(error).__name__ + ": " + str(error)}))
        sys.exit(1)
