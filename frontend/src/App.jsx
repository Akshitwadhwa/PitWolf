import React from 'react'
import openingVideo from './assets/f1-opening-background.mp4'
import './pitwolf.css'
import { StrategyDashboard } from './components/StrategyDashboard'

function App() {
  const demo = new URLSearchParams(window.location.search).get('demo')
  if (demo === 'dashboard') return <StrategyDashboard />

  return <main className="pitwolf-landing">
    <video className="pitwolf-video" autoPlay muted loop playsInline preload="metadata" aria-hidden="true">
      <source src={openingVideo} type="video/mp4" />
    </video>
    <div className="pitwolf-video-shade" aria-hidden="true" />
    <div className="pitwolf-grain" aria-hidden="true" />
    <header className="pitwolf-header"><div className="pitwolf-wordmark"><span>✦</span><strong>PITWOLF <em>COPILOT</em></strong></div><div className="pitwolf-status"><i /> RACE INTELLIGENCE / ONLINE</div></header>
    <section className="pitwolf-hero"><p className="pitwolf-eyebrow"><span /> ENERGY &amp; OVERTAKE INTELLIGENCE</p><h1>Make the<br /><em>right call.</em></h1><p className="pitwolf-copy">A focused race-strategy workspace for understanding when to attack, when to save, and when the next opportunity is worth waiting for.</p><button className="pitwolf-cta" onClick={() => { window.location.href = `${window.location.pathname}?demo=dashboard` }}>OPEN OVERVOLT DASHBOARD <span>↗</span></button></section>
    <footer className="pitwolf-footer"><span><i /> HISTORICAL TELEMETRY / MODELLED ENERGY</span><span>THE SILENT CO-DRIVER / UPDATED DESIGN</span></footer>
  </main>
}

export default App
