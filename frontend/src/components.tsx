import { useEffect, useRef, useState } from "react";
import { motion, useInView, animate } from "framer-motion";
import type { WitnessRecord } from "./lib/contract";
import { formatAddress, formatRelativeTime, parseHostname } from "./lib/format";
import { EXPLORER_BASE } from "./config";

export function VerdictBadge({ status }: { status: boolean }) {
  return status ? (
    <span className="badge-premium badge-shown">
      <span className="status-indicator-dot" /> Claim Present
    </span>
  ) : (
    <span className="badge-premium badge-absent">
      <span className="status-indicator-dot" /> Not Detected
    </span>
  );
}

export function ConfidenceScale({ level }: { level: string }) {
  const normalizedLevel = (level || "low").toLowerCase();
  const scaleClass =
    normalizedLevel === "high"
      ? "scale-high"
      : normalizedLevel === "medium"
        ? "scale-medium"
        : "scale-low";

  return <span className={`badge-premium ${scaleClass}`}>{normalizedLevel}</span>;
}

function SmoothNumberCounter({ targetValue }: { targetValue: number }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const elementInView = useInView(containerRef, { once: true });
  const [currentDisplay, setCurrentDisplay] = useState(0);

  useEffect(() => {
    if (!elementInView) return;
    const animationController = animate(0, targetValue, {
      duration: 1.0,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setCurrentDisplay(Math.round(v)),
    });
    return () => animationController.stop();
  }, [elementInView, targetValue]);

  return <span ref={containerRef}>{currentDisplay}</span>;
}

