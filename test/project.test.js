import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject, bindingRows } from '../src/core/scanner.js';
import { importJava, statements, stripComments } from '../src/core/importer.js';
import { applyToContainer, lineDiff, diffHunks } from '../src/core/writeback.js';
import { exampleConfig, uid } from '../src/core/model.js';
import { generateJava } from '../src/core/codegen.js';

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/robot');
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const files = walk(root).map((p) => ({ path: relative(root, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }));
const containerText = files.find((f) => f.path.endsWith('RobotContainer.java')).text;

test('scan finds triggers and bindings in every file, with lines', () => {
  const s = scanProject(files);
  assert.equal(s.container, 'src/main/java/frc/robot/RobotContainer.java');
  const intake = s.files.find((f) => f.path.endsWith('Intake.java'));
  assert.equal(intake.role, 'subsystem');
  assert.deepEqual(intake.triggers.map((t) => [t.kind, t.name, t.line]), [['field', 'jammed', 8], ['method', 'hasNote()', 15]]);
  assert.equal(intake.bindings.length, 1);
  const rows = bindingRows(s);
  assert.equal(rows.length, 7);
  const jam = rows.find((r) => r.input === 'jammed');
  assert.equal(jam.line, 12);
  assert.equal(jam.command, 'runOnce(this::stop)');
  const ctrl = s.files.find((f) => f.path.endsWith('DriverControls.java'));
  assert.equal(ctrl.bindings.length, 2);
});

test('scan merges controllers by port and finds conflicts across files', () => {
  const s = scanProject(files);
  assert.deepEqual(s.config.controllers.map((c) => [c.port, c.var]), [[0, 'driver'], [1, 'operator']]);
  const twice = s.findings.find((f) => /bound twice/.test(f.text));
  assert.ok(twice, 'driver LT in RobotContainer and pad LT in DriverControls are the same input');
  assert.deepEqual(twice.refs.map((r) => r.path.split('/').pop()).sort(), ['DriverControls.java', 'RobotContainer.java']);
  assert.ok(s.findings.some((f) => /Intake\.java binds 1 trigger itself/.test(f.text)));
  assert.ok(s.findings.some((f) => /Port 0 has 2 controller objects/.test(f.text)));
  // a command made with the subsystem's own factory requires that subsystem
  assert.ok(s.findings.some((f) => /jammed \("Stop"\)/.test(f.text) && /require Intake/.test(f.text)));
});

test('import keeps statements it cannot read, and writing back keeps them', () => {
  const r = importJava(containerText);
  assert.equal(r.config.keep.length, 2);
  assert.match(r.config.keep[0], /setDefaultCommand/);
  assert.match(r.config.keep[1], /^if \(Robot\.isSimulation\(\)\) \{/);
  const w = applyToContainer(containerText, r.config);
  assert.match(w.text, /Trigger hasNote = intake\.hasNote\(\);/);
  assert.match(w.text, /drivetrain\.setDefaultCommand/);
  assert.match(w.text, /\n {8}if \(Robot\.isSimulation\(\)\) \{\n {12}operator\.back\(\)/);
  assert.match(w.text, /public Command getAutonomousCommand\(\)/);
  assert.match(w.text, /import edu\.wpi\.first\.wpilibj2\.command\.button\.Trigger;/);
  assert.ok(w.notes.some((n) => /1 comment/.test(n)));
  // applying again changes nothing
  assert.equal(applyToContainer(w.text, importJava(w.text).config).text, w.text);
});

test('write-back adds missing fields, modes and imports to a bare container', () => {
  const bare = 'package frc.robot;\n\nimport edu.wpi.first.wpilibj2.command.Command;\n\npublic class RobotContainer {\n    public RobotContainer() {\n        configureBindings();\n    }\n\n    private void configureBindings() {}\n}\n';
  const w = applyToContainer(bare, exampleConfig());
  assert.match(w.text, /\n {4}private final CommandXboxController driver = new CommandXboxController\(0\);/);
  assert.match(w.text, /private enum Mode \{ INTAKE, SCORING \}/);
  assert.match(w.text, /import edu\.wpi\.first\.wpilibj2\.command\.Commands;/);
  assert.match(w.text, /\n {8}operator\.b\(\)\n {16}\.and\(scoringMode\)/);
  const again = importJava(w.text);
  assert.equal(again.config.bindings.length, exampleConfig().bindings.length);
});

test('write-back changes a controller port and type in place', () => {
  const src = 'public class RobotContainer {\n  private final CommandXboxController driver = new CommandXboxController(3);\n  private void configureBindings() {\n    driver.a().onTrue(x.y());\n  }\n}\n';
  const cfg = importJava(src).config;
  cfg.controllers[0].port = 0;
  cfg.controllers[0].type = 'ps5';
  const w = applyToContainer(src, cfg);
  assert.match(w.text, /private final CommandPS5Controller driver = new CommandPS5Controller\(0\);/);
  assert.match(w.text, /driver\.cross\(\)\.onTrue\(x\.y\(\)\);/);
});

test('statements keep offsets so lines are right', () => {
  const src = 'a();\n// b();\nc(() -> { d(); });\nif (x) {\n  e();\n}\nf();';
  const s = stripComments(src);
  assert.equal(s.length, src.length);
  assert.deepEqual(statements(s).map((x) => x.text), ['a()', 'c(() -> { d(); })', 'if (x) {\n  e();\n}', 'f()']);
  assert.deepEqual(statements(s, 0, s.length, true).map((x) => x.text), ['a()', 'c(() -> { d(); })', 'if (x)', 'e()', 'f()']);
});

test('diff shows only changes with context', () => {
  const d = lineDiff('a\nb\nc\nd\ne\nf\ng\nh\ni', 'a\nb\nc\nd\nX\nf\ng\nh\ni');
  assert.deepEqual(d.filter((x) => x.op !== ' ').map((x) => x.op + x.line), ['-e', '+X']);
  const h = diffHunks(d, 1);
  assert.deepEqual(h.map((x) => x.op), ['…', ' ', '-', '+', ' ', '…']);
});

test('Trigger-valued conditions round trip as Trigger variables', () => {
  const cfg = exampleConfig();
  const java = generateJava(cfg);
  assert.match(java, /Trigger shooterReady = shooter\.atSpeed\(\);/);
  assert.equal(generateJava(importJava(java).config), java);
  assert.ok(uid());
});
