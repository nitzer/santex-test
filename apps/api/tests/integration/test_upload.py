import io
from pathlib import Path

from fastapi.testclient import TestClient

from api.models import ActionType


def post_runbook(client: TestClient, action_id: str, key: str = "upload-key"):
    return client.post(
        f"/actions/{action_id}/upload",
        files={"file": ("runbook.md", io.BytesIO(b"# runbook\n"), "text/markdown")},
        headers={"Idempotency-Key": key},
    )


def test_upload_stores_the_file_and_fills_the_result(
    client: TestClient, action_id_of, uploads_dir: Path
):
    action_id = action_id_of(ActionType.DOCUMENTATION_UPLOAD)

    response = post_runbook(client, action_id)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["result"] == {
        "filename": "runbook.md",
        "path": str(uploads_dir / f"{action_id}_runbook.md"),
        "size": 10,
        "content_type": "text/markdown",
    }
    assert (uploads_dir / f"{action_id}_runbook.md").read_bytes() == b"# runbook\n"


def test_upload_replays_on_the_same_key_without_writing_twice(
    client: TestClient, action_id_of, uploads_dir: Path
):
    action_id = action_id_of(ActionType.DOCUMENTATION_UPLOAD)

    first = post_runbook(client, action_id)
    second = post_runbook(client, action_id)

    assert first.json() == second.json()
    assert len(list(uploads_dir.iterdir())) == 1


def test_upload_with_a_new_key_on_a_completed_action_returns_409(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.DOCUMENTATION_UPLOAD)
    post_runbook(client, action_id, key="up-1")

    assert post_runbook(client, action_id, key="up-2").status_code == 409


def test_upload_requires_a_file(client: TestClient, action_id_of):
    action_id = action_id_of(ActionType.DOCUMENTATION_UPLOAD)

    response = client.post(
        f"/actions/{action_id}/upload", headers={"Idempotency-Key": "no-file"}
    )

    assert response.status_code == 422
