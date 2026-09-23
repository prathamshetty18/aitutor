import os
import asyncio
import concurrent.futures
from pathlib import Path
from PIL import Image
import logging

logger = logging.getLogger(__name__)

def _run_async_ocr(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        with concurrent.futures.ThreadPoolExecutor() as pool:
            return pool.submit(lambda: asyncio.run(coro)).result()
    else:
        return asyncio.run(coro)


def extract_text_from_image(image_path: str) -> str:
    """
    Extracts text from an image file using native hardware-accelerated OCR engines:
    1. ocrmac (macOS Native Apple Vision API — zero binary dependencies)
    2. winrt / winsdk (Windows Native OCR Engine)
    3. pytesseract (Tesseract OCR fallback)
    """
    resolved_path = Path(image_path).resolve()
    if not resolved_path.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")

    converted_tmp = None
    target_path = str(resolved_path)
    
    try:
        with Image.open(resolved_path) as img:
            ext = resolved_path.suffix.lower()
            if ext not in [".png", ".bmp", ".jpg", ".jpeg"]:
                converted_tmp = str(resolved_path.with_suffix(".ocr_temp.png"))
                img.convert("RGB").save(converted_tmp, "PNG")
                target_path = converted_tmp
    except Exception as e:
        logger.warning(f"PIL inspection failed for {image_path}: {e}")

    try:
        # Engine 1: macOS Apple Vision Native OCR (ocrmac)
        try:
            from ocrmac import ocrmac
            annotations = ocrmac.OCR(target_path).recognize()
            if annotations:
                extracted_lines = [a[0].strip() for a in annotations if a[0] and a[0].strip()]
                extracted_text = "\n".join(extracted_lines)
                if extracted_text:
                    logger.info(f"Successfully extracted text via macOS Vision OCR ({len(extracted_text)} chars)")
                    return extracted_text
        except ImportError:
            logger.debug("ocrmac not installed or not on macOS.")
        except Exception as mac_err:
            logger.warning(f"macOS Vision OCR attempt failed: {mac_err}")

        # Engine 2: Windows Native SDK (winrt / winsdk)
        try:
            text = _run_async_ocr(_extract_text_async_winsdk(target_path))
            if text:
                logger.info(f"Successfully extracted text via Windows Native OCR ({len(text)} chars)")
                return text
        except ImportError:
            logger.debug("winrt / winsdk module is only available on Windows OS.")
        except Exception as winsdk_err:
            logger.warning(f"Windows Native OCR failed: {winsdk_err}")

        # Engine 3: pytesseract (Tesseract OCR)
        try:
            import pytesseract
            image_obj = Image.open(target_path)
            text = pytesseract.image_to_string(image_obj).strip()
            if text:
                logger.info(f"Successfully extracted text via Tesseract OCR ({len(text)} chars)")
                return text
        except Exception as tesseract_err:
            logger.info(f"Tesseract OCR fallback: {tesseract_err}")

        # Fallback text if no OCR engine produces output
        logger.warning(f"No text recognized in image: {image_path}")
        return ""

    finally:
        if converted_tmp and os.path.exists(converted_tmp):
            try:
                os.remove(converted_tmp)
            except Exception:
                pass


async def _extract_text_async_winsdk(file_path: str) -> str:
    try:
        import winrt.windows.graphics.imaging as imaging
        import winrt.windows.media.ocr as ocr
        import winrt.windows.storage as storage
    except ImportError:
        import winsdk.windows.graphics.imaging as imaging
        import winsdk.windows.media.ocr as ocr
        import winsdk.windows.storage as storage

    storage_file = await storage.StorageFile.get_file_from_path_async(file_path)
    stream = await storage_file.open_async(storage.FileAccessMode.READ)
    decoder = await imaging.BitmapDecoder.create_async(stream)
    bitmap = await decoder.get_software_bitmap_async()

    engine = ocr.OcrEngine.try_create_from_user_profile_languages()
    if engine is None:
        avail = ocr.OcrEngine.available_recognizer_languages
        if avail:
            engine = ocr.OcrEngine.try_create_from_language(avail[0])
        else:
            raise RuntimeError("No OCR language recognizers available on system.")

    result = await engine.recognize_async(bitmap)
    
    extracted_lines = []
    for line in result.lines:
        t = line.text.strip()
        if t:
            extracted_lines.append(t)

    return "\n".join(extracted_lines)

