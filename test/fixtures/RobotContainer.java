package frc.robot;

import edu.wpi.first.wpilibj2.command.Command;
import edu.wpi.first.wpilibj2.command.Commands;
import edu.wpi.first.wpilibj2.command.button.CommandXboxController;
import frc.robot.Constants.OperatorConstants;
import frc.robot.subsystems.Drivetrain;
import frc.robot.subsystems.Intake;

public class RobotContainer {
    private final Drivetrain drivetrain = new Drivetrain();
    private final Intake intake = new Intake();

    private final CommandXboxController driver = new CommandXboxController(OperatorConstants.kDriverPort);
    private final CommandXboxController operator = new CommandXboxController(1);

    public RobotContainer() {
        configureBindings();
        new DriverControls(drivetrain, intake);
    }

    private void configureBindings() {
        drivetrain.setDefaultCommand(drivetrain.drive(() -> -driver.getLeftY(), () -> -driver.getLeftX()));

        // intake while held, stop when a note is in
        driver.leftTrigger(0.5).and(intake.hasNote().negate()).whileTrue(intake.runIntake());
        operator.a().whileTrue(intake.eject());
        intake.hasNote().onTrue(Commands.runOnce(() -> driver.getHID().setRumble(edu.wpi.first.wpilibj.GenericHID.RumbleType.kBothRumble, 0.5)));
        if (Robot.isSimulation()) {
            operator.back().onTrue(Commands.print("sim"));
        }
    }

    public Command getAutonomousCommand() {
        return Commands.none();
    }
}
