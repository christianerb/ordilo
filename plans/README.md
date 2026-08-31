# Animation improvement plans

All plans were audited against commit `d230bcb`. They are specifications only; source implementation is intentionally separate.

| # | Plan | Severity | Status | Depends on |
|---|---|---|---|---|
| 001 | [Bound every web transition](001-bound-web-transitions.md) | HIGH | IMPLEMENTED* | — |
| 002 | [Fix the navigation dot entry](002-fix-navigation-dot-entry.md) | HIGH | IMPLEMENTED* | — |
| 003 | [Preserve feedback under Reduced Motion](003-preserve-feedback-under-reduced-motion.md) | MEDIUM | IMPLEMENTED* | 001 recommended |
| 004 | [Make web task swipes velocity-aware](004-make-web-task-swipes-velocity-aware.md) | MEDIUM | IMPLEMENTED* | 003 |
| 005 | [Make task completion interruptible](005-make-task-toggle-interruptible.md) | MEDIUM | IMPLEMENTED* | 001, 003 |
| 006 | [Move sidebar motion to the compositor](006-move-sidebar-motion-to-compositor.md) | MEDIUM | IMPLEMENTED* | 001, 003 |
| 007 | [Composite web progress indicators](007-composite-web-progress-indicators.md) | MEDIUM | IMPLEMENTED* | 001, 003 |
| 008 | [Fix web voice-meter motion](008-fix-web-voice-meter-motion.md) | MEDIUM | IMPLEMENTED* | 003 |
| 009 | [Add Reduced Motion to native modals](009-add-reduced-motion-to-native-modals.md) | MEDIUM | IMPLEMENTED* | current branch motion foundation |
| 010 | [Remove settings section entrances](010-remove-settings-section-entrances.md) | MEDIUM | IMPLEMENTED* | — |
| 011 | [Consolidate the native motion system](011-consolidate-native-motion-system.md) | LOW | IMPLEMENTED* | 010 |
| 012 | [Animate the first-success guide](012-animate-first-success-guide.md) | LOW | IMPLEMENTED* | 003 |
| 013 | [Animate optional member fields](013-animate-optional-member-fields.md) | LOW | IMPLEMENTED* | 003 |
| 014 | [Animate native onboarding steps](014-animate-native-onboarding-steps.md) | LOW | IMPLEMENTED* | 011 |
| 015 | [Animate the native login state change](015-animate-native-login-state-change.md) | LOW | IMPLEMENTED* | 014 |
| 016 | [Trigger the landing demo on visibility](016-trigger-landing-demo-on-visibility.md) | HIGH | TODO | — |
| 017 | [Calm the landing mascots](017-calm-landing-mascots.md) | MEDIUM | DONE | — |
| 018 | [Fix landing Reduced Motion feedback](018-fix-landing-reduced-motion.md) | MEDIUM | DONE | — |
| 019 | [Make wordmark hover interruptible](019-make-wordmark-hover-interruptible.md) | LOW | DONE | 018 |
| 020 | [Soften the landing FAQ disclosure](020-soften-landing-faq-disclosure.md) | LOW | DONE | 018 recommended |

`IMPLEMENTED*` means automated checks passed; the plan's browser/device feel check remains pending.

## Recommended execution order

### Web

1. **001** removes unbounded transitions before more motion is tuned.
2. **003** establishes correct Reduced Motion behavior.
3. **002** removes the high-frequency navigation pop.
4. **005** makes task toggles reversible and cheap.
5. **004** fixes task swipe physics.
6. **007** moves indicators off layout.
7. **008** fixes the live voice meter.
8. **006** performs the larger persistent-shell refactor.
9. **012** and **013** add the two deliberately rare/occasional moments.

### Native

1. **010** removes unjustified settings entrances.
2. **011** consolidates all remaining motion primitives and tokens.
3. **009** completes Reduce Motion coverage for forms and previews.
4. **014** adds the shared directional step transition and applies it to onboarding.
5. **015** reuses that transition for login.

### Landing page

1. **016** makes the core mobile explanation visible and fixes its sequence.
2. **017** removes competing perpetual mascot motion.
3. **018** closes Reduced Motion gaps before further hover tuning.
4. **019** makes the remaining wordmark hover response interruptible.
5. **020** adds a quiet, state-explaining FAQ entrance.

## Execution rules

- Execute one plan at a time and update its status to `IN PROGRESS`, then `DONE`.
- If code no longer matches the cited commit or excerpt, stop and refresh the plan rather than improvising.
- Run each plan’s focused checks before the full repository checks.
- Native motion is not approved from a simulator alone. Use an iOS release build on a physical iPhone, test interruption and velocity handoff, then test the slowest supported Android device.
- Always test iOS Reduce Motion and web `prefers-reduced-motion`.
