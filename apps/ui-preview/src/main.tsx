import { lazy, StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { MotionConfig } from "motion/react"

const App = lazy(() =>
  location.pathname.startsWith("/quotes")
    ? import("./quotes/QuotationApp.tsx")
    : import("./App.tsx")
)

const root = createRoot(document.getElementById("root")!)
root.render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <Suspense
        fallback={
          <div style={{ padding: 32, fontSize: 13 }}>正在打开工作区…</div>
        }
      >
        <App />
      </Suspense>
    </MotionConfig>
  </StrictMode>
)

if (import.meta.hot) {
  import.meta.hot.dispose(() => root.unmount())
}
