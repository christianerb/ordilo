# Ordilo App Store · V2

Created 2026-09-08. German iPhone 6.9-inch slot; 1260 × 2736 RGB PNG, no alpha.

## Sequence

1. `01-scannen-v2.png`: “Papierkram rein. Kopf frei.” Actual native scan entry card.
2. `02-fragen-v2.png`: “Morgen Ausflug. Was muss noch mal mit?” Actual local example letter.
3. `03-fundstelle-v2.png`: “Ah, die Regenjacke. Da steht’s.” Actual local example answer and source.

The repeated answer screenshot in V1 has been replaced by a newly captured native scan entry. This shows the scan entry, not proof of a successful camera capture/upload. The letter and answer remain the app's built-in fictional example. No private library content is included in upload assets.

Source: native Simulator Save Screen capture from iPhone 16 (Ordilo QA), iOS 26.5, plus existing native captures in apps/video/public/campaign. The raw intake capture is local production input only, never an upload asset; only the neutral scan card is used. Logo is the existing Ordilo mark. Typography is Figtree.

Validation: full contact-sheet inspection, dimensions 1260×2736, 3 RGB channels and no alpha on each upload PNG. Zip contains only the three finished screenshot PNGs. V1 is retained in the parent directory for restoration.

Reproduce: `node docs/marketing/app-store-screenshots/v2/render.cjs` from repository root.

No app release or review submission is part of this update. Captures need to match the eventual submitted build.
