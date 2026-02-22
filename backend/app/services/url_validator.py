import ipaddress
import socket
from urllib.parse import urlparse


def validate_url(url: str) -> str:
    """Validate URL for safety (SSRF protection). Returns normalized URL or raises ValueError."""
    try:
        parsed = urlparse(url)
    except Exception:
        raise ValueError(f"Invalid URL format: {url}")

    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"URL scheme must be http or https, got: {parsed.scheme}")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL must have a hostname")

    blocked_hostnames = {"localhost", "0.0.0.0"}
    if hostname.lower() in blocked_hostnames:
        raise ValueError(f"Blocked hostname: {hostname}")

    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise ValueError(f"Cannot resolve hostname: {hostname}")

    for addr_info in addr_infos:
        ip_str = addr_info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue

        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError(
                f"URL resolves to blocked IP address: {ip_str}"
            )

    return url
