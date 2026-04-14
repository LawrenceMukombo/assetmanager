import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, set401Handler } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Set up the API client to use the token from localStorage
setAuthTokenGetter(() => localStorage.getItem("npams_token"));

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
