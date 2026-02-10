import re


def sanitize_filename(title: str) -> str:
    """Convert title to valid filename."""
    # Remove special characters, keep alphanumeric and spaces
    clean = re.sub(r'[^\w\s-]', '', title)
    # Replace spaces with hyphens
    clean = re.sub(r'\s+', '-', clean.strip())
    # Remove multiple hyphens
    clean = re.sub(r'-+', '-', clean)
    return clean


def parse_vtt(vtt_content: str) -> str:
    """Parse VTT subtitle file and extract plain text."""
    lines = vtt_content.split('\n')
    text_lines = []
    seen_lines = set()

    for line in lines:
        line = line.strip()
        # Skip empty lines, WEBVTT header, timestamps, and metadata
        if not line:
            continue
        if line.startswith('WEBVTT'):
            continue
        if line.startswith('Kind:') or line.startswith('Language:'):
            continue
        if re.match(r'^\d{2}:\d{2}', line):  # Timestamp line
            continue
        if re.match(r'^\d+$', line):  # Sequence number
            continue
        if '<' in line:  # Remove HTML tags
            line = re.sub(r'<[^>]+>', '', line)

        # Avoid duplicate consecutive lines (common in auto-generated subs)
        if line and line not in seen_lines:
            text_lines.append(line)
            seen_lines.add(line)

    return ' '.join(text_lines)
