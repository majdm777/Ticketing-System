<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Mobile-first UI (primary target is phones)

This web app is used primarily on mobile. Treat mobile as the primary platform, not a secondary breakpoint. Apply this to all UI work.

## Layout & responsiveness

- Design mobile-first: build the small-screen layout first (~375–430px), then add `min-width` media queries (Tailwind `sm:`/`md:`/`lg:`) to scale up. Never desktop-first.
- Single-column by default; avoid multi-column grids until wider breakpoints.
- No fixed-width elements that cause horizontal scroll — use relative units (`%`, `rem`, `vw`).
- No large persistent sidebars — collapse into a drawer/hamburger menu below a breakpoint.

## Touch & interaction

- Minimum touch target 44×44px, with adequate spacing between tappable elements.
- No hover-dependent functionality (menus, tooltips on hover) — provide tap/click-triggered alternatives.
- Use native mobile input types (`type="tel"`, `type="email"`, `type="number"`) and the React TSX property names `inputMode="numeric"` and `autoComplete` so the right virtual keyboard appears.
- Swipe gestures only as an enhancement, never as the only way to do something.

## Navigation

- Prefer a bottom navigation bar or hamburger/drawer over a top horizontal nav on small screens.
- Keep primary actions in thumb-reach zones (bottom half of the screen).

## Typography & spacing

- Minimum 16px input font size (prevents iOS Safari auto-zoom on focus). Prefer 16px body copy; keep line-height and padding comfortable on small screens.

## Forms

- Break long forms into steps; keep validation errors visible without scrolling.
- Mark progress in multi-step flows; auto-advance where natural.

## Performance

- Mobile users are often on cellular: lazy-load images, avoid render-blocking resources, keep JS bundles lean.
- Test against 3G/4G throttling, not just wifi.

## Testing

- Test with device emulation (Chrome DevTools device toolbar or a real device), in both portrait and landscape.
- Respect `env(safe-area-inset-*)` if the screen is full-bleed/PWA-style.
