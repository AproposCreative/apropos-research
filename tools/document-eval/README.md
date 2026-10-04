# Bounded, offline document extraction comparison

This is a developer experiment, **not a Liv ingestion service**. It compares
`pypdf` 6.10.0, `pdfplumber` 0.11.9 and Docling's **native/model-free** pipeline
(`docling-slim` 2.133.0, core 2.99.0, parse 7.22.1). It does not test Docling's
learned layout model, OCR, tables, arbitrary inbox attachments or whole books.
No cloud parser, language model, API key or telemetry service is configured.

Two real archived exhibition PDFs in `fixtures.json` reproduce the app's existing
HTML-only source-reader limitation. Their dates are **2017 and 2019**, not current
news. All four pages were rendered and visually inspected to define the small
date/name/column-order checks. The photographs are not converted into fabricated
text. Source URL, date, binary hash and one-based page references survive extraction;
`extracted_unverified` never becomes factual/publication approval.

## Reproduce

Use Python 3.12 on macOS 14+ arm64. The wheel hashes deliberately target that
platform; other platforms need a separately reviewed wheel lock, not disabled
hash validation. Create an isolated virtual environment under ignored `tmp/pdfs/`:

```sh
python3.12 -m venv tmp/pdfs/document-eval-venv
tmp/pdfs/document-eval-venv/bin/python -m pip install --require-hashes --only-binary=:all: -r tools/document-eval/requirements-macos-arm64-py312.txt
tmp/pdfs/document-eval-venv/bin/python -m pip check
```

Download **only the two public URLs in the manifest** into a new ignored fixture
directory, using the listed filenames. Use a size/time-bounded HTTPS downloader;
do not pass credentials or follow unreviewed redirects. The runner performs no
network download and rejects changed bytes, oversized files and escaped paths.

```sh
tmp/pdfs/document-eval-venv/bin/python tools/document-eval/run.py --fixtures tmp/pdfs/press-fixtures --python tmp/pdfs/document-eval-venv/bin/python --output tmp/pdfs/document-eval-run-1
tmp/pdfs/document-eval-venv/bin/python -m unittest discover -s tools/document-eval -p 'test_*.py' -v
```

Output directory must be new, so earlier evidence is not overwritten. Raw extracted
text and bounding boxes stay in ignored temporary output, not the repository.
The committed observation contains only source identities, text hashes and findings.

Each parser runs in a separate process with a credentials-free allowlisted
environment, isolated Python mode and temporary working directory. Python network
audit events are rejected, model download/telemetry settings are disabled, and the
worker has byte/page/text/time limits. This is **not** a sandbox for arbitrary
native code or an approved public upload endpoint. Only exact pinned public
fixtures are admitted. The workers do not import application modules or `.env`.

## Interpreting the result

The comparison exits **1** when any parser exposes a defect. On the recorded
fixtures, this is expected: plain pdfplumber interleaves the bilingual columns and
breaks the poster dates. Do not hide that failure to make the comparison green.
Unit tests separately prove that missing/reordered/corrupted text is detected.
Five of six parser/fixture combinations pass the narrow checks. This is not a
full transcription quality score, semantic verification or broad parser ranking.

`workerWallMs` measures one complete child process including imports. `durationMs`
is diagnostic parser timing, with different import boundaries; neither is a
controlled performance benchmark. Two consecutive runs preserved all page hashes
and findings. No CPU-to-money conversion or savings percentage is inferred.

Docling adds native bounding boxes, but pypdf also passes the selected text checks.
Therefore this experiment does **not** justify adding Docling to the production
runtime or a new paid service. PDFs still require a separately designed bounded
server ingestion path before Liv can use them. No silent change to the HTML
fact-check reader or metadata-only inbox attachment policy was made.

Primary implementation references:

- https://docling-project.github.io/docling/usage/advanced_options/
- https://github.com/docling-project/docling/blob/v2.133.0/pyproject.toml

The reviewed slim distribution is MIT-licensed. The exact native wheel dependency
set is pinned, binary-only and isolated from the application's npm lockfile.
This is not a vulnerability/security certification of every transitive package.
Both Vercel upload and Next server tracing explicitly exclude this directory.
