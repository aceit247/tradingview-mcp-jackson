---
name: morning-briefing
description: Run a structured morning market brief — scan the watchlist, apply your rules, and produce a concise session bias for each symbol. Use at the start of each trading day.
---

# Morning Briefing Workflow

You are producing the user's pre-session market brief.

## Step 1: Run the Scan

Call `morning_brief` (no arguments needed — it reads rules.json automatically).

This returns:
- `rules` — bias criteria, risk rules, notes from the user's rules.json
- `symbols_scanned` — per-symbol data: indicators, quote, OHLCV summary, Pine drawings

## Step 2: Apply the Bias Criteria

For each symbol in `symbols_scanned`, evaluate:

| Data Source | What to check |
|-------------|---------------|
| `indicators` | RSI (overbought/oversold), MACD crossover, EMA slope |
| `quote` | Last price, change%, volume vs average |
| `ohlcv` | Range, change_pct, last 5 bars trend |
| `pine.lines` | Nearest horizontal support/resistance levels |
| `pine.labels` | Named levels — PDH, Settlement, ASN O/U, Bias label |
| `pine.tables` | Session stats, analytics summaries |

Match readings against `rules.bias_criteria.bullish`, `.bearish`, and `.neutral`.

## Step 3: Format the Brief

Output format — one line per symbol:

```
SYMBOL | BIAS: bullish/bearish/neutral | PRICE: 12345.00 | KEY LEVEL: 12300 (PDH) | WATCH: RSI approaching 70, next resistance at 12400
```

Then one line for overall market read:

```
MARKET: [one sentence — risk-on/risk-off, trending/choppy, any dominant theme]
```

Then risk reminders from `rules.risk_rules` if relevant.

## Step 4: Save the Session

Call `session_save` with the formatted brief text and today's date so it's available for reference later in the session.

## Step 5: Screenshot (optional)

If the user has a complex setup with Pine drawings, call `capture_screenshot` with region "chart" for a visual snapshot of the primary symbol.

## Notes

- **Be concise** — this is a pre-session scan, not a deep analysis
- **Bias beats price targets** — focus on which direction favors setups, not exact levels
- **Call out skips** — if a symbol reads neutral per the criteria, say so clearly ("BTCUSDT | BIAS: neutral — RSI 72, overbought, skip")
- If `morning_brief` errors, check that TradingView is running (`tv_health_check`) and rules.json has a non-empty watchlist
