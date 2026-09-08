from sqlmodel import Session, select

from api.models import Action, ActionStatus, ActionType


class ActionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_all(
        self,
        status: ActionStatus | None = None,
        type: ActionType | None = None,
    ) -> list[Action]:
        statement = select(Action)
        if status is not None:
            statement = statement.where(Action.status == status)
        if type is not None:
            statement = statement.where(Action.type == type)
        return list(self.session.exec(statement.order_by(Action.created_at)).all())

    def get_by_id(self, id: str) -> Action | None:
        return self.session.get(Action, id)

    def save(self, action: Action) -> Action:
        self.session.add(action)
        self.session.commit()
        self.session.refresh(action)
        return action
