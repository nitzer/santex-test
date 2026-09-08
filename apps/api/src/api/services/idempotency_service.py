from typing import Any

from api.models import IdempotencyRecord
from api.repositories.idempotency_repository import IdempotencyRepository


class IdempotencyService:
    def __init__(self, records: IdempotencyRepository) -> None:
        self.records = records

    def get_cached(self, key: str) -> tuple[int, dict[str, Any]] | None:
        record = self.records.get_by_key(key)
        if record is None:
            return None
        return record.response_status, record.response_body

    def store(
        self,
        key: str,
        action_id: str,
        endpoint: str,
        status_code: int,
        body: dict[str, Any],
    ) -> None:
        self.records.save(
            IdempotencyRecord(
                key=key,
                action_id=action_id,
                endpoint=endpoint,
                response_status=status_code,
                response_body=body,
            )
        )
