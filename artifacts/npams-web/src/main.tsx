import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setActiveAgencyGetter, set401Handler } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Set up the API client to use the token from localStorage
setAuthTokenGetter(() => localStorage.getItem("npams_token"));

// Set up the API client to scope requests to the active organization / agency
setActiveAgencyGetter(() => {
  const activeId = localStorage.getItem("npams_active_agency_id");
  return activeId && activeId !== "all" ? activeId : null;
});

// Auto-logout when any API call returns 401 (expired/invalid token)
set401Handler(() => {
  localStorage.removeItem("npams_token");
  localStorage.removeItem("npams_refresh");
  localStorage.removeItem("npams_user");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  window.location.href = `${base}/login`;
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
