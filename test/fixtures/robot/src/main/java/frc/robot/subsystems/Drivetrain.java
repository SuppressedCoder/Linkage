package frc.robot.subsystems;

import java.util.function.DoubleSupplier;
import edu.wpi.first.wpilibj2.command.Command;
import edu.wpi.first.wpilibj2.command.SubsystemBase;

public class Drivetrain extends SubsystemBase {
    public Command drive(DoubleSupplier x, DoubleSupplier y) { return run(() -> {}); }
    public Command slowMode() { return run(() -> {}); }
}
