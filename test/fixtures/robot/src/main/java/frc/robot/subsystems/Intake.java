package frc.robot.subsystems;

import edu.wpi.first.wpilibj2.command.Command;
import edu.wpi.first.wpilibj2.command.SubsystemBase;
import edu.wpi.first.wpilibj2.command.button.Trigger;

public class Intake extends SubsystemBase {
    private final Trigger jammed = new Trigger(this::isJammed).debounce(0.5);

    public Intake() {
        // a binding inside a subsystem
        jammed.onTrue(runOnce(this::stop));
    }

    public Trigger hasNote() {
        return new Trigger(this::noteSensor);
    }

    public Command runIntake() { return run(() -> {}); }
    public Command eject() { return run(() -> {}); }
    public Command feed() { return run(() -> {}); }
    private boolean noteSensor() { return false; }
    private boolean isJammed() { return false; }
    private void stop() {}
}
