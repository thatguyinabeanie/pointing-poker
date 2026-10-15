# 07 Branding

Scope: visual identity for the pointing poker client (React 19 + MUI 9.5). The theme lives in `client/src/theme.ts`.

## Sources and how values were resolved

- Colors and font weights: the house style, a small fixed palette (navy, amber, night) with Lato as the typeface.
- Component conventions (sizes, button padding, input density) are chosen for a compact, dense tool UI on laptop screens.
- Derived values (success, warning, error, info) are not part of the house palette. They are the closest text-safe shades, checked against the contrast table below.
- The AppBar shows the app name "Pointing Poker" in text. There is no logo asset and no company wordmark.

## Palette

| Name | Hex | Role | Notes |
|---|---|---|---|
| Navy | #215470 | primary: buttons, AppBar, focus ring, headings | House style primary |
| Night | #0A2138 | text.primary, dark fills | House style |
| Night Gray | #4B5563 | text.secondary, body copy | House style |
| Amber | #F1A137 | secondary (decorative only, text only on Night) | House style |
| Teal | #0097A7 | not in theme. Accent labels on Night or at large sizes only | House style |
| White | #FFFFFF | background, paper, text on Navy and filled chips | House style |
| Cool Gray 200 | #E5E7EB | divider, outlined Paper border | House style |
| Success | #32522E | success.main (Connected chip, check icon) | Text-safe shade (rgb 50,82,46) |
| Success light | #64A45C | success.light (non-text only) | Derived |
| Warning | #B14A1B | warning.main (Reconnecting chip, warning alerts) | Dark orange. Pale yellow warning tones fail as text. |
| Error | #C84944 | error.main (error alerts, filled Snackbar) | Derived |
| Info | #215470 | info.main (unused; set to Navy so MUI's default blue never appears) | Derived |

Derived values (success shades, warning, error, info) are not in the house palette.

## Typography

Lato weights loaded on the web: 300, 400, 700. Lato Black (900) and Heavy (800) are not loaded by the app. Headings that would call for Black use 700 here.

| Variant | Weight | Size | Color | Notes |
|---|---|---|---|---|
| h1 | Light 300 | 32px | Night | Title style |
| h2 | Regular 400 | 24px | Night | |
| h3 | Bold 700 | 20px | Night | |
| h4 | Bold 700 | 18px | Night | |
| h5 | Bold 700 | 16px | Night | |
| h6 | Bold 700 | 16px | Night | AppBar title |
| subtitle1 | Regular 400 | 16px | Night Gray | |
| subtitle2 | Bold 700 | 14px | Night | |
| body1 | Regular 400 | 16px, line height 1.5 | Night Gray | 16px for comfortable reading. |
| body2 | Regular 400 | 14px, line height 1.43 | Night Gray | |
| caption | Regular 400 | 12px | Night Gray | Queue "N tickets" line |
| button | MUI default 500 | 14px | per variant | Renders as Regular 400 with the loaded faces. |
| overline | Bold 700 | 11px | Navy or Night Gray | Only uppercase style. Letter spacing 0.2em, matching the house label spacing. |

Letter spacing is 0 everywhere except overline. Text transform: none on buttons. MUI's `capitalize` would turn "Save to Jira" into "Save To Jira", so this theme avoids it. Uppercase appears only on overline.

## Component conventions

- **AppBar**: solid Navy, white text, `elevation: 0`, the app name "Pointing Poker" as the title on the left, with no logo or wordmark.
- **Buttons**: contained primary = Navy fill, white text. Outlined = Navy border and text. Radius stays MUI default (4px). `sizeMedium` padding is `7.75px 16px`, so a medium button matches a small TextField height. Sentence case.
- **Chips**: size small by default (compact density), MUI pill radius, sentence case. Connected = success filled. Reconnecting = warning filled.
- **Inputs**: `TextField` defaults to `size="small"`. Selects use `FormControl size="small"` explicitly, per the client spec.
- **Paper and Card**: Paper keeps MUI default elevation 1. Outlined variant uses Cool Gray 200 border. App cards use `variant="outlined"`, so they stay flat.
- **Focus ring**: 2px solid Navy, 2px offset, applied to `*:focus-visible` through CssBaseline. Navy on white is 8.18:1, which clears the 3:1 non-text requirement.

