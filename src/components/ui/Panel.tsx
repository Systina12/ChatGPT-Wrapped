import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}

export function Panel({ title, subtitle, icon, children }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <div className="panel-title">
            <span className="panel-icon">{icon}</span>
            <h3>{title}</h3>
          </div>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
