#!/usr/bin/env python3
"""
md_to_pdf.py — Convert manuscript markdown to a literary-styled PDF.
Uses ReportLab. Serif body, chapter pages, no artificial endings.

Usage:
    python3 md_to_pdf.py <input.md> <output.pdf>
"""
import sys
import re
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Frame, PageTemplate
)
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


def register_fonts():
    """Register a serif body font and a sans heading font that support
    Unicode (em-dashes, curly quotes, etc.)"""
    # Try Noto Serif SC for body (handles Latin + CJK + symbols)
    serif_candidates = [
        '/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf',
        '/usr/share/fonts/truetype/english/Tinos-Regular.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
    ]
    sans_candidates = [
        '/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf',
        '/usr/share/fonts/truetype/english/Carlito-Regular.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    ]
    serif_name = 'BodySerif'
    sans_name = 'HeadingSans'
    for p in serif_candidates:
        try:
            pdfmetrics.registerFont(TTFont(serif_name, p))
            break
        except Exception:
            continue
    for p in sans_candidates:
        try:
            pdfmetrics.registerFont(TTFont(sans_name, p))
            break
        except Exception:
            continue
    return serif_name, sans_name


def parse_markdown(md: str):
    """Yield (type, text) tuples. Types: h1, h2, p, hr, blockquote."""
    lines = md.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue
        if line.startswith('---'):
            yield ('hr', '')
            i += 1
            continue
        if line.startswith('# '):
            yield ('h1', line[2:].strip())
            i += 1
            continue
        if line.startswith('## '):
            yield ('h2', line[3:].strip())
            i += 1
            continue
        if line.startswith('> '):
            yield ('blockquote', line[2:].strip())
            i += 1
            continue
        # Collect paragraph
        buf = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(('#', '---', '>')):
            buf.append(lines[i].rstrip())
            i += 1
        yield ('p', ' '.join(buf))


def escape_for_xml(text: str) -> str:
    """Escape text for ReportLab Paragraph (which parses XML-like tags)."""
    # First, decode markdown-emphasis into ReportLab tags
    # Bold: **text** -> <b>text</b>
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    # Italic: *text* -> <i>text</i>
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)
    # Now escape the rest of XML special chars (but preserve our tags)
    # Replace & first
    text = text.replace('&', '&amp;')
    # Restore our tags
    text = re.sub(r'&amp;(lt;/?[bi]&gt;)', r'&\1', text)
    text = text.replace('<b>', '[[B]]').replace('</b>', '[[/B]]')
    text = text.replace('<i>', '[[I]]').replace('</i>', '[[/I]]')
    text = text.replace('<', '&lt;').replace('>', '&gt;')
    text = text.replace('[[B]]', '<b>').replace('[[/B]]', '</b>')
    text = text.replace('[[I]]', '<i>').replace('[[/I]]', '</i>')
    return text


def build_pdf(md_path: str, pdf_path: str):
    serif_name, sans_name = register_fonts()
    md = Path(md_path).read_text(encoding='utf-8')

    body_style = ParagraphStyle(
        name='Body',
        fontName=serif_name,
        fontSize=11,
        leading=16,
        alignment=TA_LEFT,
        spaceAfter=10,
        firstLineIndent=14,
    )
    blockquote_style = ParagraphStyle(
        name='Blockquote',
        parent=body_style,
        leftIndent=24,
        rightIndent=24,
        fontName=serif_name,
        textColor='#555555',
        firstLineIndent=0,
    )
    h1_style = ParagraphStyle(
        name='H1',
        fontName=serif_name,
        fontSize=24,
        leading=30,
        alignment=TA_LEFT,
        spaceBefore=24,
        spaceAfter=18,
    )
    h2_style = ParagraphStyle(
        name='H2',
        fontName=sans_name,
        fontSize=14,
        leading=18,
        alignment=TA_LEFT,
        spaceBefore=18,
        spaceAfter=12,
    )
    italic_note_style = ParagraphStyle(
        name='ItalicNote',
        parent=body_style,
        fontName=serif_name,
        textColor='#444444',
        firstLineIndent=0,
        leftIndent=14,
    )

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=1.0 * inch,
        rightMargin=1.0 * inch,
        topMargin=1.0 * inch,
        bottomMargin=1.0 * inch,
        title='Manuscript',
        author='Interviews with Evil',
    )

    story = []
    chapter_count = 0
    for typ, text in parse_markdown(md):
        if typ == 'h1':
            story.append(Paragraph(escape_for_xml(text), h1_style))
            story.append(Spacer(1, 6))
        elif typ == 'h2':
            chapter_count += 1
            if chapter_count > 1:
                story.append(PageBreak())
            story.append(Paragraph(escape_for_xml(text), h2_style))
            story.append(Spacer(1, 6))
        elif typ == 'p':
            if text.startswith('*') and text.endswith('*') and len(text) > 2:
                # Italic note (chapter subtitle)
                clean = text.lstrip('*').rstrip('*').strip()
                story.append(Paragraph(f'<i>{escape_for_xml(clean)}</i>', italic_note_style))
            else:
                story.append(Paragraph(escape_for_xml(text), body_style))
        elif typ == 'blockquote':
            story.append(Paragraph(escape_for_xml(text), blockquote_style))
        elif typ == 'hr':
            story.append(Spacer(1, 6))

    doc.build(story)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: md_to_pdf.py <input.md> <output.pdf>', file=sys.stderr)
        sys.exit(2)
    build_pdf(sys.argv[1], sys.argv[2])
    print(f'[md_to_pdf] wrote {sys.argv[2]}', file=sys.stderr)
