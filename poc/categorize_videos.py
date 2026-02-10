import re

def categorize_video(title: str) -> str:
    title_lower = title.lower()

    # Educational/Tutorials
    educational_patterns = [
        r'for beginners', r'how to', r'when to', r'step.by.step',
        r'tips.*tricks', r'guidebook', r'scanner', r'strategy', r'strategies',
        r'criteria', r'indicator', r'3 bar play', r'vwap', r'confirmation',
        r'grow.*account', r'webull', r'correct way', r'trading 101'
    ]
    for pattern in educational_patterns:
        if re.search(pattern, title_lower):
            return "Educational & Tutorials"

    # Congress/Insider Trading
    insider_patterns = [
        r'congress', r'pelosi', r'warren buffet', r'buffett',
        r'white house.*buying', r'government'
    ]
    for pattern in insider_patterns:
        if re.search(pattern, title_lower):
            return "Congress & Insider Moves"

    # Market News/Alerts/Emergency
    news_patterns = [
        r'emergency', r'breaking', r'urgent', r'crash', r'crisis',
        r'brace', r'warning', r'watch before', r'act now', r'do this now',
        r'do this asap', r'all holders watch', r'all investors', r'all buyers watch',
        r'time sensitive', r'24.?hrs', r'before monday', r'before open',
        r'before tomorrow', r'collapsing', r'exploding', r'plunged',
        r'shock', r'insanity', r'terrifying', r'bombshell'
    ]
    for pattern in news_patterns:
        if re.search(pattern, title_lower):
            return "Market News & Alerts"

    # Stock Picks/Recommendations
    picks_patterns = [
        r'\d+ stocks? to buy', r'stocks? to buy now', r'buy heavy',
        r'buy this stock', r'buy .+ stock', r'is a buy', r'is a great buy',
        r'stock has.*potential', r'stock has.*upside', r'undervalued',
        r'steal of a century', r'can change.*lives', r'will surge',
        r'will fly', r'will dominate', r'penny stock', r'cheap stock',
        r'top \d+ stocks', r'high.potential stocks', r'ai stock',
        r'\$[\d.]+ stock', r'stock @ \$', r'buy @ \$', r'buy now',
        r'stock is a buy', r'stock will', r'this stock', r'tiny stock',
        r'small stock', r'price target', r'next nvidia'
    ]
    for pattern in picks_patterns:
        if re.search(pattern, title_lower):
            return "Stock Picks & Analysis"

    # Market Commentary (Trump, Fed, macro, general market talk)
    commentary_patterns = [
        r'trump', r'fed ', r'federal reserve', r'japan', r'china',
        r'market', r'tom lee', r'cathie wood', r'greenland', r'silver',
        r'gold', r'defense', r'debt', r'bitcoin', r'crypto', r'squeeze',
        r'rally', r'meltup', r'flood', r'reset', r'bailout'
    ]
    for pattern in commentary_patterns:
        if re.search(pattern, title_lower):
            return "Market Commentary & Macro"

    # Default fallback
    return "Stock Picks & Analysis"


def main():
    categories = {}

    with open('/tmp/ziptrader_raw.txt', 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split('|||')
            if len(parts) < 3:
                continue

            views = parts[0]
            video_id = parts[1]
            title = parts[2]

            try:
                views_int = int(views)
            except ValueError:
                views_int = 0

            category = categorize_video(title)

            if category not in categories:
                categories[category] = []

            categories[category].append({
                'views': views_int,
                'title': title,
                'video_id': video_id
            })

    # Write markdown file
    with open('ZipTrader_videos.md', 'w') as f:
        f.write("# ZipTrader YouTube Videos\n\n")
        f.write(f"**Total Videos:** {sum(len(v) for v in categories.values())}\n\n")
        f.write("## Summary by Category\n\n")

        # Summary table
        f.write("| Category | Videos | Total Views |\n")
        f.write("|----------|-------:|------------:|\n")

        category_order = [
            "Educational & Tutorials",
            "Stock Picks & Analysis",
            "Congress & Insider Moves",
            "Market News & Alerts",
            "Market Commentary & Macro"
        ]

        for cat in category_order:
            if cat in categories:
                videos = categories[cat]
                total_views = sum(v['views'] for v in videos)
                f.write(f"| {cat} | {len(videos)} | {total_views:,} |\n")

        f.write("\n---\n\n")

        # Detailed sections by category
        for cat in category_order:
            if cat not in categories:
                continue

            videos = sorted(categories[cat], key=lambda x: x['views'], reverse=True)
            f.write(f"## {cat}\n\n")
            f.write("| Views | Title | Link |\n")
            f.write("|------:|-------|------|\n")

            for v in videos:
                views_formatted = f"{v['views']:,}"
                title_escaped = v['title'].replace('|', '\\|')
                link = f"[Watch](https://youtube.com/watch?v={v['video_id']})"
                f.write(f"| {views_formatted} | {title_escaped} | {link} |\n")

            f.write("\n")

    print("Done! Written to ZipTrader_videos.md")

    # Print summary
    for cat in category_order:
        if cat in categories:
            print(f"{cat}: {len(categories[cat])} videos")


if __name__ == "__main__":
    main()
