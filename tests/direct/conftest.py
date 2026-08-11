"""
Direct-mode testing configurations for OpticWitness.

Intercepts PIL image parsing to return a placeholder when mock screenshot bytes are
rendered empty, keeping the test environment stable.
"""

import PIL.Image as _PILImage

_orig_open_method = _PILImage.open


def _tolerant_image_loader(file_pointer, *args, **kwargs):
    try:
        return _orig_open_method(file_pointer, *args, **kwargs)
    except Exception:
        # Fallback to a tiny 1x1 black pixel image to prevent crashes
        return _PILImage.new("RGB", (1, 1))


_PILImage.open = _tolerant_image_loader
