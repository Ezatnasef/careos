from pathlib import Path
from typing import Any, Dict, Optional, Union
from PIL import Image


class HandwritingOCREngine:
    """Optional Vision-Language OCR Engine for handwritten prescriptions and medical notes.

    Uses lazy model loading to ensure zero memory or startup overhead when not in use.
    """

    DEFAULT_MODEL_NAME = "sherif1313/Arabic-handwritten-OCR-4bit-Qwen2.5-VL-3B-v3"

    def __init__(
        self,
        model_name: Optional[str] = None,
        device: str = "auto",
        auto_init: bool = False,
    ):
        self.model_name = model_name or self.DEFAULT_MODEL_NAME
        self.device_str = device
        self._processor = None
        self._model = None
        self._device = None

        if auto_init:
            self._lazy_init()

    def _resolve_device(self) -> str:
        if self._device is not None:
            return self._device

        import torch
        if self.device_str == "auto":
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
        elif self.device_str == "cuda":
            if not torch.cuda.is_available():
                raise RuntimeError("CUDA requested for handwriting OCR but no CUDA GPU is available.")
            self._device = "cuda"
        elif self.device_str == "cpu":
            self._device = "cpu"
        else:
            raise ValueError(f"Invalid device '{self.device_str}'. Must be 'auto', 'cuda', or 'cpu'.")

        return self._device

    def _lazy_init(self):
        if self._model is not None and self._processor is not None:
            return

        try:
            from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration
        except ImportError as e:
            raise RuntimeError(
                f"Transformers library is not installed or unavailable ({e}). "
                "Please install transformers to enable Handwriting OCR."
            ) from e

        device = self._resolve_device()
        self._processor = AutoProcessor.from_pretrained(self.model_name)

        if device == "cuda":
            self._model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                self.model_name,
                device_map="cuda",
            )
        else:
            self._model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                self.model_name,
                device_map="cpu",
            )

        self._model.eval()

    def is_available(self) -> bool:
        """Check if required packages are installed without downloading/instantiating the model."""
        try:
            import torch  # noqa
            from transformers import AutoProcessor  # noqa
            return True
        except ImportError:
            return False

    def extract_text(
        self,
        image: Union[str, Path, Image.Image],
        custom_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Transcribe handwritten text from an image.

        Args:
            image: Path to image file or PIL Image object.
            custom_prompt: Optional custom transcription prompt.

        Returns:
            Dict with 'text', 'ocr_engine', 'status', and 'device'.
        """
        self._lazy_init()
        import torch

        if isinstance(image, (str, Path)):
            img_path = Path(image)
            if not img_path.is_file():
                raise FileNotFoundError(f"Handwriting OCR image not found: {img_path}")
            pil_image = Image.open(img_path).convert("RGB")
            file_name = img_path.name
        elif isinstance(image, Image.Image):
            pil_image = image.convert("RGB")
            file_name = "in_memory_image.png"
        else:
            raise ValueError("Input image must be a file path or PIL.Image instance.")

        prompt_text = custom_prompt or (
            "Transcribe all handwritten text in this medical document exactly as it appears. "
            "Preserve medication names, numbers, dosages, units, and instructions. "
            "Do not add information that is not visible."
        )

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": pil_image},
                    {"type": "text", "text": prompt_text},
                ],
            }
        ]

        text_prompt = self._processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

        inputs = self._processor(
            text=[text_prompt],
            images=[pil_image],
            return_tensors="pt",
        )

        target_device = torch.device(self._device)
        inputs = {
            k: v.to(target_device) if hasattr(v, "to") else v
            for k, v in inputs.items()
        }

        with torch.inference_mode():
            generated_ids = self._model.generate(
                **inputs,
                max_new_tokens=512,
            )

        input_length = inputs["input_ids"].shape[1]
        generated_text = self._processor.batch_decode(
            generated_ids[:, input_length:],
            skip_special_tokens=True,
        )[0].strip()

        return {
            "text": generated_text,
            "file_name": file_name,
            "ocr_engine": "Qwen2.5-VL-3B-Handwriting-OCR",
            "language": "ar/en",
            "device": self._device,
            "status": "success",
        }

