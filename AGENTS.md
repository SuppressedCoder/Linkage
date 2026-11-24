# Linkage: instructions for coding agents

Linkage is an Electron desktop app (plain JavaScript modules, no bundler) that manages every Trigger binding in a WPILib command-based robot project: it scans the project, checks bindings across files, edits RobotContainer's bindings on controller pictures and writes `configureBindings()` back. The same page also runs in a browser, read-only. All code here is written by AI from prompts; the README says so at the top, and that notice must stay.

## Commands

```
npm test        # unit tests for src/core; must pass before you finish
npm run uitest  # Playwright drives the real app (needs a display; in CI it runs under xvfb); add a check when you add UI behavior and look at smoke/ui-*.png
npm start       # run the app
npm run dist    # installers in dist/
```

## Rules

1. **`src/core` is pure.** No DOM, no Node. Model, code generation, checks, cheat sheet, importer, scanner and write-back live there and are tested in `test/`. The scanner takes `[{ path, text }]`; reading the disk is the main process's job.
2. **Never invent API.** Generated Java may only call `Trigger` methods that exist (`and`, `or`, `negate`, `debounce`, `onTrue`, `onFalse`, `whileTrue`, `whileFalse`, `toggleOnTrue`, `toggleOnFalse`, `new Trigger(BooleanSupplier)`) and the real input methods of `CommandXboxController` / `CommandPS4Controller` / `CommandPS5Controller`. The test "generated code only calls methods that exist" guards this. Extend its lists only after checking the WPILib Javadoc.
3. **Inputs are canonical.** Bindings store `south`, `lb`, `povUp`, `lsUp` and so on, never `a()` or `cross()`, so a config survives a controller type change. Method names come from `CONTROLLER_TYPES` in `src/core/model.js`.
4. **Escape everything.** Names, expressions, file paths and scanned text are data: they go through `esc()` before joining HTML.
5. **Every change to the configuration goes through `commit()`** in `src/app.js`, so undo, redo, autosave and the "not written yet" state keep working.
6. **The importer never drops silently.** Anything it can't read becomes an entry in `problems`, and a statement inside `configureBindings()` it can't read goes into `config.keep` and is written back as it was.
7. **Round trip.** Importing the generated code must give back the same code, and writing a file twice must change nothing the second time (both tested).
8. **Writing files is narrow on purpose.** The page reaches the disk only through `electron/preload.cjs`. `project:write` writes only a `.java` file from the last scan, inside the project, only if the file still holds what was scanned, and backs up the old text to the app's data folder first. Don't widen it. Every write is shown as a diff first.
9. **Offline.** Nothing loads from the internet: fonts are in `assets/fonts/`, the CSP in `electron/main.js` allows only the app's own files. Keep it that way.
10. **Line offsets matter.** `stripComments` blanks comments with spaces so offsets and line numbers stay valid; keep that property when you change it.
11. **Keep the drawing-sheet style.** The look is an engineering drawing: paper and navy ink (a blueprint in dark mode), square corners, 1px rules, uppercase IBM Plex Sans Condensed for titles and labels, IBM Plex Mono for code and small labels, alliance blue and red for the two controllers, yellow only for selection and focus. The header comment in `styles.css` is the brief; use its tokens rather than new colours, radii or fonts.
