import subprocess
import re
import os
from pathlib import Path

from videos import EDUCATIONAL_VIDEOS

# Educational video IDs and titles (from categorization)


TRANSCRIPTS_DIR = Path("transcripts")

def transcribe():
    print(f"Transcribing {len(EDUCATIONAL_VIDEOS)} educational videos...\n")

    TRANSCRIPTS_DIR.mkdir(exist_ok=True)

    success = 0
    failed = 0

    for video_id, title in EDUCATIONAL_VIDEOS:
        print(f"Processing: {title[:50]}...")
        if download_transcript(video_id, title):
            success += 1
        else:
            failed += 1

    print(f"\nDone! Success: {success}, Failed: {failed}")
    print(f"Transcripts saved to: {TRANSCRIPTS_DIR.absolute()}")

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


def download_transcript(video_id: str, title: str) -> bool:
    """Download and convert transcript for a video."""
    filename = sanitize_filename(title)
    output_path = TRANSCRIPTS_DIR / f"{filename}.md"

    if output_path.exists():
        print(f"  [SKIP] Already exists: {filename}.md")
        return True

    url = f"https://www.youtube.com/watch?v={video_id}"

    # Download subtitles using yt-dlp
    try:
        result = subprocess.run(
            [
                "uv", "run", "yt-dlp",
                "--write-auto-sub",
                "--sub-lang", "en",
                "--skip-download",
                "--sub-format", "vtt",
                "-o", f"/tmp/transcript_{video_id}",
                url
            ],
            capture_output=True,
            text=True,
            timeout=60
        )

        # Find the downloaded subtitle file
        vtt_file = None
        for ext in ['.en.vtt', '.en-orig.vtt', '.vtt']:
            potential_file = f"/tmp/transcript_{video_id}{ext}"
            if os.path.exists(potential_file):
                vtt_file = potential_file
                break

        if not vtt_file:
            print(f"  [FAIL] No subtitles found for: {title}")
            return False

        # Read and parse VTT
        with open(vtt_file, 'r', encoding='utf-8') as f:
            vtt_content = f.read()

        transcript_text = parse_vtt(vtt_content)

        # Write markdown file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"# {title}\n\n")
            f.write(f"**Video:** https://youtube.com/watch?v={video_id}\n\n")
            f.write("---\n\n")
            f.write(transcript_text)

        # Cleanup temp file
        os.remove(vtt_file)

        print(f"  [OK] {filename}.md")
        return True

    except subprocess.TimeoutExpired:
        print(f"  [TIMEOUT] {title}")
        return False
    except Exception as e:
        print(f"  [ERROR] {title}: {e}")
        return False



