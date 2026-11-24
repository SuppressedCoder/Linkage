# Linkage: instructions for coding agents

Linkage is a static web tool (no build step, no dependencies) that maps FRC controller inputs to WPILib command-based bindings and generates `configureBindings()`. All code here is written by AI from prompts; the README says so at the top, and that notice must stay.

## Commands

```
npm test        # unit tests for src/core; must pass before you finish
npm run serve   # static server on :8000 to try the page
```

## Rules

1. **`src/core` is pure.** No DOM. Model, code generation, checks, cheat sheet and importer live there and are tested in `test/`.
2. **Never invent API.** Generated Java may only call `Trigger` methods that exist (`and`, `or`, `negate`, `debounce`, `onTrue`, `onFalse`, `whileTrue`, `whileFalse`, `toggleOnTrue`, `toggleOnFalse`, `new Trigger(BooleanSupplier)`) and the real input methods of `CommandXboxController` / `CommandPS4Controller` / `CommandPS5Controller`. The test "generated code only calls methods that exist" guards this; extend its lists only after checking the WPILib Javadoc.
3. **Inputs are canonical.** Bindings store `south`, `lb`, `povUp`, `lsUp` and so on, never `a()` or `cross()`, so a config survives a controller type change. Method names come from `CONTROLLER_TYPES` in `src/core/model.js`.
4. **Escape everything.** Names, expressions and imported text are data: they go through `esc()` before joining HTML.
5. **Every change goes through `commit()`** in `src/app.js` so undo, redo and autosave keep working.
6. **The importer never drops silently.** Anything it can't read becomes an entry in `problems`.
7. **Round trip.** Importing the generated code must give back the same code (tested).
