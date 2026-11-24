# Linkage

> [!IMPORTANT]
> ## This project was written entirely by AI
>
> **Every line of code, every test, every script and every document in this repository was written by AI** (Claude, made by Anthropic), working from prompts. No person wrote or edited the code by hand.
>
> **The idea is human, and that is all.** Linkage was thought up by its author, RoboticsIsEpik, who came up with the idea of an app that manages a robot's triggers and turns clicks on a controller picture into WPILib binding code, and described what it should do. The AI designed and built everything else.
>
> **What this means if you use it:** treat Linkage like any software you did not write and cannot fully vouch for. It has unit tests and a test that drives the real app, but AI-written code can have mistakes that tests miss. Linkage edits your robot code, so commit your project to git before you write with it, read the change it shows you, and test every binding with the robot on blocks.

Linkage is a desktop app that manages every Trigger binding in a WPILib command-based robot project. Open your robot project and it finds every `Trigger` your code creates and every binding it makes, in every file, and checks them together. Then edit RobotContainer's bindings on pictures of your controllers and write them back to `RobotContainer.java`.

It works fully offline, so it works in the pits at competition. It targets the current command-based framework (`edu.wpi.first.wpilibj2.command`) and only uses methods that exist on `Trigger` and `CommandXboxController` / `CommandPS4Controller` / `CommandPS5Controller`.

## Run it

```bash
npm install
npm start
```

Then **File, Open robot project** (Ctrl+O) and pick the folder with your `build.gradle`. Linkage reopens it next time.

To build an installer: `npm run dist` (Windows `.exe`, macOS `.dmg`, Linux `.AppImage` / `.deb` in `dist/`). Releases are built by GitHub: bump `version` in `package.json`, merge to `main`, then run the **Release** workflow from the Actions tab with **Make a draft release** ticked. The builds are unsigned, so Windows shows "Windows protected your PC" (choose *More info*, then *Run anyway*), and macOS needs a right-click and *Open* the first time.

The same page also runs in a browser (`npm run serve`, then http://localhost:8000). There it can read a project folder you pick, but it can't write files.

## What it does

### Your project

- **Every Trigger in every file.** Linkage reads every `.java` file under `src/`. It lists where triggers are created (`new Trigger(...)`, Trigger fields, methods that return a Trigger such as `intake.hasNote()`) and every binding (`onTrue`, `whileTrue` and the rest), each with its file and line.
- **Checks across files.** The same button bound in two files, held commands that need the same subsystem on inputs that can be active at the same time, and two controller objects on one port. Controllers are matched by port, so `driver` in RobotContainer and `pad` in another class are the same controller.
- **Bindings outside RobotContainer** are flagged. The usual WPILib pattern is for a subsystem to expose a `Trigger` (`public Trigger hasNote()`) and for RobotContainer to bind it, so all bindings live in one place.
- **Write back safely.** Linkage replaces `configureBindings()` in `RobotContainer.java` and adds any missing imports, controller fields and the mode enum. It shows every changed line before writing and backs up the old file. It refuses to write if the file changed on disk since the last scan, for example after an edit in VS Code. Statements it can't read, such as `setDefaultCommand(...)` or an `if` block, are kept as written. Comments between statements in `configureBindings()` are dropped, and the preview tells you how many.

### The binding editor

- **Controller pictures.** Each controller is drawn with every input clickable: face buttons, bumpers, triggers, Back/Start, stick clicks, all eight D-pad directions, and the four directions of each stick (the ring around a stick). Bound inputs light up in the controller's alliance colour, and inputs bound in other files of the project have a dashed outline.
- **Bindings.** For the selected input, add as many bindings as you like, each with:
  - a binding type: `onTrue`, `onFalse`, `whileTrue`, `whileFalse`, `toggleOnTrue`, `toggleOnFalse`
  - a command from your command list (name plus the Java that builds it, such as `intake.runIntake()` or `new ScoreAmp(arm, shooter)`)
  - conditions combined with `and` / `or`, each optionally negated, from robot-state conditions or other controller inputs
  - an optional `debounce` time in seconds
  - an optional threshold for analog inputs (`leftTrigger(0.3)`, `axisGreaterThan(...)`)
- **Robot-state conditions** are either a BooleanSupplier (`intake::hasNote`, `() -> arm.atSetpoint()`, generated as `new Trigger(...)`) or a Trigger your subsystem already exposes (`intake.hasNote()`). You can also bind to them directly, for example to rumble when a note is picked up.
- **Modes** (`Intake`, `Scoring`) are generated as an enum field and one `Trigger` per mode, so the same button can do different things in each mode. Bind `Commands.runOnce(() -> mode = Mode.SCORING)` to a button to switch.
- **Code.** A clean `configureBindings()` grouped by controller and mode, with the imports and fields it needs, and a Copy button.
- **Checks** for the bindings being edited: the same input bound twice with overlapping conditions, subsystem conflicts, unused commands and conditions.
- **Cheat sheet.** What every button does, per mode, for the driver and the operator. Print it, save it as a page, or copy it as Markdown.
- **Import and share.** Paste a `RobotContainer.java` without opening a project, and save or load the whole setup as JSON. Every change can be undone and redone.

Output is Java. C++ and Python (RobotPy), flight sticks and button boards are not supported yet.

## Development

```bash
npm test             # unit tests (node --test)
npm run uitest       # Playwright drives the real Electron app on a copy of test/fixtures/robot; screenshots in smoke/
npm start            # run the app
```

```
index.html, styles.css   the page (the same in the app and the browser)
src/core/                pure modules, no DOM: model, codegen, checks, cheat sheet, importer, project scanner, write-back
src/ui/                  controller pictures and the project view
src/app.js               the UI: state, views, events
electron/                main process and preload (the page's only access to the disk)
assets/fonts/            bundled fonts, so nothing loads from the internet
test/                    unit tests and a small robot project used by the tests
```

`AGENTS.md` has the rules for coding agents working on this repo. Third-party notices: `THIRD_PARTY_NOTICES.md`.

## License

MIT. See `LICENSE`.
