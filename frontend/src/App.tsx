import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PRIVY_APP_ID,
  CONTRACT_ADDRESS,
  EXPLORER_BASE,
} from "./config";
import {
  readAttestationFee,
  readTotalNotarizations,
  readRecentNotarizations,
  readNotarizationsByRequester,
  type WitnessRecord,
} from "./lib/contract";
import { formatBalance, parseExceptionMessage, formatAddress } from "./lib/format";
import { MetricStatCard, WitnessLedger, WitnessDetail } from "./components";
import { NewNotarization } from "./NewNotarization";
import { WalletButton, useWallet } from "./wallet";
import { IconEye, IconScale, IconGlobe, IconTerminal, IconServer, IconLock } from "./icons";

const REPOSITORY_LINK = "https://github.com/k_bee/optic-witness";
const TWITTER_LINK = "https://x.com/k_bee";

const isPrivyEnabled = Boolean(PRIVY_APP_ID);
const isContractConfigured = Boolean(CONTRACT_ADDRESS);
const springTransition = { type: "spring", stiffness: 400, damping: 30 };

type ActiveTab = "registry" | "personal";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("registry");
  const [attestationFee, setAttestationFee] = useState<bigint | null>(null);
  const [totalNotarizationsCount, setTotalNotarizationsCount] = useState<number>(0);
  const [recentRecords, setRecentRecords] = useState<WitnessRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<WitnessRecord | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Staggered sequential reads to strictly respect StudioNet 30 requests/minute limit
  const fetchContractState = useCallback(async () => {
    if (!isContractConfigured) return;
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const fee = await readAttestationFee();
      setAttestationFee(fee);
      
      // Delay slightly between calls to prevent burst spikes on RPC
      await new Promise((r) => setTimeout(r, 200));
      
      const count = await readTotalNotarizations();
      setTotalNotarizationsCount(count);
      
      await new Promise((r) => setTimeout(r, 200));
      
      const recent = await readRecentNotarizations(15);
      setRecentRecords(recent);
    } catch (error) {
      console.error("RPC Sync Failed", error);
      setErrorMessage(parseExceptionMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchContractState();
  }, [fetchContractState]);

  const verifiedClaimsCount = recentRecords.filter((r) => r.verdict).length;

  return (
    <div className="portal-container">
      {/* Navigation */}
      <nav className="header-navigation">
        <div className="nav-container">
          <div className="brand-logo-section">
            <span className="brand-logo-symbol">
              <IconEye />
            </span>
            <span className="brand-logo-text">OpticWitness</span>
          </div>

          <div className="nav-controls-right">
            <div className="segmented-tab-bar">
              {(["registry", "personal"] as ActiveTab[]).map((tab) => (
                <button
                  key={tab}
                  className={`segmented-tab-item ${activeTab === tab ? "tab-active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {activeTab === tab && (
                    <motion.span
                      layoutId="active-tab-indicator"
                      className="tab-highlight-bg"
                      transition={springTransition}
                    />
                  )}
                  {tab === "registry" ? "Registry Archive" : "My Notarizations"}
                </button>
              ))}
            </div>

            <button className="button-link text-small" onClick={fetchContractState} disabled={isRefreshing}>
              {isRefreshing ? "Syncing..." : "Sync State"}
            </button>
            
            {isPrivyEnabled && <WalletButton />}

            <span className="nav-divider" />
            <a href={REPOSITORY_LINK} target="_blank" rel="noreferrer" className="nav-icon-link" aria-label="GitHub Repository">
              <IconTerminal />
            </a>
            <a href={TWITTER_LINK} target="_blank" rel="noreferrer" className="nav-icon-link" aria-label="X Profile">
              <IconGlobe />
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="hero-jumbotron">
        <motion.div
          className="hero-content"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="hero-eyebrow">
            <IconServer className="hero-eyebrow-icon" /> Secure Attestation Engine · GenLayer StudioNet
          </span>
          <h1 className="hero-title">
            Verifiably Witness Web Visuals
          </h1>
          <p className="hero-subtitle">
            Notarize webpage states with multi-node AI consensus. Independently render pages, 
            extract visual proof, and record findings cryptographically on the blockchain.
          </p>
        </motion.div>
      </header>

      {/* Main Board */}
      <main className="dashboard-grid">
        {errorMessage && (
          <div className="alert-banner alert-error">
            <IconScale />
            <span>
              <strong>RPC Sync Error:</strong> {errorMessage}
            </span>
          </div>
        )}
        {!isContractConfigured && (
          <div className="alert-banner alert-warning">
            <IconLock />
            <span>
              <strong>Contract Configuration Missing:</strong> Set VITE_CONTRACT_ADDRESS in frontend/.env.
            </span>
          </div>
        )}
        {!isPrivyEnabled && (
          <div className="alert-banner alert-warning">
            <IconLock />
            <span>
              <strong>Auth Module Offline:</strong> Set VITE_PRIVY_APP_ID in frontend/.env to enable signing.
            </span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="metric-stats-row">
          <MetricStatCard
            title="Total Notarizations"
            countLimit={totalNotarizationsCount}
            caption="Committed to state"
            visualIcon={<IconScale />}
            isSpecial
            cardIndex={0}
          />
          <MetricStatCard
            title="Attestation Fee"
            textValue={attestationFee != null ? `${formatBalance(attestationFee)} GEN` : "—"}
            caption="Contract registration fee"
            visualIcon={<IconLock />}
            cardIndex={1}
          />
          <MetricStatCard
            title="Claims Verified (Recent)"
            textValue={`${verifiedClaimsCount} / ${recentRecords.length}`}
            caption="Verified active layouts"
            visualIcon={<IconEye />}
            cardIndex={2}
          />
          <MetricStatCard
            title="Network Target"
            textValue="StudioNet (61999)"
            caption="30 req/min RPC limit active"
            visualIcon={<IconGlobe />}
            cardIndex={3}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === "registry" ? (
              <div className="workspace-layout-split">
                <div className="workspace-main-panel">
                  <div className="panel-headline-row">
                    <div>
                      <h2 className="panel-headline-title">Recent Notarizations</h2>
                      <span className="panel-headline-subtitle">Consensus entries from public registry</span>
                    </div>
                  </div>
                  <WitnessLedger records={recentRecords} onSelectRecord={setSelectedRecord} />
                </div>
                <div className="workspace-side-panel">
                  {isPrivyEnabled ? (
                    <NewNotarization feeWei={attestationFee} onRecordCreated={fetchContractState} />
                  ) : (
                    <SetupHelperCard />
                  )}
                  <AnimatePresence>
                    {selectedRecord && (
                      <WitnessDetail record={selectedRecord} onClose={() => setSelectedRecord(null)} />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ) : isPrivyEnabled ? (
              <UserAttestationsSection onSelect={setSelectedRecord} selected={selectedRecord} onClose={() => setSelectedRecord(null)} />
            ) : (
              <SetupHelperCard />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="footer-bar">
        <div className="footer-inner">
          <div className="footer-left-content">
            OpticWitness · GenLayer StudioNet (61999)
            {isContractConfigured && (
              <>
                {" "}·{" "}
                <a
                  href={`${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-mono text-small"
                >
                  {formatAddress(CONTRACT_ADDRESS, 6)}
                </a>
              </>
            )}
          </div>
          <div className="footer-right-content">
            <a href={REPOSITORY_LINK} target="_blank" rel="noreferrer" className="nav-icon-link">
              GitHub
            </a>
            <span className="bullet-spacer" />
            <a href={TWITTER_LINK} target="_blank" rel="noreferrer" className="nav-icon-link">
              Developer Profile
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SetupHelperCard() {
  return (
    <div className="metric-card padding-large">
      <h3 className="card-header-title">Initialize Dashboard</h3>
      <p className="card-caption-text" style={{ marginTop: 8, fontSize: "14px", lineHeight: "1.6" }}>
        Configure the environment credentials to enable notarization requests:
      </p>
      <ul className="setup-steps-list" style={{ paddingLeft: 16, marginTop: 12, fontSize: "13px", lineHeight: "2" }}>
        <li>Define VITE_PRIVY_APP_ID in frontend/.env</li>
        <li>Define VITE_CONTRACT_ADDRESS in frontend/.env</li>
        <li>Switch active wallet chain to StudioNet</li>
        <li>Deposit test GEN and submit attestations</li>
      </ul>
    </div>
  );
}

function UserAttestationsSection({
  onSelect,
  selected,
  onClose,
}: {
  onSelect: (r: WitnessRecord) => void;
  selected: WitnessRecord | null;
  onClose: () => void;
}) {
  const { authenticated, address, login } = useWallet();
  const [userRecords, setUserRecords] = useState<WitnessRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!address) return;
    setIsSyncing(true);
    readNotarizationsByRequester(address)
      .then(setUserRecords)
      .catch((err) => console.error(err))
      .finally(() => setIsSyncing(false));
  }, [address]);

  if (!authenticated || !address) {
    return (
      <div className="workspace-main-panel alignment-center padding-xlarge">
        <h3 className="empty-title">Sign In Required</h3>
        <p className="empty-subtitle" style={{ marginBottom: 16 }}>Connect wallet to inspect requested attestations.</p>
        <button className="button-primary" onClick={login}>
          Authenticate Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="workspace-layout-split">
      <div className="workspace-main-panel">
        <div className="panel-headline-row">
          <div>
            <h2 className="panel-headline-title">My Notarizations</h2>
            <span className="panel-headline-subtitle text-mono">{formatAddress(address, 8)}</span>
          </div>
          {isSyncing && <span className="spinner-loader" />}
        </div>
        <WitnessLedger
          records={userRecords}
          onSelectRecord={onSelect}
          emptyMessage="You have not filed any attestation requests yet."
        />
      </div>
      <div className="workspace-side-panel">
        <AnimatePresence>
          {selected && <WitnessDetail record={selected} onClose={onClose} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
