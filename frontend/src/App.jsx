import React, { useState } from 'react'
import openingVideo from './assets/f1-opening-background.mp4'
import './pitwolf.css'
import { RaceSimView } from './components/RaceSimView'
import { StrategyDashboard } from './components/StrategyDashboard'

function App() {
  const [page, setPage] = useState('landing')

  if (page === 'sim') {
    return <RaceSimView
      onOpenDashboard={() => setPage('dashboard')}
      onHome={() => setPage('landing')}
    />
  }
  if (page === 'dashboard') {
    return <StrategyDashboard onHome={() => setPage('landing')} />
  }

  return <main className="pitwolf-landing">
    <video className="pitwolf-video" autoPlay muted loop playsInline preload="metadata" aria-hidden="true">
      <source src={openingVideo} type="video/mp4" />
    </video>
    <div className="pitwolf-video-shade" aria-hidden="true" />
    <div className="pitwolf-grain" aria-hidden="true" />
    <header className="pitwolf-header">
      <div className="pitwolf-wordmark"><span>✦</span><strong>PITWOLF <em>- THE STRATEGIST</em></strong></div>
      <div className="pitwolf-status"><i /> RACE INTELLIGENCE / ONLINE</div>
    </header>
    <section className="pitwolf-hero">
      <p className="pitwolf-eyebrow"><span /> ENERGY &amp; OVERTAKE INTELLIGENCE</p>
      <h1>Make the<br /><em>Strategic call.</em></h1>
      <p className="pitwolf-copy">focused race-strategy workspace for understanding when to attack, when to save, and when the next opportunity is worth waiting for.</p>
      <button className="pitwolf-cta" onClick={() => setPage('sim')}>
        OPEN PITWOLF DASHBOARD <span>↗</span>
      </button>
    </section>
  </main>
}

export default App
