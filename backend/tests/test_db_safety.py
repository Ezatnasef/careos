from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy.engine import make_url

from app import db
from app import config


@pytest.fixture
def e2e_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    backend_root = tmp_path / "backend"
    database_directory = backend_root / ".e2e-databases"
    database_directory.mkdir(parents=True)
    monkeypatch.setattr(db, "BACKEND_ROOT", backend_root)
    monkeypatch.setattr(db, "DEFAULT_DB_PATH", backend_root / "careos.db")
    monkeypatch.setattr(db, "E2E_DATABASE_DIRECTORY", database_directory)
    monkeypatch.setattr(config, "BACKEND_ROOT", backend_root)
    monkeypatch.setattr(config, "DEFAULT_DB_PATH", backend_root / "careos.db")
    return backend_root, database_directory


def set_database_url(monkeypatch: pytest.MonkeyPatch, database_url: str) -> None:
    monkeypatch.setattr(db, "engine", SimpleNamespace(url=make_url(database_url)))


@pytest.mark.parametrize(
    "relative",
    [
        False,
        True,
    ],
)
def test_rejects_development_database_paths(
    relative: bool,
    monkeypatch: pytest.MonkeyPatch,
    e2e_paths: tuple[Path, Path],
) -> None:
    backend_root, _ = e2e_paths
    normalized_url = (
        config.Settings(database_url="sqlite+aiosqlite:///./careos.db").database_url
        if relative
        else f"sqlite+aiosqlite:///{(backend_root / 'careos.db').as_posix()}"
    )
    if relative:
        assert make_url(normalized_url).database == (backend_root / "careos.db").as_posix()

    set_database_url(monkeypatch, normalized_url)

    with pytest.raises(RuntimeError, match="development database"):
        db._validate_test_database_path()


def test_rejects_database_outside_e2e_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    e2e_paths: tuple[Path, Path],
) -> None:
    backend_root, _ = e2e_paths
    outside_database = tmp_path / "elsewhere" / "test.db"
    set_database_url(monkeypatch, f"sqlite+aiosqlite:///{outside_database.as_posix()}")

    with pytest.raises(RuntimeError, match="directly inside"):
        db._validate_test_database_path()


@pytest.mark.parametrize(
    "database_url",
    ["sqlite+aiosqlite://"],
)
def test_rejects_sqlite_url_without_file_path(
    database_url: str,
    monkeypatch: pytest.MonkeyPatch,
    e2e_paths: tuple[Path, Path],
) -> None:
    set_database_url(monkeypatch, database_url)

    with pytest.raises(RuntimeError, match="must use a file"):
        db._validate_test_database_path()


def test_rejects_sqlite_in_memory_database(
    monkeypatch: pytest.MonkeyPatch,
    e2e_paths: tuple[Path, Path],
) -> None:
    set_database_url(monkeypatch, "sqlite+aiosqlite:///:memory:")

    with pytest.raises(RuntimeError, match="directly inside"):
        db._validate_test_database_path()


def test_rejects_existing_e2e_database(
    monkeypatch: pytest.MonkeyPatch,
    e2e_paths: tuple[Path, Path],
) -> None:
    _, database_directory = e2e_paths
    database_file = database_directory / "already-exists.db"
    database_file.touch()
    set_database_url(monkeypatch, f"sqlite+aiosqlite:///{database_file.as_posix()}")

    with pytest.raises(RuntimeError, match="existing test database"):
        db._validate_test_database_path()


def test_accepts_new_database_inside_e2e_directory(
    monkeypatch: pytest.MonkeyPatch,
    e2e_paths: tuple[Path, Path],
) -> None:
    _, database_directory = e2e_paths
    database_file = database_directory / "new-e2e-database.db"
    set_database_url(monkeypatch, f"sqlite+aiosqlite:///{database_file.as_posix()}")

    db._validate_test_database_path()


@pytest.mark.asyncio
async def test_validation_failure_prevents_drop_all(
    monkeypatch: pytest.MonkeyPatch,
    e2e_paths: tuple[Path, Path],
) -> None:
    backend_root, _ = e2e_paths
    begin = Mock()
    drop_all = Mock()
    monkeypatch.setattr(
        db,
        "settings",
        SimpleNamespace(app_env="test", database_url="sqlite+aiosqlite:///./careos.db"),
    )
    monkeypatch.setattr(
        db,
        "engine",
        SimpleNamespace(
            url=make_url(f"sqlite+aiosqlite:///{(backend_root / 'careos.db').as_posix()}"),
            begin=begin,
        ),
    )
    monkeypatch.setattr(db.Base.metadata, "drop_all", drop_all)

    with pytest.raises(RuntimeError, match="development database"):
        await db._initialize_schema()

    begin.assert_not_called()
    drop_all.assert_not_called()


def test_rejects_symlinked_database_directory_when_supported(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    e2e_paths: tuple[Path, Path],
) -> None:
    backend_root, _ = e2e_paths
    target_directory = tmp_path / "redirected-e2e-databases"
    target_directory.mkdir()
    linked_directory = backend_root / ".e2e-databases-link"
    try:
        linked_directory.symlink_to(target_directory, target_is_directory=True)
    except NotImplementedError as error:
        pytest.skip(f"Directory symlinks are unavailable in this environment: {error}")
    except OSError as error:
        if getattr(error, "winerror", None) == 1314:
            pytest.skip(f"Directory symlink creation requires a Windows privilege: {error}")
        raise

    monkeypatch.setattr(db, "E2E_DATABASE_DIRECTORY", linked_directory)
    database_file = linked_directory / "new-e2e-database.db"
    set_database_url(monkeypatch, f"sqlite+aiosqlite:///{database_file.as_posix()}")

    with pytest.raises(RuntimeError, match="symlink"):
        db._validate_test_database_path()


def test_rejects_file_symlink_resolving_outside_e2e_directory_when_supported(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    e2e_paths: tuple[Path, Path],
) -> None:
    _, database_directory = e2e_paths
    external_target = tmp_path / "external.db"
    external_target.touch()
    database_link = database_directory / "linked.db"
    try:
        database_link.symlink_to(external_target)
    except NotImplementedError as error:
        pytest.skip(f"File symlinks are unavailable in this environment: {error}")
    except OSError as error:
        if getattr(error, "winerror", None) == 1314:
            pytest.skip(f"File symlink creation requires a Windows privilege: {error}")
        raise

    set_database_url(monkeypatch, f"sqlite+aiosqlite:///{database_link.as_posix()}")

    with pytest.raises(RuntimeError, match="directly inside"):
        db._validate_test_database_path()
