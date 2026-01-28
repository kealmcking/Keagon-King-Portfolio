import re
from pathlib import Path

ROOT = Path(__file__).parent

INDEX = ROOT / "index.html"


def extract_block(text: str, start_marker: str, end_marker: str) -> str | None:
    """Extract a block between start_marker and end_marker (first occurrence)."""
    start_idx = text.find(start_marker)
    if start_idx == -1:
        return None
    end_idx = text.find(end_marker, start_idx)
    if end_idx == -1:
        return None
    end_idx += len(end_marker)
    return text[start_idx:end_idx]


def extract_header(index_html: str) -> str | None:
    # Wrapper masthead through the closing divs that wrap it
    return extract_block(
        index_html,
        '<div class="wrapper-masthead fade-me-in">',
        '</div>\n</div>',
    )


def extract_footer(index_html: str) -> str | None:
    return extract_block(
        index_html,
        '<div class="wrapper-footer">',
        '</div>\n</div>',
    )


def sync_header_and_footer() -> None:
    index_text = INDEX.read_text(encoding="utf-8")

    header_block = extract_header(index_text)
    footer_block = extract_footer(index_text)

    if not header_block:
        raise SystemExit("Could not find header block in index.html")

    html_files = sorted(p for p in ROOT.glob("*.html") if p.name != "index.html")

    header_pattern = re.compile(
        r'<div class="wrapper-masthead[^>]*>[\s\S]*?</div>\s*</div>',
        re.MULTILINE,
    )
    footer_pattern = re.compile(
        r'<div class="wrapper-footer"[\s\S]*?</div>\s*</div>',
        re.MULTILINE,
    )

    for html_path in html_files:
        text = html_path.read_text(encoding="utf-8")
        original_text = text

        # Replace header if present
        if 'class="wrapper-masthead' in text:
            text, n_header = header_pattern.subn(header_block, text, count=1)
        else:
            n_header = 0

        # Replace footer only if both template and file have wrapper-footer
        if footer_block and 'class="wrapper-footer"' in text:
            text, n_footer = footer_pattern.subn(footer_block, text, count=1)
        else:
            n_footer = 0

        if text != original_text:
            html_path.write_text(text, encoding="utf-8")
            print(f"Updated {html_path.name}: header={n_header}, footer={n_footer}")


if __name__ == "__main__":
    sync_header_and_footer()

