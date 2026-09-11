import { ShieldCheck, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <header className="hero-band">
      <div className="hero-copy">
        <p className="eyebrow">
          <Sparkles size={15} /> ChatGPT Wrapped
        </p>
        <h1>Meet your ChatGPT year.</h1>
        <p className="lede">
          Turn an official ChatGPT export into a quiet, personal report about what you asked, when you showed up, and
          how your conversations grew.
        </p>
        <div className="privacy-pill">
          <ShieldCheck size={16} />
          <span>Local by design — your export never leaves this device.</span>
        </div>
      </div>
      <div className="hero-poster" aria-label="Privacy promise">
        <div className="poster-orbit poster-orbit-one" />
        <div className="poster-orbit poster-orbit-two" />
        <span className="poster-kicker">A personal archive</span>
        <strong>
          Make the invisible
          <br />
          patterns visible.
        </strong>
        <small>No account. No upload. No backend.</small>
      </div>
    </header>
  );
}
