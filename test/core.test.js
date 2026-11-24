import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleConfig, blankConfig, normalizeConfig, inputMethod, uid } from '../src/core/model.js';
import { generateJava, context, bindingStatement } from '../src/core/codegen.js';
import { check } from '../src/core/checks.js';
import { cheatSheet, cheatMarkdown, cheatHtml } from '../src/core/cheatsheet.js';
import { importJava, parseChain, mapInput, commandName, statements, stripComments } from '../src/core/importer.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every method the generator may call on a Trigger or a Command*Controller. If a test sees a
// call outside this list, the generator invented an API.
const TRIGGER_METHODS = ['and', 'or', 'negate', 'debounce', 'onTrue', 'onFalse', 'whileTrue', 'whileFalse', 'toggleOnTrue', 'toggleOnFalse'];
const XBOX_METHODS = ['a', 'b', 'x', 'y', 'leftBumper', 'rightBumper', 'leftTrigger', 'rightTrigger', 'back', 'start', 'leftStick', 'rightStick',
  'povUp', 'povUpRight', 'povRight', 'povDownRight', 'povDown', 'povDownLeft', 'povLeft', 'povUpLeft', 'axisGreaterThan', 'axisLessThan'];

const binding = (extra) => ({ id: uid('b'), ctrl: 'driver', input: 'south', type: 'onTrue', cmd: 'k', mode: null, conds: [], debounce: null, threshold: null, ...extra });
const withCmd = (cfg) => {
  cfg.commands.push({ id: 'k', name: 'Thing', expr: 'thing.run()', reqs: ['s'] });
  cfg.commands.push({ id: 'k2', name: 'Other', expr: 'thing.other()', reqs: ['s'] });
  cfg.subsystems.push({ id: 's', name: 'Thing', var: 'thing' });
  return cfg;
};

test('input methods match the real CommandXboxController API', () => {
  assert.equal(inputMethod('xbox', 'south'), 'a()');
  assert.equal(inputMethod('xbox', 'lb'), 'leftBumper()');
  assert.equal(inputMethod('xbox', 'lt', null), 'leftTrigger()');
  assert.equal(inputMethod('xbox', 'lt', 0.5), 'leftTrigger(0.5)');
  assert.equal(inputMethod('xbox', 'povUpLeft'), 'povUpLeft()');
  assert.equal(inputMethod('xbox', 'lsUp', 0.6), 'axisLessThan(XboxController.Axis.kLeftY.value, -0.6)');
  assert.equal(inputMethod('xbox', 'rsRight', null), 'axisGreaterThan(XboxController.Axis.kRightX.value, 0.5)');
  assert.equal(inputMethod('ps5', 'south'), 'cross()');
  assert.equal(inputMethod('ps5', 'lt', 0.5), 'L2()');
  assert.equal(inputMethod('ps4', 'back'), 'share()');
  assert.equal(inputMethod('xbox', 'lt', 1), 'leftTrigger(1.0)');
});

