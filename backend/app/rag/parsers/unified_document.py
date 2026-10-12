from dataclasses import dataclass, field, asdict
from typing import Any, Dict, Optional


@dataclass
class UnifiedDocument:
    """Standardized internal representation for extracted clinical documents across all parsers."""

    text: str
    source: str
    page: int = 1
    source_type: str = "pdf"  # "pdf", "docx", "image", etc.
    ocr_applied: bool = False
    ocr_engine: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert UnifiedDocument instance into a dictionary compatible with CareOS chunker and store."""
        data = asdict(self)
        if not self.metadata:
            data["metadata"] = {}
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "UnifiedDocument":
        """Instantiate a UnifiedDocument from a dictionary."""
        return cls(
            text=data.get("text", ""),
            source=data.get("source", "unknown"),
            page=data.get("page", 1),
            source_type=data.get("source_type", "pdf"),
            ocr_applied=data.get("ocr_applied", False),
            ocr_engine=data.get("ocr_engine"),
            metadata=data.get("metadata", {}),
        )

