# 券来 · Design QA

- Source visual truth: `design-reference.png`
- Implementation screenshot: `qa-screenshots/implementation-desktop-pass2.png`
- Full comparison: `qa-screenshots/comparison-pass2.png`
- Responsive evidence: `qa-screenshots/implementation-mobile.png`
- Interaction evidence: `qa-screenshots/interaction-success.png`
- Source pixels: 1487 × 1058
- Implementation pixels: 1440 × 1024
- CSS viewport: 1440 × 1024 at device scale factor 1
- Normalization: source resized proportionally to 1440 × 1024; implementation kept at native capture size
- Compared state: initial setup state, empty phone and OTP fields, time set to 00:00

## Findings

No actionable P0, P1, or P2 findings remain.

- Fonts and typography: bundled Noto Sans SC Variable closely preserves the source's Chinese sans-serif proportions, optical weight, hierarchy, wrapping, and line height.
- Spacing and layout rhythm: the two-column frame, header rule, hero block, trust row, progress stepper, fields, and next-run strip align with the source at the normalized viewport.
- Colors and visual tokens: warm off-white base, ink text, mint surfaces, borders, and green primary action match the source intent with accessible contrast.
- Image quality and asset fidelity: the source contains no raster hero or product imagery. All functional icons use one consistent Phosphor icon family; no placeholder or handcrafted SVG assets are present.
- Copy and content: all app-specific Chinese copy is complete and coherent. The official Skill connection state, explicit service-rule consent, and local-token notice fit the selected hierarchy.
- Interaction states: phone validation, real OTP request, resend countdown, six-field OTP entry, official OTP verification, time selection, loading, error, and success states were exercised.
- Responsiveness: the 390 × 844 check has no horizontal overflow (`scrollWidth === clientWidth`); the longer mobile flow scrolls vertically without clipped controls.
- Accessibility: persistent labels, semantic controls, keyboard focus styles, reduced-motion handling, numeric input modes, live status text, and practical mobile target sizes are present.

## Comparison History

### Pass 1 — blocked

- [P2] Initial primary and OTP-request actions were rendered in a pale disabled state while the source shows strong green actions.
  - Evidence: `qa-screenshots/comparison-pass1.png`.
  - Impact: the initial visual hierarchy was weaker than the selected design.
  - Fix: kept the actions visibly available and moved validation feedback to the click path; the completed/sending states remain disabled when appropriate.
- [P3] OTP cells lacked the source's centered dash placeholders.
  - Fix: added `—` placeholders to all six fields.

### Pass 2 — passed

- Post-fix evidence: `qa-screenshots/comparison-pass2.png`.
- The earlier P2 action-hierarchy mismatch is resolved.
- Remaining P3: the source shows a green focus border on the first OTP cell before a code is sent, while the implementation reserves focus styling for an enabled field. This intentional behavior avoids suggesting that the field is usable too early.
- Remaining P3: the implementation uses the platform-native time affordance rather than the source's decorative chevron, preserving keyboard and screen-reader usability.

## Browser Verification

- Browser-rendered URL: `http://127.0.0.1:4173/`
- Primary interactions tested: enter a valid phone number, accept the official service rule, request a real OTP, confirm the 60-second resend countdown, complete official verification, save the 00:00 schedule, and reach the “已开启自动领取” success state.
- Official integration tested: WorkBuddy Skill detected, token output stripped from bridge responses, Windows Task Scheduler entry created, scheduled task returned exit code 0, and the first real issue returned 7 coupons.
- Page console errors after the interaction: 0.
- Automated checks: 10 passed before local-only packaging cleanup; 6 project checks remain after removal of the unrelated static-hosting template tests.
- Production build: passed.

## Follow-up Polish

- If the official provider supplies a custom time-picker requirement, replace the native control only after preserving its current keyboard and accessibility behavior.

final result: passed
