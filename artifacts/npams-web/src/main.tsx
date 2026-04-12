import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Set up the API client to use the token from localStorage
setAuthTokenGetter(() => localStorage.getItem("npams_token"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
