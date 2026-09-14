# Ordilo · App Store screenshots · V1

Three German iPhone screenshots, 1260 × 2736 pixels, opaque RGB PNG.

Order: `01-keine-suchmaschine.png`, `02-der-schulbrief.png`, `03-antwort-mit-fundstelle.png`.
`preview.png` is a review contact sheet, not an upload asset.

Uses Figtree, the original Ordilo mark and unretouched crops from the native local example captures in `apps/video/public/campaign/`. Captures show fictional sample content, not a real scan/upload or a live document answer. Developer chrome is excluded by cropping to the sample card. No app controls or answers were invented.

This is a creative review set. It demonstrates only the built-in sample. Before release, confirm that this exact sample is accessible in the submitted build and review the final device-slot preview in App Store Connect. Additional scanner/library/family screenshots need corresponding native captures. No upload or submission has occurred. User approval is required before upload.

Reproduce from repository root: `node docs/marketing/app-store-screenshots/render.cjs`.
Requires existing `sharp` and `@expo-google-fonts/figtree` dependencies.

Validation: all three exports inspected as a contact sheet; dimensions, RGB channels and absence of alpha checked programmatically.

Apple specifications checked 2026-09-08: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
