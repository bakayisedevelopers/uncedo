import base64
import json
import io
import os
import subprocess
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

# Avoid oneDNN runtime incompatibilities seen on some Cloud Run CPU images.
os.environ.setdefault('FLAGS_use_mkldnn', '0')

import numpy as np
import pypdfium2 as pdfium
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from PIL import Image
import paddleocr as paddleocr_pkg
try:
    from paddleocr import PaddleOCRVL
except Exception:
    PaddleOCRVL = None  # type: ignore

API_KEY = os.getenv('PADDLE_OCR_SERVICE_API_KEY', '').strip()
MAX_PDF_PAGES = int(os.getenv('PADDLE_OCR_MAX_PDF_PAGES', '10'))
MAX_IMAGE_BYTES = int(os.getenv('PADDLE_OCR_MAX_IMAGE_BYTES', str(20 * 1024 * 1024)))
PADDLE_OCR_BASE_DIR = os.getenv('PADDLE_OCR_BASE_DIR', '/tmp/.paddleocr').strip() or '/tmp/.paddleocr'
PADDLE_OCR_VL_PIPELINE_VERSION = os.getenv('PADDLE_OCR_VL_PIPELINE_VERSION', 'v1.5').strip() or 'v1.5'
PADDLE_OCR_VL_DEVICE = os.getenv('PADDLE_OCR_VL_DEVICE', 'cpu').strip() or 'cpu'
PADDLE_OCR_VL_USE_LAYOUT_DETECTION = os.getenv('PADDLE_OCR_VL_USE_LAYOUT_DETECTION', 'true').strip().lower() != 'false'
PADDLE_OCR_VL_USE_DOC_ORIENTATION_CLASSIFY = os.getenv('PADDLE_OCR_VL_USE_DOC_ORIENTATION_CLASSIFY', 'false').strip().lower() == 'true'
PADDLE_OCR_VL_USE_DOC_UNWARPING = os.getenv('PADDLE_OCR_VL_USE_DOC_UNWARPING', 'false').strip().lower() == 'true'

app = FastAPI(title='claxi-paddle-ocr-service')

os.makedirs(PADDLE_OCR_BASE_DIR, exist_ok=True)
os.makedirs('/tmp/.cache', exist_ok=True)

vl_pipeline: Optional[PaddleOCRVL] = None


class ExtractRequest(BaseModel):
    imageBase64: Optional[str] = None
    mimeType: Optional[str] = None
    fileName: Optional[str] = None
    objectPath: Optional[str] = None
    downloadUrl: Optional[str] = None


def _sanitize_file_name(file_name: str, default: str = 'input.png') -> str:
    cleaned = ''.join(ch if ch.isalnum() or ch in ('-', '_', '.') else '_' for ch in (file_name or '').strip())
    return cleaned or default


def _init_vl_pipeline() -> PaddleOCRVL:
    # Keep startup config explicit for repeatable Cloud Run revisions.
    return PaddleOCRVL(
        pipeline_version=PADDLE_OCR_VL_PIPELINE_VERSION,
        device=PADDLE_OCR_VL_DEVICE,
        use_layout_detection=PADDLE_OCR_VL_USE_LAYOUT_DETECTION,
        use_doc_orientation_classify=PADDLE_OCR_VL_USE_DOC_ORIENTATION_CLASSIFY,
        use_doc_unwarping=PADDLE_OCR_VL_USE_DOC_UNWARPING,
    )


def get_pipeline() -> PaddleOCRVL:
    global vl_pipeline
    if vl_pipeline is None:
        vl_pipeline = _init_vl_pipeline()
    return vl_pipeline


def decode_base64_payload(value: str) -> bytes:
    raw = (value or '').strip()
    if ',' in raw:
        raw = raw.split(',', 1)[1]
    data = base64.b64decode(raw)
    if not data:
        raise ValueError('empty image payload')
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError('payload too large')
    return data


def is_pdf_bytes(data: bytes, mime_type: str) -> bool:
    return (mime_type or '').lower() == 'application/pdf' or data[:5] == b'%PDF-'


