from sqlmodel import Session

from api.models import IdempotencyRecord


class IdempotencyRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_key(self, key: str) -> IdempotencyRecord | None:
        return self.session.get(IdempotencyRecord, key)

    def save(self, record: IdempotencyRecord) -> IdempotencyRecord:
        self.session.add(record)
        self.session.commit()
        self.session.refresh(record)
        return record
