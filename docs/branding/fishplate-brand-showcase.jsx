import { useState } from "react";

function Mark({ size = 40, color = "#E2E8F0", accent = "#3B82F6" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="2" y="13" width="15" height="2" rx="1" fill={color} />
      <rect x="23" y="13" width="15" height="2" rx="1" fill={color} />
      <rect x="2" y="25" width="15" height="2" rx="1" fill={color} />
      <rect x="23" y="25" width="15" height="2" rx="1" fill={color} />
      <rect x="14" y="10.5" width="12" height="7" rx="1.5" fill={accent} opacity="0.9" />
      <rect x="14" y="22.5" width="12" height="7" rx="1.5" fill={accent} opacity="0.9" />
      <circle cx="17" cy="14" r="0.8" fill={color} opacity="0.2" />
      <circle cx="23" cy="14" r="0.8" fill={color} opacity="0.2" />
      <circle cx="17" cy="26" r="0.8" fill={color} opacity="0.2" />
      <circle cx="23" cy="26" r="0.8" fill={color} opacity="0.2" />
    </svg>
  );
}

function Word({ color = "#E2E8F0", size = 20 }) {
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      fontWeight: 600, fontSize: size, color, letterSpacing: "-0.01em", userSelect: "none",
    }}>fishplate</span>
  );
}

function Logo({ theme = "dark", size = "md" }) {
  const s = { sm: [24, 14, 7], md: [32, 18, 9], lg: [44, 24, 11], xl: [56, 30, 14] }[size];
  const d = theme === "dark";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: s[2] }}>
      <Mark size={s[0]} color={d ? "#E2E8F0" : "#0f172a"} accent={d ? "#3B82F6" : "#2563EB"} />
      <Word color={d ? "#E2E8F0" : "#0f172a"} size={s[1]} />
    </div>
  );
}

function Card({ children, bg = "#0a0e17", label, pad = 28 }) {
  const lt = bg === "#FFFFFF";
  return (
    <div style={{
      background: bg, border: `1px solid ${lt ? "#e2e8f0" : "#1e2d3d"}`,
      borderRadius: 8, padding: pad, position: "relative",
    }}>
      {children}
      {label && <span style={{ position: "absolute", bottom: 8, right: 12, fontSize: 9, color: lt ? "#94a3b8" : "#475569", fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>}
    </div>
  );
}

function S({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: 2, textTransform: "uppercase", margin: "0 0 14px", fontFamily: "'JetBrains Mono', monospace" }}>{title}</h2>
      {children}
    </div>
  );
}

function Swatch({ hex, name }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 6, background: hex, border: "1px solid rgba(255,255,255,0.08)" }} />
      <div>
        <div style={{ fontSize: 11, color: "#E2E8F0", fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 10, color: "#475569" }}>{hex}</div>
      </div>
    </div>
  );
}

