"""Keep completed model results beside the local video files."""

from collections.abc import Callable
from hashlib import sha256
import json
import logging
from threading import Lock
from typing import TypeVar
from uuid import uuid4
from weakref import WeakValueDictionary

from pydantic import BaseModel

from media import DATA_DIR

CACHE_DIR = DATA_DIR / "results"
Result = TypeVar("Result", bound=BaseModel)
_logger = logging.getLogger(__name__)
_locks = WeakValueDictionary()
_locks_guard = Lock()


def cache_key(kind: str, *parts: str) -> str:
    digest = sha256(json.dumps(parts, ensure_ascii=False).encode("utf-8")).hexdigest()
    return f"{kind}-{digest}"


def cached_result(key: str, schema: type[Result], compute: Callable[[], Result]) -> Result:
    with _locks_guard:
        lock = _locks.get(key)
        if lock is None:
            lock = Lock()
            _locks[key] = lock

    path = CACHE_DIR / f"{key}.json"
    with lock:
        try:
            return schema.model_validate_json(path.read_bytes())
        except (OSError, ValueError):
            pass

        result = compute()
        temp = path.with_suffix(f".{uuid4().hex}.tmp")
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            temp.write_text(result.model_dump_json(), encoding="utf-8")
            temp.replace(path)
        except OSError:
            _logger.warning("Could not save a completed Reel2Build model result.")
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                _logger.warning("Could not remove a temporary Reel2Build result file.")
        return result
