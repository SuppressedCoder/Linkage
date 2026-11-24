# Linkage

> [!IMPORTANT]
> ## This project was written entirely by AI
>
> **Every line of code, every test, every script and every document in this repository was written by AI** (Claude, made by Anthropic), working from prompts. No person wrote or edited the code by hand.
>
> **The idea is human, and that is all.** Linkage was thought up by its author, RoboticsIsEpik, who came up with the idea of a tool that turns clicks on a controller picture into WPILib binding code, and described what it should do. The AI designed and built everything else.
>
> **What this means if you use it:** treat Linkage like any software you did not write and cannot fully vouch for. It has unit tests for the code generator, the checks and the importer, but AI-written code can have mistakes that tests miss. Read the generated `configureBindings()` before you deploy it to a robot, and test every binding on the cart with the robot on blocks.

Linkage maps controller inputs to WPILib commands and writes the binding code for you. Click a button on a picture of your driver's or operator's controller, pick what it does, and copy a paste-ready `configureBindings()` for your `RobotContainer`.

It targets the current command-based framework (`edu.wpi.first.wpilibj2.command`) and only uses methods that exist on `Trigger` and `CommandXboxController` / `CommandPS4Controller` / `CommandPS5Controller`.

## Use it

Linkage is a static web page with no build step and no server code. Open it with any static file server:

```bash
npm run serve        # python3 -m http.server 8000, then open http://localhost:8000
```

(Opening `index.html` straight from disk does not work: browsers block JavaScript modules on `file://`.) It can also be hosted as-is on GitHub Pages.

It opens with an example robot (a 2024-style note game: drivetrain, intake, shooter, arm, climber) so you can see everything working. Edit it, or clear it under **Save & import**.

## What it does

- **Controller pictures.** Each controller is drawn with every input clickable: face buttons, bumpers, triggers, Back/Start, stick clicks, all eight D-pad directions, and the four directions of each stick (the ring around a stick). Bound inputs light up in the controller's alliance colour; the list under each picture says what every button does.
- **Bindings.** For the selected input, add as many bindings as you like, each with:
  - a binding type: `onTrue`, `onFalse`, `whileTrue`, `whileFalse`, `toggleOnTrue`, `toggleOnFalse`
  - a command from your command list (name plus the Java that builds it, such as `intake.runIntake()` or `new ScoreAmp(arm, shooter)`)
  - conditions combined with `and` / `or`, each optionally negated, from robot-state conditions or other controller inputs
  - an optional `debounce` time in seconds
  - an optional threshold for analog inputs (`leftTrigger(0.3)`, `axisGreaterThan(...)`)
- **Robot-state conditions** (`hasNote` → `intake::hasNote`, `armAtSetpoint` → `() -> arm.atSetpoint()`) become `Trigger` variables, and can also be bound to directly (rumble when a note is picked up).
- **Modes** (`Intake`, `Scoring`) are generated as an enum field and one `Trigger` per mode, so the same button can do different things in each mode. Bind `Commands.runOnce(() -> mode = Mode.SCORING)` to a button to switch.
- **Code.** A clean `configureBindings()` grouped by controller and mode, with the imports and fields it needs, and a Copy button. An input used by more than one binding gets its own `Trigger` variable (`operatorA`).
- **Checks.** Warns when the same input is bound twice with overlapping conditions, when held commands that require the same subsystem are bound to inputs that can be active at the same time, and about unused commands or conditions and anything broken. Bindings in different modes or with opposite conditions never overlap, and two D-pad directions can't be held at once.
- **Cheat sheet.** What every button does, per mode, for the driver and the operator. Print it, save it as a printable page, or copy it as Markdown.
- **Import.** Paste an existing `RobotContainer.java`: Linkage reads the controller fields, `new Trigger(...)` conditions, mode triggers and the binding chains in `configureBindings()`, and lists every statement it left out and why.
- **Save and share.** The whole configuration as JSON (copy, save, open, paste), plus undo and redo for every change. Work is kept in the browser between visits.

Output is Java. C++ and Python (RobotPy) output, and flight sticks or button boards, are not supported yet.

## Development

```bash
npm test             # unit tests (node --test), no install needed
```

```
index.html, styles.css   the page
src/core/                pure modules, no DOM: model, codegen, checks, cheat sheet, importer
src/ui/pad.js            the controller pictures (SVG)
src/app.js               the UI: state, views, events
test/                    unit tests for src/core
```

`AGENTS.md` has the rules for coding agents working on this repo.

## License

MIT. See `LICENSE`.
