package frc.robot;

import edu.wpi.first.wpilibj2.command.button.CommandXboxController;
import frc.robot.subsystems.Drivetrain;
import frc.robot.subsystems.Intake;

/** A second place that binds the driver controller: Linkage should notice. */
public class DriverControls {
    private final CommandXboxController pad = new CommandXboxController(0);

    public DriverControls(Drivetrain drivetrain, Intake intake) {
        pad.rightBumper().whileTrue(drivetrain.slowMode());
        pad.leftTrigger(0.5).whileTrue(intake.feed());
    }
}
