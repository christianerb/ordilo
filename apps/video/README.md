# Ordilo campaign films

## Current exports

| File in `out/` | Format | Duration | Purpose |
| --- | --- | --- | --- |
| `ordilo-instagram-reel.mp4` | 1080×1920, 30fps | 20s | Social: family-chaos montage (Kita/Verein/Stadtwerke papers) → scan → typed question → evidence → library → direct CTA |
| `ordilo-homepage-loop.mp4` | 1920×1080, 30fps | 30s | Homepage explainer, same family storyline in six landscape scenes. The old filename remains for compatibility; this is **not** a seamless autoplay loop. |
| `ordilo-app-store.mp4` | 886×1920, 30fps | 18s | Native preview draft: the app's actual local example with kinetic captions, camera zooms, beat dots and progress bar. Four beats: letter → tap → answer with Fundstelle → brand. |

Open `out/ansehen.html` to compare the three MP4s. PNGs are posters, not videos.
All cuts are silent so a separately licensed soundtrack can be added later.
Keep homepage playback user-controlled and use a poster for reduced motion.

## Reproduce

From the repository root:

```sh
npm run typecheck:video
npm run test --workspace @ordilo/video
npm run video:variants
npm run video:variant-stills
npm run video:studio
```

`Campaign.tsx` uses frame-local Remotion sequences with ten-frame reveal
transitions, separate portrait/landscape layouts and end-exclusive scene timing.
`timing.test.mjs` validates continuous coverage and minimum reading/CTA time.

## Artwork and product truth

- `public/campaign/paper-chaos.png`: original generated editorial still-life,
  created for this campaign. No personal documents or third-party family photos.
- Social/homepage paper, bicycle, key and elephant graphics are authored SVG/DOM
  motion graphics, **not recordings of app controls**. The scenes say
  “Beispieldaten”. The synthetic contract says exactly what the answer quotes.
- Access data stays masked. No claim that Ordilo trains a model on family data,
  automatically completes tasks or sets reminders without a choice.
- `native-example-raw.mp4`, `native-letter.png`, `native-answer.png`: captured
  from the actual iPhone 16 QA simulator, iOS 26.5, using the built-in local-only
  example. No production writes, login bypass or family records were used.
- Native snapshots hold the letter and answer long enough to read. The middle
  segment uses actual recorded taps. Editing crops away system/developer chrome.
  It does not manufacture controls or results.

## App Store release boundary

Apple's [App Preview guidance](https://developer.apple.com/app-store/app-previews/)
calls for the actual app experience, not a social-ad film dressed as a phone.
The previous animated mockup is therefore no longer the App Store export.
The new draft fits a common portrait preview size and the 15–30 second duration
range, but **has not been submitted, accepted, or certified for an App Store
device slot**. Verify the current
[specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications)
and the final upload in App Store Connect.

The native cut intentionally demonstrates only the built-in example. It does
not prove a real camera scan, upload, library, secret reveal or reminder delivery.
A complete store launch showcase still needs curated synthetic native footage
of those flows from the release build. Do not replace it with real family data.

## Validation performed

- Video workspace typecheck and four timeline tests.
- Complete H.264 renders of all three compositions.
- Browser playback advanced for each MP4 with no video decode error.
- Six social scene checkpoints extracted from the encoded MP4, plus native and
  homepage scene inspection. `out/social-filmstrip.png` shows the six social
  scenes; `out/playback-review.png` shows the comparison page.
- Native Maestro demo flow passed on the iPhone 16 simulator.

No campaign was published. No live A/B test or performance winner is claimed.
Use `EXPERIMENT.md` for measurement planning, not as evidence of conversion.
