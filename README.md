# EduQueSCT

EduQueSCT is a browser-based educational adventure game built as a static HTML site. Players move through a themed learning journey with accounts, character selection, subject and topic maps, and three sequential gameplay modes per topic:

1. Platformer
2. Top-down maze
3. Flappy Bird-style auto-scroller

The game mixes quiz questions with platforming and currently uses an offline question bank. Live Gemini question generation is disabled.

## What It Includes

- Landing page with parallax visuals and section carousels
- Login and registration flow
- Google Sign-In support
- Guest play option
- Character selection
- Grade selection for difficulty
- Subject and topic selection
- Level select screen for jumping into Level 1, 2, or 3
- Three-stage gameplay loop with automatic score submission
- Leaderboard / ranks page
- English and Tagalog UI support through `strings.js`
- Mobile-friendly controls and responsive layouts

## How To Run

This project has no build step and no `package.json`. Open it as a static site.

Recommended local run:

```bash
python -m http.server 8000
```

Then open the site in your browser and start from `landing.html`.

If you prefer, you can also open the HTML files directly, but a local server is usually smoother for browser behavior and resource loading.

## Main Pages

- `landing.html` - entry landing page
- `login.html` - sign in, register, Google Sign-In, guest play
- `index.html` - main menu
- `character page.html` - character selection
- `grade-select.html` - grade picker
- `level map.html` - subject and topic selection
- `level-select.html` - choose Level 1, 2, or 3 for a topic
- `start.html` - core gameplay and quiz logic
- `rank.html` - leaderboard view
- `strings.js` - shared language strings and UI text
- `apps-script-backend.gs` - reference copy of the external Google Apps Script backend

## Gameplay Flow

`landing.html` -> `login.html` -> `index.html` -> `character page.html` -> `grade-select.html` -> `level map.html` -> `level-select.html` -> `start.html`

From there, each topic runs through three levels in order:

- Level 1: platformer
- Level 2: maze
- Level 3: Flappy-style stage

Scores are posted automatically at the end of a topic run, and the leaderboard page reads those results back.

## Project Notes

- This is a flat static repo. Most CSS and JavaScript live inline inside each HTML file.
- The leaderboard and account flow rely on a separately deployed Google Apps Script backend. The `.gs` file in this repo is a reference copy, not an automatically deployed service.
- Several filenames include spaces, such as `character page.html` and `level map.html`, so keep that in mind when linking to them.
- The current question system uses the offline bank only.
- `strings.js` is the shared language layer used across the pages for English and Tagalog text.

## Repository Layout

The root folder contains the HTML pages, image assets, and shared scripts used by the game. Most assets are sprite sheets, background images, or UI art for the different screens and gameplay modes.

## Editing Tips

- Keep new UI behavior self-contained in the page you are editing.
- Follow the existing inline-style pattern unless there is a strong reason not to.
- Update `strings.js` if you add or rename any visible text that should be translated.
- Preserve the current file names, especially the ones with spaces, because other pages link to them directly.