export function MetricStatCard({
  title,
  textValue,
  caption,
  visualIcon,
  countLimit,
  isSpecial,
  cardIndex = 0,
}: {
  title: string;
  textValue?: React.ReactNode;
  caption?: string;
  visualIcon?: React.ReactNode;
  countLimit?: number;
  isSpecial?: boolean;
  cardIndex?: number;
}) {
  return (
    <motion.div
      className={`metric-card ${isSpecial ? "card-accented" : ""}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: cardIndex * 0.08, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="card-header-row">
        <span className="card-title-text">{title}</span>
        {visualIcon && <span className="card-icon-wrapper">{visualIcon}</span>}
      </div>
      <div className="card-value-display">
        {countLimit != null ? <SmoothNumberCounter targetValue={countLimit} /> : textValue}
      </div>
      {caption && <div className="card-caption-text">{caption}</div>}
    </motion.div>
  );
}

export function WitnessLedger({
  records,
  onSelectRecord,
  emptyMessage,
}: {
  records: WitnessRecord[];
  onSelectRecord: (r: WitnessRecord) => void;
  emptyMessage?: string;
}) {
  if (records.length === 0) {
    return (
      <div className="empty-ledger-view">
        <div className="empty-title">Archive Empty</div>
        <div className="empty-subtitle">{emptyMessage ?? "Notarization ledger is currently clear."}</div>
      </div>
    );
  }

  return (
    <div className="ledger-table-container">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Registry ID</th>
            <th>Target Domain</th>
            <th>Question Parameters</th>
            <th>Verdict</th>
            <th>Attestation Quality</th>
            <th>Registered</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, index) => (
            <motion.tr
              key={r.id}
              onClick={() => onSelectRecord(r)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.3) }}
              className="ledger-row"
            >
              <td className="column-id">#{r.id}</td>
              <td className="column-domain" title={r.url}>
                {parseHostname(r.url)}
              </td>
              <td className="column-question" title={r.question}>
                {r.question}
              </td>
              <td className="column-verdict">
                <VerdictBadge status={r.verdict} />
              </td>
              <td className="column-confidence">
                <ConfidenceScale level={r.confidence_score} />
              </td>
              <td className="column-time">{formatRelativeTime(r.timestamp)}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WitnessDetail({
  record,
  onClose,
}: {
  record: WitnessRecord;
  onClose: () => void;
}) {
  const [screenshotViewerOpen, setScreenshotViewerOpen] = useState(false);
  const [integrityStatus, setIntegrityStatus] = useState<"verifying" | "matched" | "corrupt" | "failed">(
    "verifying",
  );

  useEffect(() => {
    let active = true;
    async function runIntegrityAudit() {
      if (!record.screenshot_b64) {
        setIntegrityStatus("failed");
        return;
      }
      try {
        const decodedBinary = atob(record.screenshot_b64);
        const uint8Array = new Uint8Array(decodedBinary.length);
        for (let i = 0; i < decodedBinary.length; i++) {
          uint8Array[i] = decodedBinary.charCodeAt(i);
        }
        const hashBuffer = await crypto.subtle.digest("SHA-256", uint8Array);
        const hexHashString = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        
        if (!active) return;
        
        if (hexHashString === record.screenshot_hash) {
          setIntegrityStatus("matched");
        } else {
          setIntegrityStatus("corrupt");
        }
      } catch {
        if (active) setIntegrityStatus("failed");
      }
    }
    
    runIntegrityAudit();
    return () => {
      active = false;
    };
  }, [record.screenshot_b64, record.screenshot_hash]);

  const copyNotarizationLink = () => {
    const rawLink = `${window.location.origin}${window.location.pathname}#/record/${record.id}`;
    navigator.clipboard?.writeText(rawLink);
  };

  const formattedTxUrl = `${EXPLORER_BASE}/address/${record.requester}`;

  return (
    <>
      <motion.div
        className="detail-panel-card"
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="panel-header">
          <div className="panel-title-container">
            <h3 className="panel-heading">Record #{record.id}</h3>
            <span className="panel-subheading">Immutable Ledger Entry</span>
          </div>
          <button className="panel-close-button" onClick={onClose}>
            Dismiss
          </button>
        </div>

        <div className="panel-body">
          <div className="panel-status-indicators">
            <VerdictBadge status={record.verdict} />
            <ConfidenceScale level={record.confidence_score} />
            <span className="badge-premium scale-low">consensus finalized</span>
          </div>

          <div className="notarization-grid">
            <div className="notarization-field">
              <label>Target URL</label>
              <div className="field-value-link">
                <a href={record.url} target="_blank" rel="noopener noreferrer">
                  {record.url}
                </a>
              </div>
            </div>

            <div className="notarization-field">
              <label>Verification Statement</label>
              <div className="field-value-text">{record.question}</div>
            </div>

            <div className="notarization-field">
              <label>Consensus Extracted Text</label>
              <div className="field-value-text blockquote-quote">
                {record.extracted_text || <span className="text-muted">— No text matches registered —</span>}
              </div>
            </div>

            {record.notes && (
              <div className="notarization-field">
                <label>Validator Notes & Caveats</label>
                <div className="field-value-text caveats-container">{record.notes}</div>
              </div>
            )}

            <div className="notarization-field-row">
              <div className="notarization-field">
                <label>Requester Address</label>
                <div className="field-value-mono">{formatAddress(record.requester, 6)}</div>
              </div>
              <div className="notarization-field">
                <label>Timestamp</label>
                <div className="field-value-text">{record.timestamp}</div>
              </div>
            </div>

            <div className="notarization-field">
              <label>Proof Integrity Reference</label>
              <div className="field-value-mono value-hash-cell" title={record.screenshot_hash}>
                {record.screenshot_hash || "No Hash Reference"}
              </div>
            </div>

            <div className="notarization-field">
              <label>Spectrograph Verification</label>
              <div className="field-value-screenshot-preview">
                {record.screenshot_b64 ? (
                  <div className="screenshot-widget">
                    <button
                      className="button-primary button-sm"
                      onClick={() => setScreenshotViewerOpen(true)}
                    >
                      Examine Visual Evidence
                    </button>
                    <div className="integrity-status-label">
                      {integrityStatus === "matched" && (
                        <span className="integrity-text text-success">
                          ✓ SHA-256 integrity check verified
                        </span>
                      )}
                      {integrityStatus === "corrupt" && (
                        <span className="integrity-text text-danger">
                          ✗ Integrity mismatch: content altered
                        </span>
                      )}
                      {integrityStatus === "verifying" && (
                        <span className="integrity-text text-warning">
                          Audit in progress...
                        </span>
                      )}
                      {integrityStatus === "failed" && (
                        <span className="integrity-text text-muted">
                          Verification failed
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="text-muted">No screenshot attached.</span>
                )}
              </div>
            </div>
          </div>

          <div className="panel-actions-row">
            <button className="button-secondary" onClick={copyNotarizationLink}>
              Copy Proof Link
            </button>
            <a
              className="button-link-accent"
              href={formattedTxUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Verify Requester on Explorer
            </a>
          </div>
        </div>
      </motion.div>

      {screenshotViewerOpen && (
        <div className="spectrograph-modal-overlay" onClick={() => setScreenshotViewerOpen(false)}>
          <motion.div
            className="spectrograph-modal-content"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <div className="modal-title-bar">
              <h4>Visual Evidence Spectrograph</h4>
              <button
                className="panel-close-button"
                onClick={() => setScreenshotViewerOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="modal-body-viewport">
              <img
                src={`data:image/png;base64,${record.screenshot_b64}`}
                alt="Web page screenshot captured by L1 validators"
                className="spectrograph-full-image"
              />
            </div>
            <div className="modal-footer-caption">
              On-chain cryptographically bound capture | SHA-256 Reference: {record.screenshot_hash}
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
