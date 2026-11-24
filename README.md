# Linkage

> [!IMPORTANT]
> ## This project was written entirely by AI
>
> **Every line of code, every test, every script and every document in this repository was written by AI** (Claude, made by Anthropic), working from prompts. No person wrote or edited the code by hand.
>
> **The idea is human, and that is all.** Linkage was thought up by its author, RoboticsIsEpik, who came up with the idea of an app that manages a robot's triggers and turns clicks on a controller picture into WPILib binding code, and described what it should do. The AI designed and built everything else.
>
> **What this means if you use it:** treat Linkage like any software you did not write and cannot fully vouch for. It has unit tests and a test that drives the real app, but AI-written code can have mistakes that tests miss. Linkage writes code for your robot, so read the code before you paste it into your project, commit to git first, and test every binding with the robot on blocks.

Linkage is a desktop app for your robot's controller bindings, used next to your editor while you write the code. Click a button on a picture of the driver's or operator's controller, pick the command it runs and any conditions, and copy the `configureBindings()` it writes into `RobotContainer.java`. Conflicts show up as you go, and it prints a cheat sheet for the drive team.

It works fully offline, so it works in the pits at competition. It targets the current command-based framework (`edu.wpi.first.wpilibj2.command`) and only uses methods that exist on `Trigger` and `CommandXboxController` / `CommandPS4Controller` / `CommandPS5Controller`.

## Run it

```bash
npm install
npm start
```

To start from your robot's code, open **Save & import** and paste your `RobotContainer.java` (Ctrl+O in the desktop app). Linkage never opens or changes files in your robot project: you copy the code out and paste it in yourself.

To build an installer: `npm run dist` (Windows `.exe`, macOS `.dmg`, Linux `.AppImage` / `.deb` in `dist/`). Releases are built by GitHub: bump `version` in `package.json`, merge to `main`, then run the **Release** workflow from the Actions tab with **Make a draft release** ticked. The builds are unsigned, so Windows shows "Windows protected your PC" (choose *More info*, then *Run anyway*), and macOS needs a right-click and *Open* the first time.

The same page also runs in a browser (`npm run serve`, then http://localhost:8000).

## What it does

### One screen

The controller picture is on the left and the bindings for the input you click are on the right, with the conflicts under them. Switch between the driver and operator controllers above the picture. **Code**, **Cheat sheet**, **Save & import** and **Setup** (commands, other triggers, modes, subsystems, controllers) open as panels from the header.

- **Controller pictures.** Each controller is drawn with every input clickable: face buttons, bumpers, triggers, Back/Start, stick clicks, all eight D-pad directions, and the four directions of each stick (the ring around a stick). Bound inputs light up in the controller's alliance colour.
- **Bindings.** For the selected input, add as many bindings as you like, each with:
  - a binding type: `onTrue`, `onFalse`, `whileTrue`, `whileFalse`, `toggleOnTrue`, `toggleOnFalse`
  - a command from your command list (name plus the Java that builds it, such as `intake.runIntake()` or `new ScoreAmp(arm, shooter)`)
  - conditions combined with `and` / `or`, each optionally negated, from robot-state conditions or other controller inputs
  - an optional `debounce` time in seconds
  - an optional threshold for analog inputs (`leftTrigger(0.3)`, `axisGreaterThan(...)`)
- **Other triggers** (robot state) are either a BooleanSupplier (`intake::hasNote`, `() -> arm.atSetpoint()`, generated as `new Trigger(...)`) or a Trigger your subsystem already exposes (`intake.hasNote()`). You can also bind to them directly, for example to rumble when a note is picked up.
- **Modes** (`Intake`, `Scoring`) are generated as an enum field and one `Trigger` per mode, so the same button can do different things in each mode. Bind `Commands.runOnce(() -> mode = Mode.SCORING)` to a button to switch.
- **Code.** A clean `configureBindings()` grouped by controller and mode, with the imports and fields it needs, and a Copy button.
- **Conflicts**, listed next to the editor and under each binding they affect: the same input bound twice with overlapping conditions, subsystem conflicts, unused commands and conditions.
- **Cheat sheet.** What every button does, per mode, for the driver and the operator. Print it, save it as a page, or copy it as Markdown.
- **Import and share.** Paste a `RobotContainer.java` and Linkage reads its controllers, conditions, modes and bindings. Statements it can't read, such as `setDefaultCommand(...)` or an `if` block, are kept and come back out, as they were, in the code you copy. Save or load the whole setup as JSON. Every change can be undone and redone.

Output is Java. C++ and Python (RobotPy), flight sticks and button boards are not supported yet.

## Development

```bash
npm test             # unit tests (node --test)
npm run uitest       # Playwright drives the real Electron app; screenshots in smoke/
npm start            # run the app
```

```
index.html, styles.css   the page (the same in the app and the browser)
src/core/                pure modules, no DOM: model, codegen, checks, cheat sheet, importer
src/ui/                  controller pictures
src/app.js               the UI: state, views, events
electron/                main process and preload (Save dialogs and printing)
assets/fonts/            bundled fonts, so nothing loads from the internet
test/                    unit tests and a sample RobotContainer.java
```

`AGENTS.md` has the rules for coding agents working on this repo. Third-party notices: `THIRD_PARTY_NOTICES.md`.

## License

MIT. See `LICENSE`.