## Title and logo

The AppBar shows the text "Pointing Poker" (h6, white on Navy). There is no logo image, no wordmark box, and no logo asset to copy into `client/public/`.

## Dark mode

The house style defines only a light palette, so the app stays light-only. The mock's dark tokens (`prefers-color-scheme: dark` block in `spec/mocks/pointing-poker.html`) are dropped, and `theme.ts` has no dark palette. Optionally add `<meta name="color-scheme" content="light">` to `index.html`.

## Accessibility

Contrast ratios (WCAG 2.x, computed from the hex values above):

| Pair | Ratio | Use |
|---|---|---|
| Night on White | 16.31 | body and headings |
| Navy on White | 8.18 | links, primary buttons, focus ring |
| Night Gray on White | 7.56 | secondary text |
| White on Navy | 8.18 | AppBar, contained buttons |
| White on Success (#32522E) | 8.82 | Connected chip |
| White on Warning (#B14A1B) | 5.43 | Reconnecting chip |
| White on Error (#C84944) | 4.67 | error alerts and filled Snackbar |
| Success light on White | 3.00 | icons only |
| Teal on White | 3.51 | large text (18.66px bold or 24px) and non-text only |
| Teal on Night | 4.65 | teal labels on dark only |
| Cool Gray 400 (#9CA3AF) on White | 2.54 | fails. Do not use for text. The house palette lists it for "subtle text." |
| Amber on White | 2.12 | fails for text and non-text |
| Night on Amber | 7.68 | text on yellow fills |

Yellow rules:
- Allowed for text: Night text on an Amber fill, or Amber text on Night (7.68:1).
- Allowed as decoration: Amber bars or icons on Night backgrounds.
- Never as text on white or a light background, and never as the only signal of a state.

Other rules: state is never color-only. Vote status uses an icon plus `aria-label`. Chip labels carry the words "Connected" and "Reconnecting".

## Apply to this app

| UI element | Component and state | Palette role | Values |
|---|---|---|---|
| AppBar | `AppBar` (primary) | primary | Navy bg, white title |
| Connected chip | `Chip color="success"` | success | #32522E fill, white text |
| Reconnecting chip | `Chip color="warning"` | warning | #B14A1B fill, white text |
| Ticket card | `Card variant="outlined"` | background, divider | White bg, #E5E7EB border, Night title, Night Gray meta |
| Ticket key link | `Link` | primary | Navy |
| Reveal button | `Button variant="contained"` | primary | Navy fill, white text |
| Save to Jira button | `Button variant="contained"` | primary | Navy fill, white text. Spinner is white. |
| Start round / Reset / Next ticket | `Button variant="outlined"` | primary | Navy border and text |
| Vote cards (Deck) | selected contained, others outlined | primary | Selected Navy fill, others Navy border |
| Vote status icon | `CheckCircle` / `HourglassEmpty` | success / text.secondary | #32522E check, Night Gray hourglass |
| Success alert ("Saved") | `Alert severity="success"` | success | Standard MUI alert with success palette |
| Inline error alerts | `Alert severity="error"` | error | Standard MUI alert |
| Queue warning alert | `Alert severity="warning"` | warning | Standard MUI alert |
| Error Snackbar | `Alert variant="filled" severity="error"` | error | #C84944 fill, white text |
| Amber, teal | not used in app UI | secondary, accent | No text on white |

## Open items

1. Headings in Lato Black cannot be reproduced without loading weight 900.
2. Lato must be loaded in the app's `index.html` (Google Fonts, weights 300, 400, 700).
3. The client spec (`03-client.md`) says "stock MUI 9 theme with only the font family changed." This theme changes the palette too, as requested. Confirm before merging.
