import json
import logging
from datetime import UTC, datetime

# Attributes every LogRecord carries; anything else came in through `extra=`.
_STANDARD = set(vars(logging.makeLogRecord({}))) | {"message", "asctime", "request_id"}


class JsonFormatter(logging.Formatter):
    """One JSON object per line, for log aggregators (LOG_FORMAT=json).

    Only the message, the request id and explicit `extra=` fields are emitted,
    so nothing reaches the log that the calling code did not choose to log.
    """

    def format(self, record):
        entry = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        for key, value in vars(record).items():
            if key not in _STANDARD and not key.startswith("_"):
                entry[key] = value
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)
