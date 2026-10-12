import logging
from pathlib import Path
from typing import Any, Dict, Optional, Union
from PIL import Image

from app.rag.ocr.ocr_engine import OCREngine
from app.rag.ocr.handwriting_ocr import HandwritingOCREngine

logger = logging.getLogger("careos.rag.ocr")


class OCRRouter:
    """Dispatches OCR tasks to either printed text OCR or handwriting vision-language models."""

    def __init__(
        self,
        default_engine: str = "printed",
        printed_lang: str = "ar",
        handwriting_device: str = "auto",
    ):
        self.default_engine = default_engine
        self._printed_engine = OCREngine(lang=printed_lang, auto_init=False)
        self._handwriting_engine = HandwritingOCREngine(device=handwriting_device, auto_init=False)

    def extract_text(
        self,
        image: Union[str, Path, Image.Image],
        engine_type: Optional[str] = None,
        custom_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Extract text from an image routing to the appropriate OCR engine.

        Args:
            image: Path to image file or PIL Image object.
            engine_type: 'printed', 'handwriting', or None (uses default).
            custom_prompt: Optional prompt override for handwriting engine.

        Returns:
            Dict containing text, ocr_engine, confidence/status metadata.
        """
        selected_type = (engine_type or self.default_engine).lower()

        if selected_type in ["handwriting", "handwritten", "qwen"]:
            return self._handwriting_engine.extract_text(image, custom_prompt=custom_prompt)
        elif selected_type in ["printed", "paddle", "paddleocr"]:
            return self._printed_engine.extract_text(image)
        else:
            raise ValueError(
                f"Unsupported OCR engine type '{engine_type}'. Choose 'printed' or 'handwriting'."
            )

    def is_ocr_available(self, engine_type: str = "printed") -> bool:
        """Check availability of the designated OCR engine without loading weights."""
        if engine_type in ["handwriting", "handwritten", "qwen"]:
            return self._handwriting_engine.is_available()
        return self._printed_engine.is_available()


_default_ocr_router: Optional[OCRRouter] = None


def get_ocr_router() -> OCRRouter:
    """Get or create singleton OCR router instance."""
    global _default_ocr_router
    if _default_ocr_router is None:
        _default_ocr_router = OCRRouter()
    return _default_ocr_router

