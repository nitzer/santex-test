from pathlib import Path
from typing import Any

from fastapi import UploadFile
from pydantic import BaseModel, Field

from api.config import BASE_DIR, uploads_dir
from api.handlers.base import FileCompletionHandler, register
from api.models import Action, ActionType


class DocumentationUploadCreate(BaseModel):
    document_name: str = Field(title="Nombre del documento")


@register(ActionType.DOCUMENTATION_UPLOAD)
class DocumentationUploadHandler(FileCompletionHandler):
    label = "Subir documentación"
    creation_model = DocumentationUploadCreate

    def __init__(self, upload_dir: Path | None = None) -> None:
        self._upload_dir = upload_dir

    @property
    def upload_dir(self) -> Path:
        return self._upload_dir or uploads_dir()

    def complete(self, action: Action, file: UploadFile) -> dict[str, Any]:
        # Path(...).name strips any directory component a client may have sent.
        filename = Path(file.filename or "").name
        if not filename:
            raise ValueError("file must have a filename")

        target_dir = self.upload_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        destination = target_dir / f"{action.id}_{filename}"
        content = file.file.read()
        destination.write_bytes(content)

        inside_project = destination.is_relative_to(BASE_DIR)
        return {
            "filename": filename,
            "path": str(destination.relative_to(BASE_DIR) if inside_project else destination),
            "size": len(content),
            "content_type": file.content_type or "application/octet-stream",
        }
