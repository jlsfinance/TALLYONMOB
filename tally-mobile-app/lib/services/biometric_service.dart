import 'package:local_auth/local_auth.dart';

class BiometricService {
  static final LocalAuthentication _auth = LocalAuthentication();

  /// Checks if the device is capable of biometric authentication
  static Future<bool> isAvailable() async {
    try {
      final bool canCheck = await _auth.canCheckBiometrics;
      final bool isSupported = await _auth.isDeviceSupported();
      return canCheck || isSupported;
    } catch (e) {
      return false;
    }
  }

  /// Attempts to authenticate using biometrics (fingerprint/face recognition)
  static Future<bool> authenticate() async {
    try {
      if (!await isAvailable()) return false;
      
      return await _auth.authenticate(
        localizedReason: 'Authenticate to access your Tally account',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: true,
        ),
      );
    } catch (e) {
      return false;
    }
  }
}
