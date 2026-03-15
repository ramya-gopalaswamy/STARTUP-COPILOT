"""
Amazon Nova Canvas image generation via Bedrock InvokeModel.
Model: amazon.nova-canvas-v1:0 (text-to-image, color-guided).
"""
from __future__ import annotations

import base64
import json
import logging
import random
from typing import Optional

from .bedrock_client import get_bedrock_client

LOG = logging.getLogger(__name__)

NOVA_CANVAS_MODEL_ID = "amazon.nova-canvas-v1:0"


def generate_image(
    prompt: str,
    color_hex: Optional[str] = None,
    width: int = 512,
    height: int = 512,
) -> bytes:
    """
    Generate an image using Nova Canvas. Returns PNG bytes.
    If color_hex is set (e.g. "#FFFFFF"), uses COLOR_GUIDED_GENERATION; else TEXT_IMAGE.
    """
    client = get_bedrock_client()
    seed = random.randint(0, 858_993_460)

    if color_hex and color_hex.startswith("#") and len(color_hex) >= 4:
        # Color-guided: palette + text (good for "white logo with handbag")
        body = {
            "taskType": "COLOR_GUIDED_GENERATION",
            "colorGuidedGenerationParams": {
                "text": prompt[:1024],
                "colorPalette": [color_hex.strip()[:7]],
            },
            "imageGenerationConfig": {
                "seed": seed,
                "quality": "standard",
                "width": width,
                "height": height,
                "numberOfImages": 1,
            },
        }
    else:
        body = {
            "taskType": "TEXT_IMAGE",
            "textToImageParams": {"text": prompt[:1024]},
            "imageGenerationConfig": {
                "seed": seed,
                "quality": "standard",
                "width": width,
                "height": height,
                "numberOfImages": 1,
            },
        }

    request_body = json.dumps(body)
    response = client.invoke_model(
        modelId=NOVA_CANVAS_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=request_body.encode("utf-8"),
    )
    out = response.get("body")
    if not out:
        raise RuntimeError("Nova Canvas returned empty body")
    response_json = json.loads(out.read())
    images = response_json.get("images")
    if not images or not isinstance(images, list):
        raise RuntimeError("Nova Canvas response missing images array")
    b64 = images[0]
    if isinstance(b64, dict) and "image" in b64:
        b64 = b64["image"]
    return base64.b64decode(b64)
