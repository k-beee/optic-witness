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

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            # Handle error execution paths
            if not isinstance(leaders_res, gl.vm.Return):
                return _compare_errors(leaders_res, lambda: _evaluate(url, prompt))

            # Retrieve leader outcome data
            leader_data = leaders_res.calldata
            my = _evaluate(url, prompt)

            # Consensus check 1: verdict match (must match exactly)
            if bool(my["claim_present"]) != bool(leader_data["claim_present"]):
                return False

            # Consensus check 2: semantic supporting text match (normalized lowercase comparison)
            # This avoids brittle splits due to trivial formatting shifts (punctuation, whitespaces)
            if _normalize(my.get("exact_text", "")) != _normalize(leader_data.get("exact_text", "")):
                return False

            # Consensus check 3: confidence matching (leader high requires validator high/medium)
            if leader_data["confidence"] == "high" and my["confidence"] == "low":
                return False
            if my["confidence"] == "high" and leader_data["confidence"] == "low":
                return False

            # Design Choice: We do NOT compare screenshot_hash between validators.
            # Independent node renders naturally generate byte variations (layout offsets, clocks, dynamic ads).
            # The leader's screenshot is saved on-chain for verification, while validators focus consensus
            # purely on semantic and textual outcomes.
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # Deterministic record storage
        record_id = self.total_notarizations
        self.total_notarizations = u256(int(self.total_notarizations) + 1)

        record = WitnessRecord(
            requester=sender,
            url=url,
            question=question,
            verdict=bool(result["claim_present"]),
            extracted_text=str(result.get("exact_text", "")),
            confidence_score=str(result.get("confidence", "low")),
            notes=str(result.get("caveats", "")),
            screenshot_hash=str(result.get("screenshot_hash", "")),
            screenshot_b64=str(result.get("screenshot_b64", "")),
            timestamp=self._now_iso(),
            completed=True,
        )

        self.records[record_id] = record
        self.requester_index.get_or_insert_default(sender).append(record_id)

        return record_id

    @gl.public.write
    def update_fee(self, new_fee: u256) -> None:
        """Updates the registration fee for new attestation requests. Owner only."""
        if gl.message.sender_address != self.owner_address:
            raise gl.vm.UserError(f"{ERR_STANDARD} Only the owner may alter fees")
        self.attestation_fee = new_fee

    @gl.public.write
    def withdraw(self, target_address: str) -> None:
        """Withdraws all contract balances to a target address. Owner only."""
        if gl.message.sender_address != self.owner_address:
            raise gl.vm.UserError(f"{ERR_STANDARD} Only the owner may withdraw balances")
        balance_to_transfer = self.balance
        if balance_to_transfer == 0:
            raise gl.vm.UserError(f"{ERR_STANDARD} Contract balance is empty")
        gl.chain.Account(Address(target_address)).emit_transfer(value=u256(int(balance_to_transfer)))

    # --- View/Read methods ---------------------------------------------------
    @gl.public.view
    def get_attestation_fee(self) -> str:
        """Gets current attestation fee in Wei."""
        return str(self.attestation_fee)

    @gl.public.view
    def get_owner_address(self) -> str:
        """Gets the hex address of the owner."""
        return self.owner_address.as_hex

    @gl.public.view
    def get_total_notarizations(self) -> str:
        """Gets the total number of notarized records."""
        return str(self.total_notarizations)

    @gl.public.view
    def get_record(self, record_id: u256) -> dict:
        """Retrieves a single attestation record by ID."""
        if record_id not in self.records:
            raise gl.vm.UserError(f"{ERR_STANDARD} Non-existent record ID")
        return self._serialize(record_id, self.records[record_id])

    @gl.public.view
    def get_records_by_requester(self, requester_hex: str) -> dict:
        """Retrieves all attestation records requested by a specific address."""
        addr = Address(requester_hex)
        out = []
        if addr in self.requester_index:
            for rid in self.requester_index[addr]:
                out.append(self._serialize(rid, self.records[rid]))
        return {"requester": addr.as_hex, "records": out}

    @gl.public.view
    def get_recent_records(self, count: u256) -> dict:
        """Retrieves most recent records descending up to count."""
        total = int(self.total_notarizations)
        limit = min(int(count), total)
        out = []
        i = total - 1
        while i >= 0 and len(out) < limit:
            out.append(self._serialize(u256(i), self.records[u256(i)]))
            i -= 1
        return {"total": str(total), "records": out}

    # --- Internal Serialization ----------------------------------------------
    def _serialize(self, record_id: u256, r: WitnessRecord) -> dict:
        return {
            "id": str(record_id),
            "requester": r.requester.as_hex,
            "url": r.url,
            "question": r.question,
            "verdict": r.verdict,
            "extracted_text": r.extracted_text,
            "confidence_score": r.confidence_score,
            "notes": r.notes,
            "screenshot_hash": r.screenshot_hash,
            "screenshot_b64": r.screenshot_b64,
            "timestamp": r.timestamp,
            "completed": r.completed,
        }

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


def _normalize(text: str) -> str:
    """Normalizes string inputs to alphanumeric only for robust comparisons."""
    out = []
    for char in text.lower():
        if char.isalnum():
            out.append(char)
    return "".join(out)


def _compare_errors(leaders_res: gl.vm.Result, redo: typing.Callable[[], dict]) -> bool:
    """Validator error-path reconciliation logic."""
    leader_msg = getattr(leaders_res, "message", "") or ""
    try:
        redo()
        return False
    except gl.vm.UserError as e:
        my_msg = e.message if hasattr(e, "message") else str(e)
        if my_msg.startswith(ERR_STANDARD) or my_msg.startswith(ERR_EXTERNAL):
            return my_msg == leader_msg
        if my_msg.startswith(ERR_TRANSIENT) and leader_msg.startswith(ERR_TRANSIENT):
            return True
        return False
    except Exception:
        return False
