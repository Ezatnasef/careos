import csv
import io
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, Union
from PIL import Image


class OCREngine:
    """Printed OCR engine preferring PaddleOCR and falling back to local Tesseract."""

    def __init__(self, lang: str = "ar", auto_init: bool = False):
        self.lang = lang
        self._engine = None
        if auto_init:
            self._get_engine()

    def _get_engine(self):
        if self._engine is None:
            try:
                os.environ["FLAGS_enable_pir_api"] = "0"
                os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
                try:
                    import torch  # noqa: F401
                except Exception:
                    pass
                from paddleocr import PaddleOCR

                try:
                    rec_model_map = {
                        "ar": "arabic_PP-OCRv5_mobile_rec",
                        "en": "en_PP-OCRv5_mobile_rec",
                    }
                    rec_model = rec_model_map.get(self.lang)
                    init_kwargs: Dict[str, Any] = {
                        "use_doc_orientation_classify": False,
                        "use_doc_unwarping": False,
                        "use_textline_orientation": False,
                        "enable_mkldnn": False,
                    }
                    if rec_model is not None:
                        init_kwargs["text_detection_model_name"] = "PP-OCRv5_mobile_det"
                        init_kwargs["text_recognition_model_name"] = rec_model
                    else:
                        init_kwargs["lang"] = self.lang
                    self._engine = PaddleOCR(**init_kwargs)
                except (TypeError, ValueError):
                    self._engine = PaddleOCR(lang=self.lang, enable_mkldnn=False)
            except ImportError as e:
                raise RuntimeError(
                    f"PaddleOCR is not installed or unavailable ({e}). "
                    "Please install paddlepaddle and paddleocr to enable printed OCR."
                ) from e
        return self._engine

    def is_available(self) -> bool:
        """Check whether PaddleOCR or the configured local Tesseract languages are available."""
        try:
            try:
                import torch  # noqa: F401
            except Exception:
                pass
            from paddleocr import PaddleOCR  # noqa: F401
            return True
        except Exception:
            return self._is_tesseract_available()

    def _tesseract_language(self) -> str:
        language = self.lang.lower()
        if language in {"ar", "ara", "arabic"}:
            return "ara+eng"
        if language in {"en", "eng", "english"}:
            return "eng"
        return self.lang

    def _is_tesseract_available(self) -> bool:
        if shutil.which("tesseract") is None:
            return False

        try:
            result = subprocess.run(
                ["tesseract", "--list-langs"],
                check=True,
                capture_output=True,
                text=True,
                timeout=10,
            )
        except (OSError, subprocess.SubprocessError):
            return False

        available_languages = {
            line.strip()
            for line in result.stdout.splitlines()
            if line.strip() and not line.startswith("List of available languages")
        }
        required_languages = set(self._tesseract_language().split("+"))
        return required_languages.issubset(available_languages)

    def _extract_with_tesseract(self, image: Union[str, Path, Image.Image]) -> Dict[str, Any]:
        command = [
            "tesseract",
            "stdin" if isinstance(image, Image.Image) else str(image),
            "stdout",
            "-l",
            self._tesseract_language(),
        ]
        image_bytes = None
        if isinstance(image, Image.Image):
            image_buffer = io.BytesIO()
            image.save(image_buffer, format="PNG")
            image_bytes = image_buffer.getvalue()

        lines: Dict[tuple[str, str, str], list[str]] = {}
        confidences = []
        for page_segmentation_args in ([], ["--psm", "11"]):
            result = subprocess.run(
                [*command, *page_segmentation_args, "tsv"],
                input=image_bytes,
                check=True,
                capture_output=True,
                timeout=120,
            )

            lines = {}
            confidences = []
            tsv_output = result.stdout.decode("utf-8", errors="replace")
            for row in csv.DictReader(io.StringIO(tsv_output), delimiter="\t"):
                if row.get("level") != "5":
                    continue
                text = (row.get("text") or "").strip()
                if not text:
                    continue

                line_key = (row["block_num"], row["par_num"], row["line_num"])
                lines.setdefault(line_key, []).append(text)
                try:
                    confidence = float(row["conf"])
                except (KeyError, TypeError, ValueError):
                    continue
                if confidence >= 0:
                    confidences.append(confidence / 100)
            if lines:
                break

        extracted_text = "\n".join(" ".join(words) for words in lines.values()).strip()
        average_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        return {
            "text": extracted_text,
            "confidence": average_confidence,
            "ocr_engine": "Tesseract",
            "language": self.lang,
            "status": "success",
        }

    def extract_text(self, image: Union[str, Path, Image.Image]) -> Dict[str, Any]:
        """Extract printed text from an image file or PIL Image.

        Returns:
            Dict containing:
                - text: Extracted string
                - confidence: Average confidence score
                - ocr_engine: 'PaddleOCR' or 'Tesseract'
                - language: Selected language
        """
        try:
            engine = self._get_engine()
        except RuntimeError as paddle_error:
            if not self._is_tesseract_available():
                raise RuntimeError(
                    "No printed OCR engine is available. Install PaddleOCR or Tesseract "
                    f"with the required language data. PaddleOCR details: {paddle_error}"
                ) from paddle_error
            return self._extract_with_tesseract(image)

        temp_path = None
        if isinstance(image, Image.Image):
            import tempfile
            temp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            temp_path = temp_file.name
            temp_file.close()
            image.save(temp_path)
            target_path = temp_path
        else:
            target_path = str(image)

        try:
            results = engine.predict(target_path)
            extracted_lines = []
            confidences = []

            if results:
                for item in results:
                    # PaddleOCR 3.x / PaddleX OCRResult (dict-like with rec_texts & rec_scores)
                    if hasattr(item, "get") or isinstance(item, dict):
                        rec_texts = item.get("rec_texts") if hasattr(item, "get") else item["rec_texts"]
                        rec_scores = item.get("rec_scores") if hasattr(item, "get") else item["rec_scores"]
                        if rec_texts is not None:
                            scores_iter = rec_scores if rec_scores is not None else [1.0] * len(rec_texts)
                            for text_str, conf in zip(rec_texts, scores_iter):
                                text_clean = str(text_str).strip()
                                if text_clean:
                                    extracted_lines.append(text_clean)
                                    confidences.append(float(conf))
                    # Legacy PaddleOCR 2.x nested list format: [[box, (text_str, conf)], ...]
                    elif isinstance(item, list):
                        for sub_item in item:
                            if (
                                isinstance(sub_item, (list, tuple))
                                and len(sub_item) >= 2
                                and isinstance(sub_item[1], (list, tuple))
                            ):
                                text_str, conf = sub_item[1]
                                text_clean = str(text_str).strip()
                                if text_clean:
                                    extracted_lines.append(text_clean)
                                    confidences.append(float(conf))

            combined_text = "\n".join(extracted_lines).strip()
            avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

            return {
                "text": combined_text,
                "confidence": avg_conf,
                "ocr_engine": "PaddleOCR",
                "language": self.lang,
                "status": "success",
            }
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
