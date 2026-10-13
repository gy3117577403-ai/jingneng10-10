import React from "react";
import { createRoot } from "react-dom/client";
import QuotationWorkspace from "./quotes/QuotationWorkspace";
const root = document.getElementById("quotation-app");
if (root) createRoot(root).render(<QuotationWorkspace {...root.dataset} />);