def _extract_text_from_vl_result(result_obj: Any) -> str:
    try:
        if hasattr(result_obj, 'markdown'):
            markdown_text = str(getattr(result_obj, 'markdown') or '').strip()
            if markdown_text:
                return markdown_text
    except Exception:
        pass

    try:
        if hasattr(result_obj, 'json'):
            json_data = result_obj.json
        elif hasattr(result_obj, 'to_json'):
            json_data = result_obj.to_json()
        else:
            json_data = None

        if isinstance(json_data, dict):
            res = json_data.get('res') or {}
            layout = res.get('layout_det_res') or {}
            boxes = layout.get('boxes') if isinstance(layout, dict) else []
            lines = []
            for box in boxes if isinstance(boxes, list) else []:
                text = str(box.get('text') or box.get('label') or '').strip()
                if text:
                    lines.append(text)
            if lines:
                return '\n'.join(lines)
    except Exception:
        pass

    return ''


def _extract_regions_from_vl_result(result_obj: Any) -> tuple[List[Dict[str, Any]], float]:
    regions: List[Dict[str, Any]] = []
    confidences: List[float] = []

    json_data = None
    try:
        if hasattr(result_obj, 'json'):
            json_data = result_obj.json
        elif hasattr(result_obj, 'to_json'):
            json_data = result_obj.to_json()
    except Exception:
        json_data = None

    if not isinstance(json_data, dict):
        return regions, 0.0

    res = json_data.get('res') or {}
    layout = res.get('layout_det_res') or {}
    boxes = layout.get('boxes') if isinstance(layout, dict) else []

    if not isinstance(boxes, list):
        return regions, 0.0

    for box in boxes:
        if not isinstance(box, dict):
            continue
        coordinate = box.get('coordinate') or []
        if not isinstance(coordinate, list) or len(coordinate) < 4:
            continue
        x0 = float(coordinate[0])
        y0 = float(coordinate[1])
        x1 = float(coordinate[2])
        y1 = float(coordinate[3])
        score = float(box.get('score') or 0)
        label = str(box.get('label') or 'text').strip().lower() or 'text'
        text = str(box.get('text') or box.get('label') or '').strip()
        regions.append({
            'type': label,
            'x': x0,
            'y': y0,
            'width': max(0.0, x1 - x0),
            'height': max(0.0, y1 - y0),
            'description': text,
            'confidence': max(0.0, min(1.0, score)),
        })
        confidences.append(max(0.0, min(1.0, score)))

    average_confidence = float(sum(confidences) / len(confidences)) if confidences else 0.0
    return regions, average_confidence


def _run_vl_predict(input_path: str) -> List[Any]:
    output = get_pipeline().predict(input=input_path)
    if output is None:
        return []
    if isinstance(output, list):
        return output
    return list(output)


def _collect_text_fields(value: Any) -> List[str]:
    parts: List[str] = []
    if isinstance(value, dict):
        for k, v in value.items():
            if isinstance(v, str) and k.lower() in ('text', 'block_content', 'markdown'):
                text = v.strip()
                if text:
                    parts.append(text)
            else:
                parts.extend(_collect_text_fields(v))
    elif isinstance(value, list):
        for item in value:
            parts.extend(_collect_text_fields(item))
    return parts


def _run_vl_cli(input_path: str) -> tuple[str, List[str]]:
    output_dir = Path('/tmp') / f"paddleocr-vl-out-{int(time.time() * 1000)}"
    output_dir.mkdir(parents=True, exist_ok=True)
    command = [
        'paddleocr',
        'doc_parser',
        '-i',
        input_path,
        '--pipeline_version',
        PADDLE_OCR_VL_PIPELINE_VERSION,
        '--device',
        PADDLE_OCR_VL_DEVICE,
        '--save_path',
        str(output_dir),
        '--use_doc_orientation_classify',
        'True' if PADDLE_OCR_VL_USE_DOC_ORIENTATION_CLASSIFY else 'False',
        '--use_doc_unwarping',
        'True' if PADDLE_OCR_VL_USE_DOC_UNWARPING else 'False',
        '--use_layout_detection',
        'True' if PADDLE_OCR_VL_USE_LAYOUT_DETECTION else 'False',
    ]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=300, check=True)

    text_candidates: List[str] = []
    for md_file in output_dir.rglob('*.md'):
        content = md_file.read_text(encoding='utf-8', errors='ignore').strip()
        if content:
            text_candidates.append(content)
    for json_file in output_dir.rglob('*.json'):
        try:
            data = json.loads(json_file.read_text(encoding='utf-8', errors='ignore'))
            text_candidates.extend(_collect_text_fields(data))
        except Exception:
            continue
    if completed.stdout.strip():
        text_candidates.append(completed.stdout.strip())

    extracted_text = max((t for t in text_candidates if t), key=len, default='')
    warnings: List[str] = []
    if completed.stderr.strip():
        warnings.append(completed.stderr.strip()[:2000])
    return extracted_text, warnings


