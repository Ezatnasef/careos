from pathlib import Path
from typing import Any, List, Union

from app.rag.parsers.base_parser import BaseParser
from app.rag.parsers.docx_parser import DocxParser
from app.rag.parsers.image_parser import ImageParser, SUPPORTED_IMAGE_EXTENSIONS
from app.rag.parsers.pdf_parser import PDFParser
from app.rag.parsers.unified_document import UnifiedDocument

SUPPORTED_DOCUMENT_EXTENSIONS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
}


def detect_document_format(file_path: Union[str, Path]) -> str:
    """Detect format type for a given document file path.

    Returns:
        One of 'pdf', 'docx', 'image'.

    Raises:
        ValueError: If file extension is unsupported.
    """
    ext = Path(file_path).suffix.lower()
    if ext not in SUPPORTED_DOCUMENT_EXTENSIONS:
        raise ValueError(
            f"Unsupported document format '{ext}'. Supported formats: {sorted(SUPPORTED_DOCUMENT_EXTENSIONS.keys())}"
        )
    return SUPPORTED_DOCUMENT_EXTENSIONS[ext]


def get_parser_for_file(file_path: Union[str, Path]) -> BaseParser:
    """Instantiate appropriate parser for given document format."""
    fmt = detect_document_format(file_path)
    if fmt == "pdf":
        return PDFParser()
    elif fmt == "docx":
        return DocxParser()
    elif fmt == "image":
        return ImageParser()
    else:
        raise ValueError(f"No parser available for format '{fmt}'.")


def load_unified_documents(
    file_path: Union[str, Path],
    **kwargs: Any,
) -> List[UnifiedDocument]:
    """Parse any supported medical document format into UnifiedDocument instances."""
    parser = get_parser_for_file(file_path)
    return parser.parse(file_path, **kwargs)


__all__ = [
    "BaseParser",
    "PDFParser",
    "DocxParser",
    "ImageParser",
    "UnifiedDocument",
    "SUPPORTED_DOCUMENT_EXTENSIONS",
    "SUPPORTED_IMAGE_EXTENSIONS",
    "detect_document_format",
    "get_parser_for_file",
    "load_unified_documents",
]

