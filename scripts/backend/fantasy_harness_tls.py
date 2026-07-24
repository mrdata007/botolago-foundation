"""Shared verified TLS configuration for the Phase 6 harness."""

from __future__ import annotations

import os
import ssl
from pathlib import Path

import certifi


CA_BUNDLE_ENV = "BOTOLAGO_CA_BUNDLE"


def create_verified_ssl_context() -> ssl.SSLContext:
    """Build a hostname-verifying TLS context from an explicit or certifi CA."""

    configured_bundle = os.getenv(CA_BUNDLE_ENV, "").strip()
    if configured_bundle:
        bundle = Path(configured_bundle).expanduser()
        if not bundle.is_file():
            raise RuntimeError(f"{CA_BUNDLE_ENV} must reference an existing CA bundle")
        cafile = str(bundle)
    else:
        cafile = certifi.where()

    context = ssl.create_default_context(cafile=cafile)
    if context.verify_mode != ssl.CERT_REQUIRED or not context.check_hostname:
        raise RuntimeError("Phase 6 harness refuses an unverified TLS context")
    return context