def _build_page_results(results: List[Any]) -> tuple[List[Dict[str, Any]], str, List[Dict[str, Any]], float, List[str]]:
    pages: List[Dict[str, Any]] = []
    full_text_parts: List[str] = []
    all_visual_regions: List[Dict[str, Any]] = []
    confidence_parts: List[float] = []
    warnings: List[str] = []

    for index, result_obj in enumerate(results):
        page_text = _extract_text_from_vl_result(result_obj)
        visual_regions, page_confidence = _extract_regions_from_vl_result(result_obj)

        if page_text:
            full_text_parts.append(page_text)
        if page_confidence > 0:
            confidence_parts.append(page_confidence)

        all_visual_regions.extend(visual_regions)

        pages.append({
            'pageNumber': index + 1,
            'text': page_text,
            'extractedText': page_text,
            'textLength': len(page_text),
            'confidence': page_confidence,
            'visualRegions': visual_regions,
            'tables': [],
            'formulas': [],
            'ppStructureVersion': '',
            'status': 'complete' if page_text else 'failed',
            'success': bool(page_text),
        })

    if not pages:
        warnings.append('PaddleOCR-VL returned no pages.')

    extracted_text = '\n\n'.join(part for part in full_text_parts if part).strip()
    confidence = float(sum(confidence_parts) / len(confidence_parts)) if confidence_parts else 0.0
    return pages, extracted_text, all_visual_regions, confidence, warnings


@app.get('/healthz')
def healthz() -> Dict[str, Any]:
    return {
        'ok': True,
        'service': 'claxi-paddle-ocr-service',
        'paddleocrVersion': getattr(paddleocr_pkg, '__version__', 'unknown'),
        'pipeline': {
            'provider': 'paddleocr_vl_1_5',
            'pipelineVersion': PADDLE_OCR_VL_PIPELINE_VERSION,
            'device': PADDLE_OCR_VL_DEVICE,
            'useLayoutDetection': PADDLE_OCR_VL_USE_LAYOUT_DETECTION,
            'useDocOrientationClassify': PADDLE_OCR_VL_USE_DOC_ORIENTATION_CLASSIFY,
            'useDocUnwarping': PADDLE_OCR_VL_USE_DOC_UNWARPING,
        },
    }


