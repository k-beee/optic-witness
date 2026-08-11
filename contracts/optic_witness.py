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
