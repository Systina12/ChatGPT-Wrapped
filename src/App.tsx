import { Hero } from "./components/hero/Hero";
import { Report } from "./components/report/Report";
import { EmptyState } from "./components/status/EmptyState";
import { StatusBar } from "./components/status/StatusBar";
import { useWrappedReport } from "./hooks/useWrappedReport";
import { downloadWrappedData } from "./lib/report/download";

function App() {
  const { state, analyze, reset } = useWrappedReport();

  return (
    <main className="app-shell">
      <Hero />
      <StatusBar
        state={state}
        onFiles={analyze}
        onDownload={() => state.status === "done" && downloadWrappedData(state.data)}
        onReset={reset}
      />
      {state.status === "done" ? <Report data={state.data} /> : <EmptyState />}
    </main>
  );
}

export default App;
