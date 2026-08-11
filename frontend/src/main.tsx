import React from "react";
import ReactDOM from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import { PRIVY_APP_ID } from "./config";
import "./index.css";

function Root() {
  if (!PRIVY_APP_ID) {
    return <App />;
  }
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#c5a880", // Gold/bronze accent
          showWalletLoginFirst: true,
        },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <App />
    </PrivyProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
