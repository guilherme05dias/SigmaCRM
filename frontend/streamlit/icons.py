"""Reusable Lucide icon module for the CRM Streamlit app.

Icons are from the Lucide open-source icon set (https://lucide.dev), ISC/MIT
licensed. The inner SVG markup below was taken verbatim from the official
``lucide-static`` package; the raw source files live in ``assets/icons/``.

Public API:
    SVG_BODY    -- dict mapping icon name -> inner SVG markup
    AVAILABLE   -- sorted list of available icon names
    render(...) -- build a complete inline ``<svg>`` string
    data_uri(...) -- build a ``data:image/svg+xml,...`` URI for CSS

No third-party dependencies (stdlib only). Importing this module has no
side effects.
"""

from urllib.parse import quote

__all__ = ["SVG_BODY", "AVAILABLE", "render", "data_uri"]

# ---------------------------------------------------------------------------
# Inner markup of each icon: everything between <svg ...> and </svg>.
# Path data is copied verbatim from the official Lucide SVGs.
# ---------------------------------------------------------------------------
SVG_BODY: dict[str, str] = {
    "bell": '<path d="M10.268 21a2 2 0 0 0 3.464 0" /> <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />',
    "building-2": '<path d="M10 12h4" /> <path d="M10 8h4" /> <path d="M14 21v-3a2 2 0 0 0-4 0v3" /> <path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" /> <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />',
    "calendar-days": '<path d="M8 2v4" /> <path d="M16 2v4" /> <rect width="18" height="18" x="3" y="4" rx="2" /> <path d="M3 10h18" /> <path d="M8 14h.01" /> <path d="M12 14h.01" /> <path d="M16 14h.01" /> <path d="M8 18h.01" /> <path d="M12 18h.01" /> <path d="M16 18h.01" />',
    "chart-column": '<path d="M3 3v16a2 2 0 0 0 2 2h16" /> <path d="M18 17V9" /> <path d="M13 17V5" /> <path d="M8 17v-3" />',
    "check": '<path d="M20 6 9 17l-5-5" />',
    "circle": '<circle cx="12" cy="12" r="10" />',
    "circle-check": '<circle cx="12" cy="12" r="10" /> <path d="m9 12 2 2 4-4" />',
    "circle-x": '<circle cx="12" cy="12" r="10" /> <path d="m15 9-6 6" /> <path d="m9 9 6 6" />',
    "clipboard-list": '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /> <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /> <path d="M12 11h4" /> <path d="M12 16h4" /> <path d="M8 11h.01" /> <path d="M8 16h.01" />',
    "clipboard-pen": '<path d="M16 4h2a2 2 0 0 1 2 2v2" /> <path d="M21.34 15.664a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" /> <path d="M8 22H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /> <rect x="8" y="2" width="8" height="4" rx="1" />',
    "hard-hat": '<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" /> <path d="M14 6a6 6 0 0 1 6 6v3" /> <path d="M4 15v-3a6 6 0 0 1 6-6" /> <rect x="2" y="15" width="20" height="4" rx="1" />',
    "info": '<circle cx="12" cy="12" r="10" /> <path d="M12 16v-4" /> <path d="M12 8h.01" />',
    "layout-dashboard": '<rect width="7" height="9" x="3" y="3" rx="1" /> <rect width="7" height="5" x="14" y="3" rx="1" /> <rect width="7" height="9" x="14" y="12" rx="1" /> <rect width="7" height="5" x="3" y="16" rx="1" />',
    "log-out": '<path d="m16 17 5-5-5-5" /> <path d="M21 12H9" /> <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />',
    "map": '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /> <path d="M15 5.764v15" /> <path d="M9 3.236v15" />',
    "map-pin": '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /> <circle cx="12" cy="10" r="3" />',
    "message-circle": '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />',
    "mouse-pointer-2": '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />',
    "plus": '<path d="M5 12h14" /> <path d="M12 5v14" />',
    "power": '<path d="M12 2v10" /> <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />',
    "refresh-cw": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /> <path d="M21 3v5h-5" /> <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /> <path d="M8 16H3v5" />',
    "save": '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /> <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /> <path d="M7 3v4a1 1 0 0 0 1 1h7" />',
    "search": '<path d="m21 21-4.34-4.34" /> <circle cx="11" cy="11" r="8" />',
    "settings": '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /> <circle cx="12" cy="12" r="3" />',
    "trash-2": '<path d="M10 11v6" /> <path d="M14 11v6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /> <path d="M3 6h18" /> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
    "trending-up": '<path d="M16 7h6v6" /> <path d="m22 7-8.5 8.5-5-5L2 17" />',
    "triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /> <path d="M12 9v4" /> <path d="M12 17h.01" />',
    "user": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /> <circle cx="12" cy="7" r="4" />',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <path d="M16 3.128a4 4 0 0 1 0 7.744" /> <path d="M22 21v-2a4 4 0 0 0-3-3.87" /> <circle cx="9" cy="7" r="4" />',
    "wrench": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />',
    "x": '<path d="M18 6 6 18" /> <path d="m6 6 12 12" />',
    "zap": '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />',
}

# Sorted list of available icon names.
AVAILABLE: list[str] = sorted(SVG_BODY)


def render(name: str, size: int = 18, stroke_width: float = 2.0, cls: str = "") -> str:
    """Return a complete inline ``<svg>`` string for the given icon.

    The icon uses ``stroke="currentColor"`` so it inherits the surrounding
    text color, and an inline ``style`` so it aligns nicely with text.

    Raises:
        KeyError: if ``name`` is not a known icon.
    """
    try:
        body = SVG_BODY[name]
    except KeyError:
        raise KeyError(
            f"Unknown icon {name!r}. Available icons: {', '.join(AVAILABLE)}"
        ) from None

    klass = f"ds-icon {cls}".strip()
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{size}" height="{size}" viewBox="0 0 24 24" '
        'fill="none" stroke="currentColor" '
        f'stroke-width="{stroke_width}" '
        'stroke-linecap="round" stroke-linejoin="round" '
        f'class="{klass}" '
        'style="display:inline-block;vertical-align:-0.18em;">'
        f"{body}"
        "</svg>"
    )


def data_uri(
    name: str,
    stroke: str = "currentColor",
    size: int = 24,
    stroke_width: float = 2.0,
) -> str:
    """Return a ``data:image/svg+xml,<urlencoded svg>`` URI for CSS use.

    Suitable for CSS ``mask-image`` / ``background-image``. The ``stroke``
    color can be overridden (``currentColor`` is not meaningful inside a
    ``background-image``, so callers usually pass a concrete color).

    Raises:
        KeyError: if ``name`` is not a known icon.
    """
    try:
        body = SVG_BODY[name]
    except KeyError:
        raise KeyError(
            f"Unknown icon {name!r}. Available icons: {', '.join(AVAILABLE)}"
        ) from None

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{size}" height="{size}" viewBox="0 0 24 24" '
        'fill="none" '
        f'stroke="{stroke}" '
        f'stroke-width="{stroke_width}" '
        'stroke-linecap="round" stroke-linejoin="round">'
        f"{body}"
        "</svg>"
    )
    return "data:image/svg+xml," + quote(svg, safe="")
