#!/usr/bin/env python3
"""Build Apropos's Danish and English three-page press PDFs.

Uses only the reviewed local copy, article evidence and supplied brand assets.
No network access, uploads, CMS changes or extra dependencies.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from html import escape
from pathlib import Path

from PIL import Image
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "tmp/pdfs/press-kit"
OUT = ROOT / "output/pdf"
ASSETS = ROOT / "scripts/press-kit/assets"
BRAND = ASSETS / "logos"
COPY = json.loads((ROOT / "docs/seo/press-kit-copy-2026-10-20.json").read_text())
EVIDENCE = json.loads(
    (ROOT / "docs/seo/press-kit-evidence-2026-10-20.json").read_text()
)
W, H = A4
M = 31
CW = W - 2 * M
INK = colors.HexColor("#161820")
MUTED = colors.HexColor("#646771")
BLUE = colors.HexColor("#0089bd")
PALE = colors.HexColor("#eff8fc")
LINE = colors.HexColor("#dce0e5")
HOME = "https://www.aproposmagazine.com"
MAIL = "mailto:hej@aproposmagazine.com"


def verify_assets() -> dict:
    """Validate reviewed local bytes before parsing fonts or image inputs."""
    manifest = json.loads((ASSETS / "provenance.json").read_text())
    checked = []
    for item in manifest["files"]:
        path = ROOT / item["path"]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != item["sha256"]:
            raise ValueError(f"Source asset changed: {item['path']}")
        checked.append(item["path"])
    return {
        "checkedAssets": len(checked),
        "paths": checked,
        "googleFontsCommit": manifest["googleFontsCommit"],
        "allHashesMatch": True,
    }


VERIFIED_INPUTS = verify_assets()

for face, filename in (
    ("Poppins", "Poppins-Regular.ttf"),
    ("Poppins-SemiBold", "Poppins-SemiBold.ttf"),
    ("Amiri", "Amiri-Regular.ttf"),
):
    pdfmetrics.registerFont(TTFont(face, str(ASSETS / "fonts" / filename)))
pdfmetrics.registerFontFamily(
    "Poppins", normal="Poppins", bold="Poppins-SemiBold",
    italic="Poppins", boldItalic="Poppins-SemiBold",
)

TEXTURE = ImageReader(str(ASSETS / "reference-texture.png"))
WHITE_LOGO = ImageReader(str(BRAND / "AM_logo_white.png"))
BLACK_LOGO = ImageReader(str(BRAND / "AM_logo_black.png"))
LOGO_RATIO = 1200 / 481
TEXTURE_RATIO = Image.open(ASSETS / "reference-texture.png").width / Image.open(
    ASSETS / "reference-texture.png"
).height
LAYOUT: list[dict] = []


class PressPDF:
    def __init__(self, locale: str, filename: str):
        self.locale = locale
        self.copy = COPY[locale]
        self.path = OUT / filename
        self.c = canvas.Canvas(str(self.path), pagesize=A4, pageCompression=1)
        self.c.setTitle(
            "Apropos Magazine | Pressekit" if locale == "da"
            else "Apropos Magazine | Press kit"
        )
        self.c.setAuthor("Apropos Magazine")
        self.c.setSubject(
            "Uafhængigt dansk kulturmedie. Gratis at læse. Uden reklamer."
            if locale == "da"
            else "Independent Danish culture publication. Free to read. Ad-free."
        )
        self.page = 0
        self.boxes: list[dict] = []
        self.links: list[dict] = []

    def text(
        self, text: str, x: float, top: float, width: float,
        size: float = 10.2, leading: float = 15.2,
        font: str = "Poppins", color=INK,
        name: str = "text", html: bool = False,
    ) -> float:
        style = ParagraphStyle(
            name=name, fontName=font, fontSize=size, leading=leading,
            textColor=color, alignment=TA_LEFT, spaceBefore=0, spaceAfter=0,
            allowWidows=0, allowOrphans=0, splitLongWords=False,
            borderPadding=0,
        )
        content = text if html else escape(text).replace("\n", "<br/>")
        paragraph = Paragraph(content, style)
        _, height = paragraph.wrap(width, H)
        bottom = top - height
        if x < M - 1 or x + width > W - M + 1 or bottom < 58 or top > H - 20:
            raise ValueError(
                f"{self.locale} page {self.page}: text outside safe area: "
                f"{name}, x={x:.1f}, top={top:.1f}, bottom={bottom:.1f}"
            )
        paragraph.drawOn(self.c, x, bottom)
        self.boxes.append({
            "page": self.page, "name": name, "text": text,
            "x": round(x, 2), "top": round(top, 2),
            "width": round(width, 2), "height": round(height, 2),
            "bottom": round(bottom, 2),
        })
        return bottom

    @staticmethod
    def measure(text: str, width: float, size=10.2, leading=15.2,
                font="Poppins") -> float:
        style = ParagraphStyle(
            "measure", fontName=font, fontSize=size, leading=leading,
            splitLongWords=False,
        )
        p = Paragraph(escape(text).replace("\n", "<br/>"), style)
        return p.wrap(width, H)[1]

    def link(self, url: str, x: float, bottom: float,
             width: float, height: float):
        if "/presse" in url:
            raise ValueError("Do not link to the currently unpublished press page.")
        self.c.linkURL(url, (x, bottom, x + width, bottom + height),
                       relative=0, thickness=0)
        self.links.append({"page": self.page, "url": url})

    def arrow(self, x: float, y: float, size: float = 7, color=INK):
        self.c.saveState()
        self.c.setStrokeColor(color)
        self.c.setLineWidth(1.1)
        self.c.line(x, y, x + size, y + size)
        self.c.line(x + size * .23, y + size, x + size, y + size)
        self.c.line(x + size, y + size * .23, x + size, y + size)
        self.c.restoreState()

    def pill(self, label: str, url: str, x: float, top: float,
             width: float, height: float = 28):
        self.c.setFillColor(colors.white)
        self.c.setStrokeColor(colors.HexColor("#a6b6bf"))
        self.c.setLineWidth(.5)
        self.c.roundRect(x, top - height, width, height, height / 2,
                         stroke=1, fill=1)
        self.c.setFillColor(INK)
        self.c.setFont("Poppins", 8.9)
        self.c.drawString(x + 13, top - height / 2 - 3.1, label)
        self.arrow(x + width - 20, top - height / 2 - 3.5, 6)
        self.link(url, x, top - height, width, height)

    def header(self, height=91):
        self.page += 1
        top = H - 25
        bottom = top - height
        self.c.saveState()
        p = self.c.beginPath()
        p.roundRect(M - 5, bottom, CW + 10, height, 13)
        self.c.clipPath(p, stroke=0)
        image_h = (CW + 10) / TEXTURE_RATIO
        self.c.drawImage(TEXTURE, M - 5, bottom + (height - image_h) / 2,
                         width=CW + 10, height=image_h, mask="auto")
        self.c.setFillColor(BLUE)
        self.c.setFillAlpha(.19)
        self.c.rect(M - 5, bottom, CW + 10, height, fill=1, stroke=0)
        self.c.restoreState()
        logo_w = 171 if height > 110 else 146
        logo_h = logo_w / LOGO_RATIO
        self.c.drawImage(WHITE_LOGO, M + 18, bottom + (height - logo_h) / 2,
                         width=logo_w, height=logo_h, mask="auto")
        labels = (
            ("Besøg Apropos Magazine", "Kontakt om presse")
            if self.locale == "da"
            else ("Visit Apropos Magazine", "Press enquiries")
        )
        pills_w = 188
        pill_top = bottom + height / 2 + 31
        self.pill(labels[0], HOME, W - M - pills_w - 10, pill_top, pills_w)
        self.pill(labels[1], MAIL, W - M - pills_w - 10, pill_top - 35, pills_w)
        return bottom

    def footer(self):
        self.c.setStrokeColor(LINE)
        self.c.setLineWidth(.6)
        self.c.line(M, 45, W - M, 45)
        self.c.setFillColor(MUTED)
        self.c.setFont("Poppins", 7.4)
        self.c.drawString(M, 29, "APROPOS MAGAZINE")
        date = "Pressekit · 20. oktober 2026" if self.locale == "da" else "Press kit · 20 October 2026"
        self.c.drawCentredString(W / 2, 29, date)
        self.c.drawRightString(W - M, 29, f"{self.page} / 3")
        self.c.showPage()

    def kicker(self, text: str, top: float):
        return self.text(text, M, top, CW, size=8, leading=12,
                         font="Poppins-SemiBold", color=BLUE, name="kicker")

    def page_one(self):
        da = self.locale == "da"
        bottom = self.header(124)
        y = self.kicker("PRESSEKIT / DANSK" if da else "PRESS KIT / ENGLISH",
                        bottom - 23)
        title = "Kultur med holdning.\nFri for reklamer." if da else "Culture with a point of view.\nFree of advertising."
        y = self.text(title, M, y - 9, CW, size=33, leading=37,
                      font="Amiri", name="cover-title")
        y = self.text(self.copy["boilerplate"]["short"], M, y - 11, CW,
                      size=11.0, leading=16.5, name="short-boilerplate")
        y -= 22
        self.c.setStrokeColor(LINE)
        self.c.setLineWidth(.6)
        self.c.line(M, y, W - M, y)
        y = self.kicker(
            "PRÆSENTATION / 150 ORD" if da else "DESCRIPTION / 150 WORDS",
            y - 17,
        )
        for index, para in enumerate(self.copy["boilerplate"]["long"].split("\n\n")):
            y = self.text(para, M, y - (10 if index == 0 else 9), CW,
                          size=10.0, leading=14.7, name=f"long-boilerplate-{index}")

        top = y - 20
        heading = self.copy["advertisementFree"]["heading"]
        body = self.copy["advertisementFree"]["paragraphs"][0]
        block_h = 22 + 20 + self.measure(body, CW - 32, 9.4, 14.0) + 16
        if top - block_h < 63:
            raise ValueError(f"Cover ad-free panel too low: {top - block_h}")
        self.c.setFillColor(PALE)
        self.c.roundRect(M, top - block_h, CW, block_h, 10, fill=1, stroke=0)
        yy = self.text(heading, M + 16, top - 14, CW - 32, size=11.2,
                       leading=18, font="Poppins-SemiBold", name="ad-free-heading")
        self.text(body, M + 16, yy - 7, CW - 32, size=9.4, leading=14.0,
                  name="ad-free-copy")
        self.footer()

    def page_two(self):
        da = self.locale == "da"
        y = self.header(81) - 22
        y = self.kicker("REDAKTIONEL PROFIL" if da else "EDITORIAL PROFILE", y)
        y = self.text("Det dækker vi." if da else "What we cover.", M, y - 6,
                      CW, size=30, leading=37, font="Amiri", name="coverage-title")
        y = self.text(self.copy["editorialProfile"]["introduction"], M, y - 7,
                      CW, size=9.5, leading=14.0, name="coverage-introduction")
        y -= 21
        gap = 24
        column = (CW - gap) / 2
        areas = self.copy["editorialProfile"]["areas"]
        for row in range(3):
            bottoms = []
            for col in range(2):
                area = areas[row * 2 + col]
                x = M + col * (column + gap)
                yy = self.text(area["title"], x, y, column, size=10.4,
                               leading=16, font="Poppins-SemiBold",
                               name=f"area-{row}-{col}-title")
                yy = self.text(area["text"], x, yy - 5, column,
                               size=9.2, leading=13.4,
                               name=f"area-{row}-{col}-body")
                bottoms.append(yy)
            y = min(bottoms) - 18
        self.c.setStrokeColor(LINE)
        self.c.setLineWidth(.6)
        self.c.line(M, y + 3, W - M, y + 3)
        y = self.text(
            "Fem eksempler fra arkivet" if da else "Five examples from the archive",
            M, y - 11, CW, size=21, leading=28,
            font="Amiri", name="examples-heading",
        )
        subtitles = {
            "da": [
                "Musik / Koncertanmeldelse",
                "Film & serier / Serieanmeldelse",
                "Kunst & design / Researchbaseret kulturfeature",
                "Bøger / Boganmeldelse",
                "Gaming / Spilanmeldelse",
            ],
            "en": [
                "Music / Concert review",
                "Film & TV / Series review",
                "Art & design / Research-based culture feature",
                "Books / Book review",
                "Gaming / Game review",
            ],
        }
        for index, article in enumerate(EVIDENCE["articleExamples"]):
            top = y - 8
            title = article["displayTitle"]
            if not da:
                title = [
                    "Farveblind at Lille VEGA",
                    "Untamed on Netflix",
                    "Kontrapunkt: Art or client work?",
                    "Sød Tøs by Anna Juul",
                    "Astro Bot",
                ][index]
            title_bottom = self.text(
                title, M, top, CW - 35, size=10.0, leading=14.0,
                font="Poppins-SemiBold", name=f"example-{index}-title",
            )
            self.arrow(W - M - 11, top - 10, 7, BLUE)
            y = self.text(subtitles[self.locale][index], M, title_bottom - 2,
                          CW - 35, size=7.7, leading=11.2, color=MUTED,
                          name=f"example-{index}-format")
            self.link(article["url"], M, y - 2, CW, top - y + 3)
        self.footer()

    def page_three(self):
        da = self.locale == "da"
        y = self.header(81) - 22
        y = self.kicker("FAKTA & PRESSEKONTAKT" if da else "FACTS & PRESS CONTACT", y)
        y = self.text(
            "Praktisk om Apropos." if da else "Apropos at a glance.",
            M, y - 6, CW, size=30, leading=37, font="Amiri", name="facts-title",
        )
        y -= 16
        label_w = 142
        value_x = M + label_w
        value_w = CW - label_w
        for index, fact in enumerate(self.copy["facts"]["rows"]):
            if fact["label"] in ("Pressekontakt", "Press contact"):
                continue  # The contact below is larger and actionable.
            label = fact["label"]
            value = fact["value"]
            if not da and label == "Responsible editor":
                label = "Editor-in-chief"
            lh = self.measure(label, label_w - 12, 8.6, 13.0)
            vh = self.measure(value, value_w, 9.3, 13.6)
            row_h = max(lh, vh) + 14
            self.text(label, M, y, label_w - 12, size=8.6, leading=13.0,
                      font="Poppins-SemiBold", color=MUTED,
                      name=f"fact-{index}-label")
            self.text(value, value_x, y, value_w, size=9.3, leading=13.6,
                      name=f"fact-{index}-value")
            if fact.get("url"):
                self.link(fact["url"], value_x, y - vh, value_w, vh + 2)
            self.c.setStrokeColor(LINE)
            self.c.setLineWidth(.4)
            self.c.line(M, y - row_h + 7, W - M, y - row_h + 7)
            y -= row_h

        y -= 13
        y = self.text("Originale logoer" if da else "Original logos", M, y, CW,
                      size=21, leading=27, font="Amiri", name="logos-heading")
        card_top = y - 8
        card_h = 83
        card_gap = 14
        card_w = (CW - card_gap) / 2
        for index, (logo, bg) in enumerate(
            ((BLACK_LOGO, colors.white), (WHITE_LOGO, INK))
        ):
            x = M + index * (card_w + card_gap)
            self.c.setFillColor(bg)
            self.c.setStrokeColor(LINE if index == 0 else INK)
            self.c.setLineWidth(.7)
            self.c.roundRect(x, card_top - card_h, card_w, card_h, 9,
                             fill=1, stroke=1)
            width = 150
            height = width / LOGO_RATIO
            self.c.drawImage(logo, x + (card_w - width) / 2,
                             card_top - card_h + (card_h - height) / 2,
                             width=width, height=height, mask="auto")
        y = card_top - card_h - 11
        y = self.text(
            self.copy["pressMaterials"]["logoGuidance"], M, y, CW,
            size=8.5, leading=12.7, color=MUTED, name="logo-guidance",
        )
        y -= 22
        self.c.setStrokeColor(LINE)
        self.c.setLineWidth(.6)
        self.c.line(M, y, W - M, y)
        y = self.text(
            "Pressekontakt" if da else "Press contact", M, y - 14, CW,
            size=10.5, leading=16, font="Poppins-SemiBold", name="contact-heading",
        )
        top = y - 7
        y = self.text("hej@aproposmagazine.com", M, top, CW,
                      size=18.5, leading=26, color=BLUE, name="contact-email")
        self.link(MAIL, M, y, CW, top - y + 2)
        contact = (
            "Skriv med medie, emne og deadline."
            if da else "Please include your publication, topic and deadline."
        )
        y = self.text(contact, M, y - 8, CW, size=9.3, leading=14.0,
                      name="contact-guidance")
        self.text(
            "Frederik Emil Kragh · Ansvarshavende redaktør"
            if da else "Frederik Emil Kragh · Editor-in-chief",
            M, y - 8, CW, size=8.8, leading=13.3, color=MUTED,
            name="contact-editor",
        )
        self.footer()

    def build(self):
        self.page_one()
        self.page_two()
        self.page_three()
        self.c.save()
        reader = PdfReader(self.path)
        if len(reader.pages) != 3:
            raise ValueError(f"{self.path.name} must contain exactly three pages")
        for index, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if not page_text or "\ufffd" in page_text:
                raise ValueError(f"Missing text or replacement glyph on page {index + 1}")
            if index < 2 and "Frederik" in page_text:
                raise ValueError("Editor attribution escaped the facts/contact page")
            if tuple(float(v) for v in page.mediabox)[2:] != (W, H):
                # PDF stores rounded floating-point page bounds.
                assert abs(float(page.mediabox.width) - W) < .01
                assert abs(float(page.mediabox.height) - H) < .01
        actual_urls = []
        for page in reader.pages:
            for annotation in page.get("/Annots", []):
                action = annotation.get_object().get("/A", {})
                if action.get("/URI"):
                    actual_urls.append(str(action["/URI"]))
        expected = [a["url"] for a in EVIDENCE["articleExamples"]]
        assert all(url in actual_urls for url in expected)
        assert HOME in actual_urls and MAIL in actual_urls
        assert all("/presse" not in url for url in actual_urls)
        LAYOUT.append({
            "locale": self.locale, "output": str(self.path.relative_to(ROOT)),
            "pages": 3, "pageFormat": "A4",
            "textSafeAreaPassed": True,
            "minimumTextBottom": min(b["bottom"] for b in self.boxes),
            "articleLinksVerifiedInPdf": len(expected),
            "linkAnnotations": len(actual_urls),
            "editorOnlyOnFactsContactPage": True,
            "textBoxes": self.boxes,
            "links": self.links,
        })
        print(f"{self.path}: 3 A4 pages, {len(actual_urls)} links, text bounds passed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--verify-inputs", action="store_true",
        help="Verify source hashes and load fonts/images without writing PDFs.",
    )
    args = parser.parse_args()
    if args.verify_inputs:
        print(json.dumps(VERIFIED_INPUTS, ensure_ascii=False, indent=2))
        return
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    for locale in ("da", "en"):
        for field, expected in (("short", 50), ("long", 150)):
            assert len(COPY[locale]["boilerplate"][field].split()) == expected
    PressPDF("da", "apropos-pressekit-da.pdf").build()
    PressPDF("en", "apropos-press-kit-en.pdf").build()
    (WORK / "layout-verification.json").write_text(
        json.dumps(LAYOUT, ensure_ascii=False, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
