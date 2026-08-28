# F1 Driver Physical Stress Calculation Plan (Silent Co-Driver)

This document outlines the theoretical logic, mathematical formulas, and physiological rules for the **F1 Driver Physical Stress Index (PSI)**. It defines the core concept and how the telemetry values (temperature, humidity, G-forces, hydration, lap number) calculate physiological load and fuse with driver voice analysis.

---

## 1. Core Logic & Rationale
Because biometric data for Formula 1 drivers (heart rate, dehydration level) is private and unavailable in public datasets, we will utilize a rule-based **physiological simulator** (the "Live Telemetry Configurator").

Instead of training a machine learning model on a synthetic dataset, we define a calibrated physiological formula. This allows us to adjust variables (temperature, humidity, G-force, lap number, etc.) and instantly calculate realistic, sports-science-based metrics (Heart Rate, Respiratory Rate, Dehydration, and overall Stress Index).

---

## 2. Mathematical Formulas & Physiological Calibration

These formulas define how environmental and mechanical stress factors map to driver biometric load:

### A. Effective Cockpit Temperature ($T_{\text{index}}$)
Accounts for the combined load of high cockpit heat and high relative humidity (modeled after standard Heat Index equations):
$$T_{\text{index}} = \text{Temp} + \left(0.55 \times \frac{\text{Humidity}}{100} \times (\text{Temp} - 14.5)\right)$$

### B. Hydration Decay Rate
Dehydration level begins at $100\%$ and drains per lap. The drain rate increases exponentially in high-heat and high-exertion (G-force) environments:
$$\text{Hydration Drop Per Lap (\%)} = 0.5\% + \left(\frac{T_{\text{index}}}{30}\right)^2 \times (1 + 0.1 \times \text{AvgGForce})$$
$$\text{Hydration} = \max\left(5\%, 100\% - (\text{Hydration Drop Per Lap} \times \text{Lap})\right)$$

### C. Physical Stress Index (PSI, 0 to 100)
A composite index representing total physical strain. It is a weighted sum of thermal load, G-force mechanical load, and fatigue from dehydration:
$$\text{PSI} = \min\left(100, (T_{\text{index}} \times 1.2) + (\text{AvgGForce} \times 4) + (100 - \text{Hydration}) \times 0.6\right)$$

### D. Derived Driver Biometrics
These metrics map the composite PSI into human-readable biometrics for cockpit display:
*   **Heart Rate (HR):**
    $$\text{HR} = 65 + (\text{PSI} \times 1.25)\text{ bpm} \quad (\text{Range: } 65\text{–}190\text{ bpm})$$
*   **Respiratory Rate (Breathing):**
    $$\text{Breathing} = 12 + (\text{PSI} \times 0.5)\text{ breaths/min} \quad (\text{Range: } 12\text{–}62\text{ breaths/min})$$

---

## 3. Voice + Telemetry Fusion Rules

When the driver communicates via the radio microphone, the system fuses **Vocal Stress** (from RMS volume and text cuss words) with **Physical Stress** (calculated from the telemetry formula above) to determine the driver's final state:

### Rule 1: Normal/Moderate Physical Load ($\text{PSI} < 70$)
*   The driver is physically stable.
*   The final driver mood is determined entirely by **voice analysis** (e.g. tone, volume, cuss-word counting), yielding `CALM`, `FRUSTRATED`, or `ANGRY`.

### Rule 2: Extreme Physical Load ($\text{PSI} \ge 70$)
*   The driver is experiencing critical heat, fatigue, or dehydration (similar to Qatar GP 2023 conditions).
*   **Quiet/Normal Voice:** The system automatically flags the driver as `TIRED` (identifying physical exhaustion that doesn't manifest as shouting).
*   **Loud/Frustrated Voice:** The system flags the driver as `ANGRY / HEALTH RISK` (triggering urgent pit-wall warnings that the driver's cognitive or physical capacity is failing).
