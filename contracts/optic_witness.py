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
