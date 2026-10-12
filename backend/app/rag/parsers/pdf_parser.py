import io
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from PIL import Image

from app.rag.parsers.base_parser import BaseParser
from app.rag.parsers.unified_document import UnifiedDocument

logger = logging.getLogger("careos.rag.parsers.pdf")


class PDFParser(BaseParser):
    """Parser for digital and scanned PDF documents with page-aware extraction and optional OCR fallback."""

    def __init__(self, enable_ocr_fallback: bool = True):
        self.enable_ocr_fallback = enable_ocr_fallback

    def detect_pdf_type(self, file_path: Union[str, Path]) -> Dict[str, Any]:
        """Inspect PDF and determine whether it contains extractable digital text or is scanned."""
        path = Path(file_path)
        if not path.is_file():
            raise FileNotFoundError(f"PDF file not found: {file_path}")

        try:
            import fitz
            doc = fitz.open(str(path))
            try:
                page_count = len(doc)
                total_text_chars = sum(len(page.get_text("text").strip()) for page in doc)
            finally:
                doc.close()
        except ImportError:
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            page_count = len(reader.pages)
            total_text_chars = sum(
                len((page.extract_text() or "").strip()) for page in reader.pages
            )

        pdf_type = "digital" if total_text_chars > 0 else "scanned"
        return {
            "file_name": path.name,
            "page_count": page_count,
            "total_text_chars": total_text_chars,
            "pdf_type": pdf_type,
        }

    def parse(
        self,
        file_path: Union[str, Path],
        ocr_engine: Optional[str] = None,
        ocr_router: Optional[Any] = None,
        **kwargs: Any,
    ) -> List[UnifiedDocument]:
        """Extract text from PDF pages, falling back to OCR for scanned pages if enabled.

        Args:
            file_path: Absolute or relative path to PDF document.
            ocr_engine: Optional OCR engine name ('printed' or 'handwriting').
            ocr_router: Optional OCRRouter instance for scanned pages.
            **kwargs: Additional parameters.

        Returns:
            List of UnifiedDocument objects (one per non-empty page).
        """
        path = Path(file_path)
        if not path.is_file():
            raise FileNotFoundError(f"PDF file not found at: {file_path}")

        filename = path.name
        documents: List[UnifiedDocument] = []

        has_fitz = False
        try:
            import fitz
            has_fitz = True
        except ImportError:
            has_fitz = False

        if has_fitz:
            import fitz
            try:
                doc = fitz.open(str(path))
            except Exception as e:
                raise ValueError(f"Failed to read PDF '{file_path}': {str(e)}") from e

            try:
                for page_idx, page in enumerate(doc, start=1):
                    page_text = page.get_text("text").strip()

                    if page_text:
                        documents.append(
                            UnifiedDocument(
                                text=page_text,
                                source=filename,
                                page=page_idx,
                                source_type="pdf",
                                ocr_applied=False,
                                metadata={"extractor": "pymupdf_digital", "page_count": len(doc)},
                            )
                        )
                    elif self.enable_ocr_fallback:
                        # Attempt OCR on scanned page
                        ocr_result = self._rasterize_and_ocr(
                            page=page,
                            ocr_engine=ocr_engine,
                            ocr_router=ocr_router,
                        )
                        if ocr_result and ocr_result.get("text"):
                            documents.append(
                                UnifiedDocument(
                                    text=ocr_result["text"],
                                    source=filename,
                                    page=page_idx,
                                    source_type="pdf",
                                    ocr_applied=True,
                                    ocr_engine=ocr_result.get("ocr_engine"),
                                    metadata={
                                        "extractor": "ocr_rasterized",
                                        "ocr_confidence": ocr_result.get("confidence"),
                                        "page_count": len(doc),
                                    },
                                )
                            )
            finally:
                doc.close()
        else:
            # Fallback to pypdf
            from pypdf import PdfReader
            try:
                reader = PdfReader(str(path))
            except Exception as e:
                raise ValueError(f"Failed to read PDF '{file_path}': {str(e)}") from e

            for page_idx, page in enumerate(reader.pages, start=1):
                extracted_text = (page.extract_text() or "").strip()
                if extracted_text:
                    documents.append(
                        UnifiedDocument(
                            text=extracted_text,
                            source=filename,
                            page=page_idx,
                            source_type="pdf",
                            ocr_applied=False,
                            metadata={"extractor": "pypdf_digital", "page_count": len(reader.pages)},
                        )
                    )

        return documents

    def _rasterize_and_ocr(
        self,
        page: Any,
        ocr_engine: Optional[str] = None,
        ocr_router: Optional[Any] = None,
    ) -> Optional[Dict[str, Any]]:
        """Rasterize a single PDF page to a PIL Image and run OCR."""
        try:
            import fitz
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
            img_bytes = pixmap.tobytes("png")
            pil_img = Image.open(io.BytesIO(img_bytes))

            if ocr_router is None:
                from app.rag.ocr.ocr_router import get_ocr_router
                ocr_router = get_ocr_router()

            return ocr_router.extract_text(pil_img, engine_type=ocr_engine)
        except Exception as e:
            logger.warning(f"Scanned PDF page OCR skipped or failed: {e}")
            return None

