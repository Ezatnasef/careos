import os
from pathlib import Path
from typing import Any, Dict, Union
from PIL import Image


class OCREngine:
    """Optional printed text OCR engine wrapping PaddleOCR with lazy loading."""

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
        """Check if PaddleOCR can be imported without throwing an exception."""
        try:
            try:
                import torch  # noqa: F401
            except Exception:
                pass
            from paddleocr import PaddleOCR  # noqa: F401
            return True
        except Exception:
            return False

    def extract_text(self, image: Union[str, Path, Image.Image]) -> Dict[str, Any]:
        """Extract printed text from an image file or PIL Image.

        Returns:
            Dict containing:
                - text: Extracted string
                - confidence: Average confidence score
                - ocr_engine: 'PaddleOCR'
                - language: Selected language
        """
        engine = self._get_engine()

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

