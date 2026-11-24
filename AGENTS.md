# Linkage: instructions for coding agents

Linkage is an Electron desktop app (plain JavaScript modules, no bundler) for the controller bindings of a WPILib command-based robot, used alongside your editor while you write the code. It is one screen: a controller picture on the left; the selected input's bindings and the conflicts on the right. Other triggers (robot state) are used as conditions or bound directly. Code, cheat sheet, save & import and setup open as panels. You paste `RobotContainer.java` in and copy `configureBindings()` out; Linkage never reads or writes the robot project itself. The same page also runs in a browser. All code here is written by AI from prompts; the README says so at the top, and that notice must stay.

## Commands

```
npm test        # unit tests for src/core; must pass before you finish
npm run uitest  # Playwright drives the real app (needs a display; in CI it runs under xvfb); add a check when you add UI behavior and look at smoke/ui-*.png
npm start       # run the app
npm run dist    # installers in dist/
```

## Rules

1. **`src/core` is pure.** No DOM, no Node. Model, code generation, checks, cheat sheet and importer live there and are tested in `test/`.
2. **Never invent API.** Generated Java may only call `Trigger` methods that exist (`and`, `or`, `negate`, `debounce`, `onTrue`, `onFalse`, `whileTrue`, `whileFalse`, `toggleOnTrue`, `toggleOnFalse`, `new Trigger(BooleanSupplier)`) and the real input methods of `CommandXboxController` / `CommandPS4Controller` / `CommandPS5Controller`. The test "generated code only calls methods that exist" guards this. Extend its lists only after checking the WPILib Javadoc.
3. **Inputs are canonical.** Bindings store `south`, `lb`, `povUp`, `lsUp` and so on, never `a()` or `cross()`, so a config survives a controller type change. Method names come from `CONTROLLER_TYPES` in `src/core/model.js`.
4. **Escape everything.** Names, expressions, file paths and pasted text are data: they go through `esc()` before joining HTML.
5. **Every change to the configuration goes through `commit()`** in `src/app.js`, so undo, redo, autosave and the "not written yet" state keep working.
6. **The importer never drops silently.** Anything it can't read becomes an entry in `problems`, and a statement inside `configureBindings()` it can't read goes into `config.keep` and is put back, as it was, in the code you copy.
7. **Round trip.** Importing the generated code must give back the same code (tested).
8. **Paste in, copy out.** Linkage does not open, scan or write the robot project. The page reaches the disk only through `electron/preload.cjs`, and only to save a file the user names in a Save dialog (the JSON setup or the printable cheat sheet). Don't add file reading or writing for the project back without the author asking.
9. **Offline.** Nothing loads from the internet: fonts are in `assets/fonts/`, the CSP in `electron/main.js` allows only the app's own files. Keep it that way.
10. **Line offsets matter.** `stripComments` blanks comments with spaces so offsets and line numbers stay valid; keep that property when you change it.
11. **One screen.** No tabs. New features go on the main screen only if they are about the selected input; everything else is a panel opened from the header.
12. **Keep the drawing-sheet style.** The look is an engineering drawing: paper and navy ink (a blueprint in dark mode), square corners, 1px rules, uppercase IBM Plex Sans Condensed for titles and labels, IBM Plex Mono for code and small labels, alliance blue and red for the two controllers, yellow only for selection and focus. The header comment in `styles.css` is the brief; use its tokens rather than new colours, radii or fonts.
