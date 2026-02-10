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
