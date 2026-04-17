# Shipment Dashboard

Static dashboard for tracking shipment records across FedEx / DHL / UPS.

- **Live site**: https://bob-bhy.github.io/shipment-dashboard/
- **Data source**: [`data/shipments.json`](data/shipments.json) (updated by the sync script)

This repository is updated automatically by the `shipment-tracking-briefing` skill.
Do not edit `data/shipments.json` by hand — changes will be overwritten on the next sync.

## Stack

- Pure static HTML / CSS / JavaScript
- Hosted on GitHub Pages (from the `main` branch root)
- Data lives in a single JSON file; git history = audit trail
