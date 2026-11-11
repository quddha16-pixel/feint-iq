import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AccessBoundary } from "./AccessBoundary";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AccessBoundary />
    </ErrorBoundary>
  </StrictMode>,
);
