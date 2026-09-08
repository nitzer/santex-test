from sqlmodel import Session

from api.models import ActionStatus, ActionType, IdempotencyRecord
from api.repositories.action_repository import ActionRepository
from api.repositories.idempotency_repository import IdempotencyRepository


def test_save_and_get_by_id(session: Session, make_action):
    repo = ActionRepository(session)

    saved = repo.save(make_action(ActionType.EXPENSE_APPROVAL, {"k": "v"}))
    found = repo.get_by_id(saved.id)

    assert found is not None
    assert found.id == saved.id
    assert found.type is ActionType.EXPENSE_APPROVAL
    assert found.status is ActionStatus.PENDING
    assert found.payload == {"k": "v"}
    assert found.result is None


def test_get_by_id_returns_none_when_missing(session: Session):
    assert ActionRepository(session).get_by_id("nope") is None


def test_get_all_filters_by_status_and_type(session: Session, make_action):
    repo = ActionRepository(session)
    repo.save(make_action(ActionType.EXPENSE_APPROVAL))
    repo.save(make_action(ActionType.ONBOARDING, status=ActionStatus.COMPLETED))

    assert len(repo.get_all()) == 2
    assert len(repo.get_all(status=ActionStatus.PENDING)) == 1
    assert len(repo.get_all(type=ActionType.ONBOARDING)) == 1
    assert repo.get_all(status=ActionStatus.PENDING, type=ActionType.ONBOARDING) == []


def test_idempotency_repository_saves_and_reads_by_key(session: Session):
    repo = IdempotencyRepository(session)

    repo.save(
        IdempotencyRecord(
            key="k-1",
            action_id="a-1",
            endpoint="complete",
            response_status=200,
            response_body={"ok": True},
        )
    )
    found = repo.get_by_key("k-1")

    assert found is not None
    assert found.action_id == "a-1"
    assert found.endpoint == "complete"
    assert found.response_status == 200
    assert found.response_body == {"ok": True}


def test_idempotency_repository_returns_none_for_an_unknown_key(session: Session):
    assert IdempotencyRepository(session).get_by_key("missing") is None
