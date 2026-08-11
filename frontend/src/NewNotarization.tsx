import { useState } from "react";
import { motion } from "framer-motion";
import { useWallet } from "./wallet";
import { requestAttestationNotarization } from "./lib/contract";
import { formatBalance, parseExceptionMessage } from "./lib/format";

const PRESETS = [
  "Does the page define a maximum token supply?",
  "Does the page promise a specific APY on investments?",
  "Does the page list an audit by a named firm?",
  "Does the page state that allocations are non-dilutable?",
];

type SubmissionPhase = "idle" | "submitting" | "consensus" | "finalized" | "error";

export function NewNotarization({
  feeWei,
  onRecordCreated,
}: {
  feeWei: bigint | null;
  onRecordCreated: () => void;
}) {
  const { ready, authenticated, login, getClient } = useWallet();
  const [url, setUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<SubmissionPhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const isBusy = phase === "submitting" || phase === "consensus";
  const canSubmit = ready && authenticated && url.trim() && question.trim() && feeWei != null && !isBusy;

  async function executeNotarization() {
    setErrorMsg(null);
    setTxHash(null);
    try {
      const client = await getClient();
      const result = await requestAttestationNotarization(
        client,
        url.trim(),
        question.trim(),
        feeWei ?? 0n,
        (p) => setPhase(p),
      );
      setTxHash(result.txHash);
      if (result.success) {
        setPhase("finalized");
        setUrl("");
        setQuestion("");
        onRecordCreated();
      } else {
        setPhase("error");
        setErrorMsg("Consensus split or error. No record committed.");
      }
    } catch (e) {
      setPhase("error");
      setErrorMsg(parseExceptionMessage(e));
    }
  }

  return (
    <motion.div
      className="notarization-builder-card"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="card-header-row">
        <div>
          <h3 className="card-header-title">Request Notarization</h3>
          <span className="card-header-subtitle">
            AI consensus rendering and visual content verification
          </span>
        </div>
        {feeWei != null && (
          <span className="fee-badge">Fee: {formatBalance(feeWei)} GEN</span>
        )}
      </div>

      <div className="card-body">
        <div className="form-field">
          <label>Webpage URL</label>
          <input
            type="text"
            className="text-input"
            placeholder="https://example.com/about"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isBusy}
          />
        </div>

        <div className="form-field">
          <label>Claim Statement to Notarize</label>
          <textarea
            className="textarea-input"
            placeholder="Does this page state that the audit was completed?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={isBusy}
          />
          <div className="preset-container">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="preset-chip"
                onClick={() => setQuestion(preset)}
                disabled={isBusy}
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="form-helper-text">
            OpticWitness attests strictly to what the target webpage visually displays. 
            There is a 60-second cooldown per account between submissions to prevent spam.
          </div>
        </div>

        {!authenticated ? (
          <button className="button-primary width-100" onClick={login} disabled={!ready}>
            Sign In to Request
          </button>
        ) : (
          <button className="button-primary width-100" onClick={executeNotarization} disabled={!canSubmit}>
            {isBusy ? <span className="spinner-loader" /> : "File Attestation"}
          </button>
        )}

        {phase !== "idle" && (
          <div className="attestation-progress-steps">
            <div className={`step-item step-passed ${phase === "submitting" ? "step-current" : ""}`}>
              <span className="step-marker-dot" /> Submitting transaction receipt
            </div>
            <div className={`step-item ${phase === "consensus" || phase === "finalized" ? "step-passed" : ""} ${phase === "consensus" ? "step-current" : ""}`}>
              <span className="step-marker-dot" /> Running off-chain consensus rendering
            </div>
            <div className={`step-item ${phase === "finalized" ? "step-passed" : ""} ${phase === "finalized" ? "step-current" : ""}`}>
              <span className="step-marker-dot" /> Attestation registered on-chain
            </div>
          </div>
        )}

        {errorMsg && <div className="error-banner-overlay">{errorMsg}</div>}
        {txHash && (
          <div className="hash-reference-helper">
            Transaction Hash: <span className="text-mono">{txHash}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
