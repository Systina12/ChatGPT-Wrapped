import { Sparkles } from "lucide-react";

const STEPS = [
  { number: "01", title: "Export", detail: "Request your data from ChatGPT." },
  { number: "02", title: "Choose", detail: "Load the ZIP or extracted folder here." },
  { number: "03", title: "Explore", detail: "Read your local report and download the JSON." },
];

export function EmptyState() {
  return (
    <section className="empty-state">
      <div className="empty-orb">
        <Sparkles size={28} />
      </div>
      <p className="eyebrow">Ready when you are</p>
      <h2>Your archive is still private and untouched.</h2>
      <p>
        Choose the ZIP file from your official ChatGPT data export, or select the extracted folder. Parsing happens in
        a Web Worker on this device.
      </p>
      <div className="steps">
        {STEPS.map((step) => (
          <div key={step.number}>
            <span>{step.number}</span>
            <strong>{step.title}</strong>
            <small>{step.detail}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
