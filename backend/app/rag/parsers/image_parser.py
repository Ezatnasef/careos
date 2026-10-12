import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from PIL import Image, ImageOps

from app.rag.parsers.base_parser import BaseParser
from app.rag.parsers.unified_document import UnifiedDocument

logger = logging.getLogger("careos.rag.parsers.image")

SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


class ImageParser(BaseParser):
    """Parser for standalone medical images (clinical photos, scanned prescriptions, lab slips)."""

    def __init__(self, apply_preprocessing: bool = True):
        self.apply_preprocessing = apply_preprocessing

    def validate_image(self, file_path: Union[str, Path]) -> Dict[str, Any]:
        """Validate image existence, format support, and integrity."""
        path = Path(file_path)
        if not path.is_file():
            raise FileNotFoundError(f"Image file not found: {file_path}")

        ext = path.suffix.lower()
        if ext not in SUPPORTED_IMAGE_EXTENSIONS:
            raise ValueError(
                f"Unsupported image extension '{ext}'. Supported formats: {sorted(SUPPORTED_IMAGE_EXTENSIONS)}"
            )

        try:
            with Image.open(path) as img:
                img.verify()
            with Image.open(path) as img:
                return {
                    "file_name": path.name,
                    "format": img.format,
                    "mode": img.mode,
                    "width": img.width,
                    "height": img.height,
                }
        except Exception as e:
            raise ValueError(f"Corrupted or invalid image file '{file_path}': {str(e)}") from e

    def preprocess_image(self, pil_image: Image.Image) -> Image.Image:
        """Apply safe in-memory preprocessing for OCR (EXIF orientation, grayscale, autocontrast)."""
        image = ImageOps.exif_transpose(pil_image)
        image = image.convert("L")
        image = ImageOps.autocontrast(image)
        return image

    def parse(
        self,
        file_path: Union[str, Path],
        ocr_engine: Optional[str] = None,
        ocr_router: Optional[Any] = None,
        custom_prompt: Optional[str] = None,
        **kwargs: Any,
    ) -> List[UnifiedDocument]:
        """Process image file, execute OCR, and return a UnifiedDocument list.

        Args:
            file_path: Path to the image.
            ocr_engine: 'printed' (PaddleOCR) or 'handwriting' (Qwen-VL).
            ocr_router: Optional OCRRouter instance.
            custom_prompt: Optional prompt for handwriting vision models.

        Returns:
            List of UnifiedDocument instances with extracted text and OCR metadata.
        """
        path = Path(file_path)
        info = self.validate_image(path)

        with Image.open(path) as raw_img:
            img_to_process = raw_img.copy()

        if self.apply_preprocessing:
            img_to_process = self.preprocess_image(img_to_process)

        if ocr_router is None:
            from app.rag.ocr.ocr_router import get_ocr_router
            ocr_router = get_ocr_router()

        ocr_result = ocr_router.extract_text(
            image=img_to_process,
            engine_type=ocr_engine,
            custom_prompt=custom_prompt,
        )

        extracted_text = (ocr_result.get("text") or "").strip()
        if not extracted_text:
            return []

        doc = UnifiedDocument(
            text=extracted_text,
            source=path.name,
            page=1,
            source_type="image",
            ocr_applied=True,
            ocr_engine=ocr_result.get("ocr_engine"),
            metadata={
                "image_format": info["format"],
                "width": info["width"],
                "height": info["height"],
                "ocr_confidence": ocr_result.get("confidence"),
                "ocr_status": ocr_result.get("status"),
            },
        )

        return [doc]

