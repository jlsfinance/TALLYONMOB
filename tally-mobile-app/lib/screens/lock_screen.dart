import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../config/theme.dart';

class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    // Auto-prompt biometrics on load
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _promptBiometrics();
    });
  }

  Future<void> _promptBiometrics() async {
    final authProvider = context.read<AuthProvider>();
    final success = await authProvider.unlockWithBiometrics();
    if (!success) {
      setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                Container(
                  width: 90,
                  height: 90,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: AppColors.primary.withOpacity(0.3)),
                  ),
                  child: const Icon(
                    Icons.lock_outline_rounded,
                    size: 44,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'TallyLink Locked',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Verify identity to continue',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.grey[500],
                      ),
                ),
                const SizedBox(height: 48),
                IconButton(
                  iconSize: 72,
                  icon: Icon(
                    Icons.fingerprint_rounded,
                    color: _failed ? AppColors.error : AppColors.primary,
                  ),
                  onPressed: _promptBiometrics,
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: _promptBiometrics,
                  child: Text(
                    _failed ? 'Tap to Retry Verification' : 'Use Biometrics',
                    style: TextStyle(
                      color: _failed ? AppColors.error : AppColors.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(height: 48),
                TextButton(
                  onPressed: () async {
                    await authProvider.signOut();
                  },
                  child: const Text(
                    'Log in with another account',
                    style: TextStyle(color: Colors.grey),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
