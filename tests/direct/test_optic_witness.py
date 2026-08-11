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
