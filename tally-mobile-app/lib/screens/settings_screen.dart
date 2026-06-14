import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/biometric_service.dart';
import '../config/theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _biometricSupported = false;
  bool _checkingBiometrics = true;

  @override
  void initState() {
    super.initState();
    _checkBiometrics();
  }

  Future<void> _checkBiometrics() async {
    final supported = await BiometricService.isAvailable();
    if (mounted) {
      setState(() {
        _biometricSupported = supported;
        _checkingBiometrics = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      backgroundColor: AppColors.background,
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Security',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            child: ListTile(
              leading: const Icon(Icons.fingerprint, color: AppColors.primary),
              title: const Text('Biometric Lock'),
              subtitle: Text(
                _checkingBiometrics
                    ? 'Checking support...'
                    : (_biometricSupported
                        ? 'Unlock app using fingerprint or face identification'
                        : 'Not supported on this device'),
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
              trailing: Switch(
                value: authProvider.isBiometricLockEnabled,
                onChanged: _biometricSupported && !_checkingBiometrics
                    ? (value) async {
                        if (value) {
                          // Try authenticating once to confirm it works
                          final success = await BiometricService.authenticate();
                          if (success) {
                            await authProvider.setBiometricLock(true);
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Biometric lock enabled.')),
                              );
                            }
                          } else {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Biometric verification failed.')),
                              );
                            }
                          }
                        } else {
                          await authProvider.setBiometricLock(false);
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Biometric lock disabled.')),
                            );
                          }
                        }
                      }
                    : null,
                activeColor: AppColors.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
