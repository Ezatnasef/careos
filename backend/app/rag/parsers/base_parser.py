from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, List, Union

from app.rag.parsers.unified_document import UnifiedDocument


class BaseParser(ABC):
    """Abstract base class for all document format parsers in CareOS Medical RAG."""

    @abstractmethod
    def parse(
        self,
        file_path: Union[str, Path],
        **kwargs: Any,
    ) -> List[UnifiedDocument]:
        """Parse a document and extract structured text pages/sections.

        Args:
            file_path: Path to the input document.
            **kwargs: Parser-specific options (e.g., OCR engine, DPI settings).

        Returns:
            List of UnifiedDocument instances.
        """
        pass

