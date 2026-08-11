"""
Direct-mode tests for the OpticWitness Intelligent Contract.

Focuses on initial state, owner privileges, fee modifications, and withdrawals.
"""

import json

CONTRACT_PATH = "contracts/optic_witness.py"
INITIAL_FEE = 2_000_000_000_000_000  # 0.002 GEN in Wei

MOCK_OUTCOME_JSON = json.dumps(
    {
        "claim_present": True,
        "exact_text": "Audited by LexForge on 2026-08-01",
        "confidence": "high",
        "caveats": "",
    }
)


def _setup_mocks(direct_vm, response_json=MOCK_OUTCOME_JSON):
    """Mocks RPC web fetch and LLM evaluation queries."""
    direct_vm.mock_web(r".*", {"status": 200, "body": "<html>audit info</html>"})
    direct_vm.mock_llm(r".*screenshot.*", response_json)


def _hex_address(addr) -> str:
    """Helper to convert/format 20-byte addresses to Hex."""
    if isinstance(addr, (bytes, bytearray)):
        return "0x" + bytes(addr).hex()
    if hasattr(addr, "as_hex"):
        return addr.as_hex
    return str(addr)


# --- Basic States & Initialization -------------------------------------------
def test_contract_deployment_state(direct_vm, direct_deploy, direct_owner):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    assert contract.get_attestation_fee() == str(INITIAL_FEE)
    assert contract.get_total_notarizations() == "0"
    assert contract.get_owner_address().lower() == _hex_address(direct_owner).lower()


# --- Owner Restrictions ------------------------------------------------------
def test_fee_update_restricted_to_owner(direct_vm, direct_deploy, direct_bob):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the owner"):
        contract.update_fee(100)


def test_fee_update_by_owner(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    contract.update_fee(5000000000000000)
    assert contract.get_attestation_fee() == "5000000000000000"


def test_withdraw_restricted_to_owner(direct_vm, direct_deploy, direct_bob):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the owner"):
        contract.withdraw(_hex_address(direct_bob))


# --- Input Validations & Error Handling --------------------------------------
def test_insufficient_fee_reverts(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(direct_vm)
    direct_vm.value = INITIAL_FEE - 1
    with direct_vm.expect_revert("Insufficient fee"):
        contract.request_attestation("https://example.com", "Does it show 10M?")


def test_invalid_url_protocol_reverts(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(direct_vm)
    direct_vm.value = INITIAL_FEE
    with direct_vm.expect_revert("Invalid URL"):
        contract.request_attestation("ftp://example.com", "Question?")


def test_empty_question_reverts(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(direct_vm)
    direct_vm.value = INITIAL_FEE
    with direct_vm.expect_revert("Question cannot be empty"):
        contract.request_attestation("https://example.com", "")


def test_non_existent_record_id_reverts(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    with direct_vm.expect_revert("Non-existent record ID"):
        contract.get_record(99)


# --- Strict Boolean Parsing --------------------------------------------------
def test_strict_boolean_string_parsing(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(
        direct_vm,
        llm_json=json.dumps(
            {
                "claim_present": "no",
                "exact_text": "",
                "confidence": "medium",
                "caveats": "",
            }
        ),
    )
    direct_vm.sender = direct_alice
    direct_vm.value = INITIAL_FEE
    rid = contract.request_attestation("https://example.com", "Does it show 10M?")
    rec = contract.get_record(rid)
    assert rec["verdict"] is False


def test_malformed_boolean_reverts(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(
        direct_vm,
        llm_json=json.dumps(
            {
                "claim_present": "unclear",
                "exact_text": "",
                "confidence": "medium",
                "caveats": "",
            }
        ),
    )
    direct_vm.sender = direct_alice
    direct_vm.value = INITIAL_FEE
    with direct_vm.expect_revert("claim_present must be boolean"):
        contract.request_attestation("https://example.com", "Does it show 10M?")


# --- Validator Equivalence & Consensus ---------------------------------------
def test_validator_agrees_on_matching_outcome(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = INITIAL_FEE
    contract.request_attestation("https://example.com", "Does it show audit?")
    assert direct_vm.run_validator() is True


def test_validator_disagrees_on_verdict_mismatch(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = INITIAL_FEE
    contract.request_attestation("https://example.com", "Does it show audit?")
    
    # Validator sees the claim is false
    direct_vm.clear_mocks()
    _setup_mocks(
        direct_vm,
        response_json=json.dumps(
            {
                "claim_present": False,
                "exact_text": "",
                "confidence": "low",
                "caveats": "",
            }
        ),
    )
    assert direct_vm.run_validator() is False


def test_validator_agrees_on_varying_screenshot_hashes(direct_vm, direct_deploy, direct_alice):
    """
    OpticWitness enhancement test: Validators do not compare screenshot hashes.
    Since web mock assets can vary, this test verifies validator consensus matches 
    even if screenshot files/hashes are configured differently on validator nodes.
    """
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = INITIAL_FEE
    contract.request_attestation("https://example.com", "Does it show audit?")
    
    # Change web mock response to change screenshot hash for validator run
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "<html>different layout / dynamic ad</html>"})
    direct_vm.mock_llm(r".*screenshot.*", MOCK_OUTCOME_JSON)
    # Consensus should still pass because screenshot hash checking is skipped
    assert direct_vm.run_validator() is True


def test_validator_disagrees_on_text_mismatch(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = INITIAL_FEE
    contract.request_attestation("https://example.com", "Does it show audit?")
    
    # Validator sees different supporting text
    direct_vm.clear_mocks()
    _setup_mocks(
        direct_vm,
        response_json=json.dumps(
            {
                "claim_present": True,
                "exact_text": "Audit verified on 2026-09-09 by LexForge",
                "confidence": "high",
                "caveats": "",
            }
        ),
    )
    assert direct_vm.run_validator() is False


def test_validator_agrees_on_text_formatting_variance(direct_vm, direct_deploy, direct_alice):
    """
    OpticWitness normalizes extracted_text to alphanumeric lowercase to prevent
    consensus splits over whitespaces, punctuation, or casing.
    """
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = INITIAL_FEE
    contract.request_attestation("https://example.com", "Does it show audit?")
    
    # Validator returns same alphanumeric sequence but formatted differently
    direct_vm.clear_mocks()
    _setup_mocks(
        direct_vm,
        response_json=json.dumps(
            {
                "claim_present": True,
                "exact_text": "AUDITED BY LexForge on 2026_08_01!!",
                "confidence": "high",
                "caveats": "",
            }
        ),
    )
    assert direct_vm.run_validator() is True


# --- Rate Limiting Safeguards ------------------------------------------------
def test_cooldown_enforcement(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH, INITIAL_FEE, sdk_version="v0.2.1")
    _setup_mocks(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = INITIAL_FEE
    
    # 1st request at 16:00:00
    direct_vm.message_raw = {"datetime": "2026-08-11T16:00:00Z"}
    contract.request_attestation("https://example.com", "Question?")
    
    # 2nd request at 16:00:30 (should revert due to 60s cooldown)
    direct_vm.message_raw = {"datetime": "2026-08-11T16:00:30Z"}
    with direct_vm.expect_revert("Cooldown active"):
        contract.request_attestation("https://example.com", "Question?")
        
    # 3rd request at 16:01:05 (should succeed because it is > 60s later)
    direct_vm.message_raw = {"datetime": "2026-08-11T16:01:05Z"}
    contract.request_attestation("https://example.com", "Question?")
