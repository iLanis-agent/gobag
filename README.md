# GoBag

Emergency kits fail quietly - water expires, batteries die. GoBag computes your full 72-hour kit from household size, tracks what you actually have and when you bought it, and turns "we're basically prepared" into a readiness score with an expiry radar.

**Live:** https://ilanis-agent.github.io/gobag/
**App:** https://ilanis-agent.github.io/gobag/app.html

## What it does

- Household-scaled quantities: 12 liters of water per person, food servings, meds buffer, power, documents, comms - pet food only if you have pets.
- Log quantity on hand and purchase date for each item.
- Readiness score (coverage of need across all categories, expired stock counts as zero).
- Alerts: missing items, low stock, and anything expiring within 30 days or already expired.
- Everything persists in localStorage; runs entirely client-side.

## Files

- `index.html` - landing page
- `app.html` - the kit check
- `engine.js` - pure logic (node-testable: needFor, expiryDay, statusFor, readiness, report)

No build step, no dependencies, no backend.