export default function FishplateBrand() {
  const [tab, setTab] = useState("system");
  return (
    <div style={{ background: "#0a0e17", minHeight: "100vh", fontFamily: "'JetBrains Mono', monospace", color: "#E2E8F0" }}>

      {/* Hero */}
      <div style={{ padding: "72px 40px 56px", textAlign: "center", background: "radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.06) 0%, transparent 60%)" }}>
        <Mark size={104} />
        <div style={{ marginTop: 32 }}><Word size={42} /></div>
        <p style={{ color: "#475569", fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>
          The plate that makes two separate things one continuous path
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 28 }}>
          {[["system", "Logo System"], ["context", "In Context"], ["spec", "Spec"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              background: tab === id ? "#1e3a5f" : "transparent",
              border: `1px solid ${tab === id ? "#3B82F6" : "#1e2d3d"}`,
              color: tab === id ? "#3B82F6" : "#64748b",
              padding: "5px 14px", borderRadius: 5, cursor: "pointer",
              fontFamily: "inherit", fontSize: 11, fontWeight: 600, transition: "all 0.15s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "32px 40px 64px", maxWidth: 860, margin: "0 auto" }}>

        {tab === "system" && <>
          <S title="Full Logo">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card label="Dark"><Logo theme="dark" size="lg" /></Card>
              <Card bg="#FFFFFF" label="Light"><Logo theme="light" size="lg" /></Card>
            </div>
          </S>

          <S title="Scale">
            <Card>
              <div style={{ display: "flex", flexDirection: "column", gap: 22, alignItems: "flex-start" }}>
                {["xl", "lg", "md", "sm"].map(sz => (
                  <div key={sz} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ color: "#475569", fontSize: 10, width: 24, textAlign: "right" }}>{sz.toUpperCase()}</span>
                    <Logo theme="dark" size={sz} />
                  </div>
                ))}
              </div>
            </Card>
          </S>

          <S title="Mark Only">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {[64, 48, 32, 24, 16].map(sz => (
                <Card key={sz} label={`${sz}px`}>
                  <div style={{ display: "flex", justifyContent: "center", minHeight: 64, alignItems: "center" }}>
                    <Mark size={sz} />
                  </div>
                </Card>
              ))}
            </div>
          </S>

          <S title="Color Variants">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <Card label="Primary">
                <div style={{ display: "flex", justifyContent: "center" }}><Mark size={52} /></div>
              </Card>
              <Card label="Mono White">
                <div style={{ display: "flex", justifyContent: "center" }}><Mark size={52} color="#E2E8F0" accent="#E2E8F0" /></div>
              </Card>
              <Card bg="#FFFFFF" label="Mono Black">
                <div style={{ display: "flex", justifyContent: "center" }}><Mark size={52} color="#0f172a" accent="#0f172a" /></div>
              </Card>
              <Card label="Muted">
                <div style={{ display: "flex", justifyContent: "center" }}><Mark size={52} color="#475569" accent="#64748b" /></div>
              </Card>
            </div>
          </S>
        </>}

        {tab === "context" && <>
          <S title="CLI Output">
            <Card>
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                  <Mark size={18} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>fishplate</span>
                  <span style={{ color: "#475569", fontSize: 11 }}>v0.1.0</span>
                </div>
                <div style={{ color: "#64748b" }}>$ fishplate run --template tdd --handler claude-code</div>
                <div style={{ marginTop: 10 }}>
                  {[
                    ["✓", "#10b981", "plan_tests", "#94a3b8", "12s"],
                    ["✓", "#10b981", "write_test", "#94a3b8", "45s"],
                    ["✓", "#10b981", "verify_red", "#94a3b8", "2s"],
                    ["●", "#3B82F6", "implement", "#E2E8F0", "1m 3s"],
                    ["○", "#334155", "verify_green", "#334155", ""],
                  ].map(([icon, ic, name, nc, time], i) => (
                    <div key={i}>
                      <span style={{ color: ic }}>{icon}</span>{" "}
                      <span style={{ color: nc }}>{name}</span>
                      {time && <><span style={{ color: "#334155" }}> · </span><span style={{ color: "#475569" }}>{time}</span></>}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </S>

          <S title="GitHub README">
            <Card>
              <div style={{ lineHeight: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Mark size={24} />
                  <span style={{ fontSize: 20, fontWeight: 700 }}>fishplate</span>
                </div>
                <p style={{ color: "#94a3b8", fontSize: 13, margin: "8px 0 14px", lineHeight: 1.6 }}>
                  Railroad tracks for nondeterministic coding agents. Define your SDLC as a workflow graph, plug in any CLI tool, and the runner enforces the process step by step.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    ["npm", "@fishplate/cli", "#cb3837"],
                    ["license", "MIT", "#10b981"],
                    ["runtime", "DBOS + Postgres", "#3B82F6"],
                    ["build", "passing", "#10b981"],
                  ].map(([l, r, bg], i) => (
                    <div key={i} style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", fontSize: 10, fontWeight: 600 }}>
                      <span style={{ background: "#334155", color: "#e2e8f0", padding: "2px 7px" }}>{l}</span>
                      <span style={{ background: bg, color: "#fff", padding: "2px 7px" }}>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </S>

          <S title="Website Header">
            <Card pad={0}>
              <div style={{ padding: "16px 24px", borderBottom: "1px solid #1e2d3d", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Mark size={24} />
                  <Word size={16} />
                </div>
                <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#64748b" }}>
                  <span>Docs</span>
                  <span>Templates</span>
                  <span>Cloud</span>
                  <span style={{ color: "#3B82F6" }}>GitHub</span>
                </div>
              </div>
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <Mark size={56} />
                <div style={{ marginTop: 20 }}><Word size={28} /></div>
                <p style={{ color: "#64748b", fontSize: 13, marginTop: 12, maxWidth: 400, margin: "12px auto 0" }}>
                  Railroad tracks for nondeterministic coding agents
                </p>
                <div style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "center" }}>
                  <span style={{ background: "#3B82F6", color: "#fff", padding: "8px 20px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>Get Started</span>
                  <span style={{ background: "transparent", color: "#94a3b8", padding: "8px 20px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid #1e2d3d" }}>View on GitHub</span>
                </div>
              </div>
            </Card>
          </S>

          <S title="Social Card / OG Image">
            <Card pad={0}>
              <div style={{
                padding: "48px 40px",
                background: "linear-gradient(135deg, #0a0e17 0%, #0f1a2e 100%)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <Mark size={36} />
                    <Word size={24} />
                  </div>
                  <p style={{ color: "#64748b", fontSize: 13, maxWidth: 320, lineHeight: 1.6, margin: 0 }}>
                    Railroad tracks for nondeterministic coding agents. SDLC workflow enforcement for human + AI development teams.
                  </p>
                </div>
                <Mark size={80} color="#1e2d3d" accent="#1e3a5f" />
              </div>
            </Card>
          </S>
        </>}

        {tab === "spec" && <>
          <S title="Colors">
            <Card>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                <Swatch hex="#E2E8F0" name="Rail (dark bg)" />
                <Swatch hex="#0f172a" name="Rail (light bg)" />
                <Swatch hex="#3B82F6" name="Accent (dark bg)" />
                <Swatch hex="#2563EB" name="Accent (light bg)" />
                <Swatch hex="#0a0e17" name="Background" />
                <Swatch hex="#111827" name="Surface" />
              </div>
            </Card>
          </S>

          <S title="Typography">
            <Card>
              <div style={{ fontSize: 12, lineHeight: 2, color: "#94a3b8" }}>
                <div><strong style={{ color: "#E2E8F0" }}>Wordmark font:</strong> JetBrains Mono, weight 600</div>
                <div><strong style={{ color: "#E2E8F0" }}>Fallbacks:</strong> SF Mono → Fira Code → monospace</div>
                <div><strong style={{ color: "#E2E8F0" }}>Letter spacing:</strong> -0.01em</div>
                <div><strong style={{ color: "#E2E8F0" }}>Case:</strong> Always lowercase</div>
              </div>
            </Card>
          </S>

          <S title="Construction">
            <Card>
              <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
                <div style={{ position: "relative" }}>
                  <svg width={200} height={200} viewBox="0 0 40 40" fill="none" style={{ background: "#0f1a2e", borderRadius: 8 }}>
                    {/* Grid */}
                    {Array.from({ length: 41 }, (_, i) => (
                      <line key={`h${i}`} x1={0} y1={i} x2={40} y2={i} stroke="#1e2d3d" strokeWidth="0.1" />
                    ))}
                    {Array.from({ length: 41 }, (_, i) => (
                      <line key={`v${i}`} x1={i} y1={0} x2={i} y2={40} stroke="#1e2d3d" strokeWidth="0.1" />
                    ))}
                    {/* Mark with annotations */}
                    <rect x="2" y="13" width="15" height="2" rx="1" fill="#E2E8F0" opacity="0.5" />
                    <rect x="23" y="13" width="15" height="2" rx="1" fill="#E2E8F0" opacity="0.5" />
                    <rect x="2" y="25" width="15" height="2" rx="1" fill="#E2E8F0" opacity="0.5" />
                    <rect x="23" y="25" width="15" height="2" rx="1" fill="#E2E8F0" opacity="0.5" />
                    <rect x="14" y="10.5" width="12" height="7" rx="1.5" fill="#3B82F6" opacity="0.5" />
                    <rect x="14" y="22.5" width="12" height="7" rx="1.5" fill="#3B82F6" opacity="0.5" />
                    {/* Center gap indicator */}
                    <line x1="20" y1="8" x2="20" y2="32" stroke="#ef4444" strokeWidth="0.15" strokeDasharray="0.5 0.5" />
                    {/* Clearspace indicator */}
                    <rect x="2" y="2" width="36" height="36" rx="0" stroke="#f59e0b" strokeWidth="0.15" strokeDasharray="0.5 0.5" fill="none" />
                  </svg>
                </div>
                <div style={{ fontSize: 11, lineHeight: 2, color: "#94a3b8" }}>
                  <div><strong style={{ color: "#E2E8F0" }}>Grid:</strong> 40 × 40 units</div>
                  <div><strong style={{ color: "#E2E8F0" }}>Rail width:</strong> 2 units</div>
                  <div><strong style={{ color: "#E2E8F0" }}>Rail length (per segment):</strong> 15 units</div>
                  <div><strong style={{ color: "#E2E8F0" }}>Gap (the joint):</strong> 6 units (17→23)</div>
                  <div><strong style={{ color: "#E2E8F0" }}>Fishplate size:</strong> 12 × 7 units</div>
                  <div><strong style={{ color: "#E2E8F0" }}>Plate corner radius:</strong> 1.5 units</div>
                  <div><strong style={{ color: "#E2E8F0" }}>Rail corner radius:</strong> 1 unit</div>
                  <div><strong style={{ color: "#E2E8F0" }}>Rail gauge (top to bottom):</strong> 12 units</div>
                  <div><strong style={{ color: "#E2E8F0" }}>Bolt radius:</strong> 0.8 units</div>
                  <div style={{ marginTop: 8, color: "#475569", fontSize: 10 }}>
                    <span style={{ color: "#ef4444" }}>─ ─</span> Joint center line
                    <br />
                    <span style={{ color: "#f59e0b" }}>─ ─</span> Clear space boundary
                  </div>
                </div>
              </div>
            </Card>
          </S>

          <S title="Minimum Sizes">
            <Card>
              <div style={{ fontSize: 12, lineHeight: 2, color: "#94a3b8" }}>
                <div><strong style={{ color: "#E2E8F0" }}>Full logo:</strong> 120px minimum width</div>
                <div><strong style={{ color: "#E2E8F0" }}>Mark only:</strong> 16px minimum (use favicon-optimized SVG below 24px)</div>
                <div><strong style={{ color: "#E2E8F0" }}>Clear space:</strong> 25% of mark height on all sides</div>
              </div>
            </Card>
          </S>

          <S title="Files Included">
            <Card>
              <div style={{ fontSize: 11, lineHeight: 2, color: "#94a3b8" }}>
                {[
                  "mark-dark.svg — Primary mark, dark backgrounds",
                  "mark-light.svg — Primary mark, light backgrounds",
                  "mark-mono-white.svg — Monochrome white",
                  "mark-mono-black.svg — Monochrome black",
                  "favicon.svg — Simplified for 16×16",
                  "logo-full-dark.svg — Mark + wordmark, dark",
                  "logo-full-light.svg — Mark + wordmark, light",
                  "BRAND.md — Usage guidelines",
                ].map((f, i) => (
                  <div key={i}>
                    <span style={{ color: "#3B82F6" }}>→</span> {f}
                  </div>
                ))}
              </div>
            </Card>
          </S>
        </>}

      </div>
    </div>
  );
}
