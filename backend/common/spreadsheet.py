"""CSV helpers for staff exports."""

import csv
import io

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value):
    """Stops spreadsheet apps from running user-supplied text (a name such as
    "=HYPERLINK(...)") as a formula. Numbers are left alone."""
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def csv_text(header: list[str], rows) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        writer.writerow([safe_cell(v) for v in row])
    return buffer.getvalue()