test('generated code only calls methods that exist', () => {
  const java = generateJava(exampleConfig());
  const body = java.slice(java.indexOf('configureBindings'));
  for (const line of body.split('\n')) {
    const m = /^\s*(?:Trigger \w+ = )?(driver|operator|\w+)((?:\.\w+\([^;]*)?)/.exec(line);
    if (!m) continue;
  }
  const calls = [...body.matchAll(/\b(?:driver|operator)\.(\w+)\(/g)].map((m) => m[1]).filter((n) => n !== 'getHID');
  for (const c of calls) assert.ok(XBOX_METHODS.includes(c), `invented controller method ${c}`);
  const chained = [...body.matchAll(/\)\s*\n?\s*\.(\w+)\(/g)].map((m) => m[1]);
  const fromCommands = new Set(['withTimeout', 'getHID', 'setRumble']);
  for (const c of chained) assert.ok(TRIGGER_METHODS.includes(c) || fromCommands.has(c), `invented Trigger method ${c}`);
  assert.match(java, /private void configureBindings\(\) \{/);
  assert.match(java, /\/\/ Driver controller \(port 0\)/);
  assert.match(java, /Trigger hasNote = new Trigger\(intake::hasNote\);/);
  assert.match(java, /driver\.leftTrigger\(0\.5\)\.and\(hasNote\.negate\(\)\)\.whileTrue\(intake\.runIntake\(\)\);/);
  assert.match(java, /private enum Mode \{ INTAKE, SCORING \}/);
});

test('a reused input gets one Trigger variable', () => {
  const java = generateJava(exampleConfig());
  assert.match(java, /Trigger operatorA = operator\.a\(\);/);
  assert.match(java, /operatorA\.and\(intakeMode\)/);
});

test('or, negate and debounce chain in order', () => {
  const cfg = withCmd(blankConfig());
  cfg.conditions.push({ id: 'q', name: 'has note', supplier: 'intake::hasNote' });
  const b = binding({ conds: [{ op: 'or', neg: true, ref: 'cond:q' }, { op: 'and', neg: false, ref: 'in:operator:lb' }], debounce: 0.2, type: 'toggleOnFalse' });
  cfg.bindings.push(b);
  const line = bindingStatement(context(cfg), b);
  assert.equal(line.replace(/\s+/g, ''), 'driver.a().or(hasNote.negate()).and(operator.leftBumper()).debounce(0.2).toggleOnFalse(thing.run());');
});

test('checks find double bindings, subsystem fights and unused commands', () => {
  const cfg = withCmd(blankConfig());
  cfg.commands.push({ id: 'unused', name: 'Unused', expr: 'x.y()', reqs: [] });
  cfg.bindings.push(binding({ type: 'onTrue' }), binding({ type: 'whileTrue', cmd: 'k2' }));
  cfg.bindings.push(binding({ ctrl: 'operator', input: 'rb', type: 'whileTrue' }));
  const w = check(cfg);
  assert.ok(w.some((x) => /bound twice/.test(x.text)));
  assert.ok(w.some((x) => /both require Thing/.test(x.text)));
  assert.ok(w.some((x) => /"Unused" is not bound/.test(x.text)));
});

test('checks accept bindings split by mode, by negated condition, or across the D-pad', () => {
  const cfg = withCmd(blankConfig());
  cfg.modes.list.push({ id: 'm1', name: 'A', const: 'A' }, { id: 'm2', name: 'B', const: 'B' });
  cfg.conditions.push({ id: 'q', name: 'q', supplier: 'x::y' });
  cfg.bindings.push(binding({ mode: 'm1', type: 'whileTrue' }), binding({ mode: 'm2', type: 'whileTrue', cmd: 'k2' }));
  cfg.bindings.push(binding({ input: 'east', conds: [{ op: 'and', neg: false, ref: 'cond:q' }] }), binding({ input: 'east', cmd: 'k2', conds: [{ op: 'and', neg: true, ref: 'cond:q' }] }));
  cfg.bindings.push(binding({ ctrl: 'operator', input: 'povUp', type: 'whileTrue' }), binding({ ctrl: 'operator', input: 'povDown', type: 'whileTrue' }));
  cfg.bindings.push(binding({ ctrl: 'operator', input: 'start', type: 'onTrue' }), binding({ ctrl: 'operator', input: 'start', type: 'onFalse', cmd: 'k2' }));
  const w = check(cfg).filter((x) => x.level !== 'info');
  assert.ok(!w.some((x) => /bound twice/.test(x.text)), JSON.stringify(w));
  assert.ok(!w.some((x) => /D-pad up.*D-pad down/.test(x.text)));
});

test('the example opens with a few real warnings and an unused command', () => {
  const w = check(exampleConfig());
  assert.equal(w.filter((x) => x.level === 'error').length, 0);
  assert.ok(w.some((x) => x.level === 'warn'));
  assert.ok(w.some((x) => /Pass note/.test(x.text)));
});

test('cheat sheet has one column per mode and repeats every-mode bindings', () => {
  const s = cheatSheet(exampleConfig());
  const op = s.find((x) => x.id === 'operator');
  assert.deepEqual(op.modes, ['Intake', 'Scoring']);
  const y = op.rows.find((r) => r.input === 'north');
  assert.equal(y.cells[0][0].action, 'Stow arm');
  assert.equal(y.cells[1][0].action, 'Stow arm');
  const a = op.rows.find((r) => r.input === 'south');
  assert.equal(a.cells[0][0].action, 'Arm to intake');
  assert.equal(a.cells[1][0].action, 'Score amp');
  assert.match(cheatMarkdown(exampleConfig()), /\| LT \| Hold: Run intake \(unless hasNote\) \|/);
  assert.doesNotMatch(cheatHtml({ ...exampleConfig(), commands: [{ id: 'x', name: '<script>', expr: 'a()', reqs: [] }], bindings: [binding({ cmd: 'x' })] }), /<script>/);
});

test('import reads the generated code back to the same code', () => {
  const cfg = exampleConfig();
  const java = generateJava(cfg);
  const r = importJava(java);
  assert.deepEqual(r.problems, []);
  assert.equal(generateJava(r.config), java);
});

test('import reads a typical hand-written RobotContainer and flags the rest', () => {
  const src = `
  public class RobotContainer {
    private final SwerveSubsystem m_drive = new SwerveSubsystem();
    private final Intake m_intake = new Intake();
    private final CommandXboxController m_driverController = new CommandXboxController(OperatorConstants.kDriverControllerPort);
    private final CommandXboxController m_operatorController = new CommandXboxController(1);
    public RobotContainer() { configureBindings(); }
    private void configureBindings() {
      // comment with onTrue( in it
      new Trigger(m_intake::hasNote).onTrue(Commands.print("got it"));
      m_driverController.b().whileTrue(m_intake.runIntake()).onFalse(m_intake.stop());
      m_driverController.axisGreaterThan(XboxController.Axis.kLeftY.value, 0.7).and(m_intake::hasNote).whileTrue(m_drive.creep());
      m_operatorController.pov(90).and(m_driverController.leftBumper().negate()).debounce(0.25).toggleOnTrue(new Spin(m_intake));
      m_drive.setDefaultCommand(m_drive.drive(() -> -m_driverController.getLeftY()));
      m_operatorController.a().negate().onTrue(m_intake.stop());
      someHelper.bind();
    }
  }
  class OperatorConstants { public static final int kDriverControllerPort = 0; }`;
  const r = importJava(src);
  const cfg = r.config;
  assert.equal(cfg.controllers.length, 2);
  assert.equal(cfg.controllers[0].port, 0);
  assert.equal(cfg.controllers[0].name, 'Driver');
  assert.equal(cfg.bindings.length, 5);
  assert.ok(cfg.subsystems.some((s) => s.var === 'm_intake'));
  const axis = cfg.bindings.find((b) => b.input === 'lsDown');
  assert.equal(axis.threshold, 0.7);
  assert.equal(cfg.conditions.length, 1, 'the same supplier is one condition');
  const pov = cfg.bindings.find((b) => b.input === 'povRight');
  assert.equal(pov.debounce, 0.25);
  assert.deepEqual(pov.conds, [{ op: 'and', neg: true, ref: `in:m_driverController:lb` }]);
  const spin = cfg.commands.find((k) => k.expr === 'new Spin(m_intake)');
  assert.equal(spin.name, 'Spin');
  assert.deepEqual(spin.reqs, ['m_intake']);
  assert.equal(r.problems.length, 3);
  assert.ok(r.problems.some((p) => /Default commands/.test(p.text)));
  assert.ok(r.problems.some((p) => /negate\(\) is not supported/.test(p.text)));
});

test('parser helpers', () => {
  assert.deepEqual(parseChain('driver.a().onTrue(x(1, (2)))').calls.map((c) => c.name), ['a', 'onTrue']);
  assert.equal(parseChain('driver.a() + 1'), null);
  assert.deepEqual(mapInput('xbox', { name: 'rightTrigger', args: '0.2' }), { input: 'rt', threshold: 0.2 });
  assert.deepEqual(mapInput('xbox', { name: 'axisLessThan', args: '1, -0.4' }), { input: 'lsUp', threshold: 0.4 });
  assert.equal(mapInput('xbox', { name: 'rumble', args: '' }), null);
  assert.equal(commandName('intake.runIntake()'), 'Run intake');
  assert.equal(commandName('new ScoreAmp(arm, shooter)'), 'Score amp');
  assert.equal(commandName('Commands.runOnce(drivetrain::zeroHeading)'), 'Zero heading');
});

test('normalizeConfig survives junk and keeps good data', () => {
  assert.deepEqual(normalizeConfig(null), blankConfig());
  assert.deepEqual(normalizeConfig('x').controllers, blankConfig().controllers);
  const ex = exampleConfig();
  assert.deepEqual(normalizeConfig(JSON.parse(JSON.stringify(ex))), ex);
  const bad = normalizeConfig({ bindings: [{ type: 'onBanana', conds: 'no', debounce: 'x' }] });
  assert.equal(bad.bindings[0].type, 'onTrue');
  assert.deepEqual(bad.bindings[0].conds, []);
  assert.equal(bad.bindings[0].debounce, null);
});

// ---------- pasted RobotContainer ----------

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/RobotContainer.java'), 'utf8').replace(/\r\n/g, '\n');

test('import keeps statements it cannot read, and the copied code keeps them', () => {
  const r = importJava(fixture);
  assert.equal(r.config.keep.length, 2);
  assert.match(r.config.keep[0], /setDefaultCommand/);
  assert.match(r.config.keep[1], /^if \(Robot\.isSimulation\(\)\) \{/);
  const java = generateJava(r.config);
  assert.match(java, /Trigger hasNote = intake\.hasNote\(\);/);
  assert.match(java, /drivetrain\.setDefaultCommand/);
  assert.match(java, /\n {2}if \(Robot\.isSimulation\(\)\) \{\n {4}operator\.back\(\)/);
  // pasting the copied code back gives the same code
  assert.equal(generateJava(importJava(java).config), java);
});

test('statements keep offsets so lines are right', () => {
  const src = 'a();\n// b();\nc(() -> { d(); });\nif (x) {\n  e();\n}\nf();';
  const s = stripComments(src);
  assert.equal(s.length, src.length);
  assert.deepEqual(statements(s).map((x) => x.text), ['a()', 'c(() -> { d(); })', 'if (x) {\n  e();\n}', 'f()']);
  assert.deepEqual(statements(s, 0, s.length, true).map((x) => x.text), ['a()', 'c(() -> { d(); })', 'if (x)', 'e()', 'f()']);
});

test('Trigger-valued conditions round trip as Trigger variables', () => {
  const java = generateJava(exampleConfig());
  assert.match(java, /Trigger shooterReady = shooter\.atSpeed\(\);/);
  assert.equal(generateJava(importJava(java).config), java);
});