@app.post('/extract')
def extract(req: ExtractRequest, x_api_key: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail='Unauthorized')

    if not req.imageBase64:
        raise HTTPException(status_code=400, detail='imageBase64 is required')

    started = time.time()
    temp_path: Optional[Path] = None

    try:
        data = decode_base64_payload(req.imageBase64)
        mime_type = (req.mimeType or '').strip()
        file_name = _sanitize_file_name(req.fileName or ('input.pdf' if is_pdf_bytes(data, mime_type) else 'input.png'))

        suffix = '.pdf' if is_pdf_bytes(data, mime_type) else Path(file_name).suffix or '.png'
        temp_path = Path('/tmp') / f'paddleocr-vl-{int(time.time() * 1000)}{suffix}'
        temp_path.write_bytes(data)

        # Fallback for environments where PaddleOCRVL Python symbol is unavailable.
        if PaddleOCRVL is None:
            extracted_text, cli_warnings = _run_vl_cli(str(temp_path))
            elapsed_ms = int((time.time() - started) * 1000)
            confidence = 0.0
            return {
                'success': bool(extracted_text),
                'extractedText': extracted_text,
                'text': extracted_text,
                'textLength': len(extracted_text),
                'pages': [{
                    'pageNumber': 1,
                    'text': extracted_text,
                    'extractedText': extracted_text,
                    'textLength': len(extracted_text),
                    'confidence': confidence,
                    'visualRegions': [],
                    'tables': [],
                    'formulas': [],
                    'ppStructureVersion': '',
                    'status': 'complete' if extracted_text else 'failed',
                    'success': bool(extracted_text),
                }],
                'extractedImages': [],
                'visualRegions': [],
                'tables': [],
                'formulas': [],
                'confidence': confidence,
                'provider': 'paddleocr_vl_1_5',
                'ppStructureVersionRequested': '',
                'ppStructureVersionRuntime': '',
                'paddleOcrVlPipelineVersion': PADDLE_OCR_VL_PIPELINE_VERSION,
                'structureConfig': {
                    'pipelineVersion': PADDLE_OCR_VL_PIPELINE_VERSION,
                    'device': PADDLE_OCR_VL_DEVICE,
                    'useLayoutDetection': PADDLE_OCR_VL_USE_LAYOUT_DETECTION,
                    'useDocOrientationClassify': PADDLE_OCR_VL_USE_DOC_ORIENTATION_CLASSIFY,
                    'useDocUnwarping': PADDLE_OCR_VL_USE_DOC_UNWARPING,
                },
                'warnings': cli_warnings[:20],
                'elapsedMs': elapsed_ms,
            }

        # For very large PDFs, keep previous cap behavior by pre-splitting pages when needed.
        if suffix == '.pdf':
            pdf_doc = pdfium.PdfDocument(str(temp_path))
            page_count = len(pdf_doc)
            if page_count > MAX_PDF_PAGES:
                warnings = [f'Input PDF pages capped at {MAX_PDF_PAGES} from {page_count}.']
                rendered_pages = []
                for page_index in range(MAX_PDF_PAGES):
                    page = pdf_doc[page_index]
                    bitmap = page.render(scale=2).to_pil()
                    rendered_pages.append(np.array(bitmap.convert('RGB')))
                image_paths = []
                for page_index, array in enumerate(rendered_pages):
                    page_image = Image.fromarray(array)
                    page_path = Path('/tmp') / f'paddleocr-vl-page-{int(time.time() * 1000)}-{page_index + 1}.png'
                    page_image.save(page_path)
                    image_paths.append(str(page_path))
                results: List[Any] = []
                for image_path in image_paths:
                    results.extend(_run_vl_predict(image_path))
                pages, extracted_text, all_visual_regions, confidence, page_warnings = _build_page_results(results)
                warnings.extend(page_warnings)
                for image_path in image_paths:
                    try:
                        Path(image_path).unlink(missing_ok=True)
                    except Exception:
                        pass
            else:
                results = _run_vl_predict(str(temp_path))
                pages, extracted_text, all_visual_regions, confidence, warnings = _build_page_results(results)
        else:
            results = _run_vl_predict(str(temp_path))
            pages, extracted_text, all_visual_regions, confidence, warnings = _build_page_results(results)

        elapsed_ms = int((time.time() - started) * 1000)

        return {
            'success': bool(extracted_text),
            'extractedText': extracted_text,
            'text': extracted_text,
            'textLength': len(extracted_text),
            'pages': pages,
            'extractedImages': [],
            'visualRegions': all_visual_regions,
            'tables': [],
            'formulas': [],
            'confidence': confidence,
            'provider': 'paddleocr_vl_1_5',
            'ppStructureVersionRequested': '',
            'ppStructureVersionRuntime': '',
            'paddleOcrVlPipelineVersion': PADDLE_OCR_VL_PIPELINE_VERSION,
            'structureConfig': {
                'pipelineVersion': PADDLE_OCR_VL_PIPELINE_VERSION,
                'device': PADDLE_OCR_VL_DEVICE,
                'useLayoutDetection': PADDLE_OCR_VL_USE_LAYOUT_DETECTION,
                'useDocOrientationClassify': PADDLE_OCR_VL_USE_DOC_ORIENTATION_CLASSIFY,
                'useDocUnwarping': PADDLE_OCR_VL_USE_DOC_UNWARPING,
            },
            'warnings': warnings[:20],
            'elapsedMs': elapsed_ms,
        }
    except HTTPException:
        raise
    except Exception as error:
        details = ''.join(traceback.format_exception_only(type(error), error)).strip()
        raise HTTPException(status_code=500, detail=f'Extraction failed: {type(error).__name__}: {details}') from error
    finally:
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except Exception:
                pass
