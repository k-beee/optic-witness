# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""
OpticWitness — robust, decentralized, and spam-protected web content attestation.

Built for the GenLayer protocol, this Intelligent Contract allows users to notarize
live web states by rendering pages, screenshotting them, and running LLM checks via
validator consensus.
"""

from genlayer import *

import json
import hashlib
import base64
import typing
import datetime
from dataclasses import dataclass

# Error classification tags
ERR_STANDARD = "[STANDARD_ERROR]"
ERR_EXTERNAL = "[EXTERNAL_GATEWAY_ERROR]"
ERR_TRANSIENT = "[TRANSIENT_NETWORK_ERROR]"
ERR_PARSING = "[LLM_DECODING_ERROR]"


@allow_storage
@dataclass
class WitnessRecord:
    requester: Address
    url: str
    question: str
    verdict: bool             # maps to claim_present
    extracted_text: str       # semantic textual proof
    confidence_score: str     # "high" | "medium" | "low"
    notes: str                # caveats or qualifications
    screenshot_hash: str      # SHA-256 integrity check of leader's capture
    screenshot_b64: str       # base64 data for off-chain reconstruction
    timestamp: str            # ISO 8601 transaction timestamp
    completed: bool           # status indicator


class OpticWitness(gl.Contract):
    # State variables
    owner_address: Address
    attestation_fee: u256
    total_notarizations: u256
    records: TreeMap[u256, WitnessRecord]
    requester_index: TreeMap[Address, DynArray[u256]]
    last_request_timestamp: TreeMap[Address, u256]

    def __init__(self, fee: u256):
        self.owner_address = gl.message.sender_address
        self.attestation_fee = fee
        self.total_notarizations = u256(0)

    # --- Helpers -------------------------------------------------------------
    def _now_unix(self) -> int:
        """Determines current unix epoch time from transactional metadata."""
        dt_str = gl.message_raw["datetime"]
        if dt_str.endswith("Z"):
            dt_str = dt_str[:-1] + "+00:00"
        dt = datetime.datetime.fromisoformat(dt_str)
        return int(dt.timestamp())

    def _now_iso(self) -> str:
        """Determines current transaction timestamp in ISO format."""
        return gl.message_raw["datetime"]

    # --- Write methods -------------------------------------------------------
    @gl.public.write.payable
    def request_attestation(self, url: str, question: str) -> u256:
        """
        Request visual web attestation. Implements rate limiting and validation.
        Runs leader-validator consensus and persists results on-chain.
        """
        sender = gl.message.sender_address

        # Check rate-limiting cooldown (60 seconds)
        if sender in self.last_request_timestamp:
            last_req = int(self.last_request_timestamp[sender])
            current_time = self._now_unix()
            if current_time - last_req < 60:
                raise gl.vm.UserError(
                    f"{ERR_STANDARD} Cooldown active: please wait 60s between requests"
                )

        # Enforce fees
        if gl.message.value < self.attestation_fee:
            raise gl.vm.UserError(
                f"{ERR_STANDARD} Insufficient fee: expected {self.attestation_fee} wei"
            )

        # Enforce input parameters
        if not url.startswith("http://") and not url.startswith("https://"):
            raise gl.vm.UserError(
                f"{ERR_STANDARD} Invalid URL: must start with http:// or https://"
            )
        if len(question) == 0:
            raise gl.vm.UserError(
                f"{ERR_STANDARD} Question cannot be empty"
            )

        # Update last request time
        self.last_request_timestamp[sender] = u256(self._now_unix())

        prompt = self._compile_prompt(url, question)

        def leader_fn() -> dict:
            return _evaluate(url, prompt)

        # Skeletons for validator and settlement will be defined in subsequent commits.
        return u256(0)

    def _compile_prompt(self, url: str, question: str) -> str:
        """Compiles the system prompt for the vision model."""
        return f"""Analyze the provided webpage screenshot and extract whether it supports the question.
URL: {url}
QUESTION: {question}

Return a valid JSON string with these fields:
{{
  "claim_present": true | false,
  "exact_text": "the exact supporting text from the screenshot, or empty",
  "confidence": "high" | "medium" | "low",
  "caveats": "any warnings or qualifications"
}}"""


# --- Module-level stateless execution helpers --------------------------------
def _evaluate(url: str, prompt: str) -> dict:
    """Renders the webpage, runs visual LLM analysis, and hashes screenshots."""
    screenshot = gl.nondet.web.render(url, mode="screenshot", wait_after_loaded="1500ms")
    
    raw_res = gl.nondet.exec_prompt(prompt, response_format="json", image=screenshot)
    data = _coerce_json(raw_res)
    
    # Store screenshot reference and bytes
    shot_bytes = bytes(screenshot.raw)
    shot_hash = hashlib.sha256(shot_bytes).hexdigest()
    shot_b64 = base64.b64encode(shot_bytes).decode("ascii")
    
    # Parse confidence
    conf = str(data.get("confidence", "low")).strip().lower()
    if conf not in ("high", "medium", "low"):
        conf = "low"
        
    return {
        "claim_present": _parse_bool(data.get("claim_present")),
        "exact_text": str(data.get("exact_text", ""))[:2000],
        "confidence": conf,
        "caveats": str(data.get("caveats", ""))[:1000],
        "screenshot_hash": shot_hash,
        "screenshot_b64": shot_b64
    }


def _coerce_json(raw: typing.Any) -> dict:
    """Deals defensively with varied vision model return shapes."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            start = raw.find("{")
            end = raw.rfind("}")
            if start != -1 and end != -1:
                return json.loads(raw[start : end + 1])
        except Exception:
            pass
    raise gl.vm.UserError(f"{ERR_PARSING} Vision model output is not a valid JSON structure")


_TRUE_VALS = {"true", "yes", "1", "t", "y"}
_FALSE_VALS = {"false", "no", "0", "f", "n"}


def _parse_bool(val: typing.Any) -> bool:
    """Parses boolean answers strictly to prevent type casting loopholes."""
    if isinstance(val, bool):
        return val
    if val is None:
        raise gl.vm.UserError(f"{ERR_PARSING} claim_present is missing from model result")
    if isinstance(val, int):
        if val == 0:
            return False
        if val == 1:
            return True
        raise gl.vm.UserError(f"{ERR_PARSING} claim_present must be boolean, got int: {val}")
    if isinstance(val, str):
        v = val.strip().lower()
        if v in _TRUE_VALS:
            return True
        if v in _FALSE_VALS:
            return False
        raise gl.vm.UserError(f"{ERR_PARSING} claim_present must be boolean, got: {val!r}")
    raise gl.vm.UserError(f"{ERR_PARSING} claim_present must be boolean, got type: {type(val).__name__}")
