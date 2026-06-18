import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:hive_flutter/hive_flutter.dart';

class FcmService {
  static final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  static final FlutterLocalNotificationsPlugin _localNotificationsPlugin =
      FlutterLocalNotificationsPlugin();

  /// Requests notification permissions and registers event hooks
  static Future<void> initialize() async {
    try {
      // 1. Request notification permissions
      NotificationSettings settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        provisional: false,
        sound: true,
      );

      print('User granted notification permission: ${settings.authorizationStatus}');

      // 2. Fetch FCM device token
      String? token = await _messaging.getToken();
      print('FCM Device Token: $token');

      // 3. Register token in Supabase device_tokens table
      if (token != null) {
        await _registerToken(token);
      }

      // 4. Listen for token refresh
      _messaging.onTokenRefresh.listen((newToken) {
        print('FCM Token refreshed: $newToken');
        _registerToken(newToken);
      });

      // 5. Initialize local notifications for foreground alerts
      const AndroidInitializationSettings initializationSettingsAndroid =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const InitializationSettings initializationSettings = InitializationSettings(
        android: initializationSettingsAndroid,
      );
      await _localNotificationsPlugin.initialize(
        settings: initializationSettings,
      );

      // 6. Configure foreground listeners
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        RemoteNotification? notification = message.notification;
        AndroidNotification? android = message.notification?.android;

        if (notification != null && android != null) {
          _localNotificationsPlugin.show(
            id: notification.hashCode,
            title: notification.title,
            body: notification.body,
            payload: null,
            notificationDetails: const NotificationDetails(
              android: AndroidNotificationDetails(
                'tally_channel',
                'Tally Notifications',
                channelDescription: 'Sync status and ledger alerts',
                importance: Importance.max,
                priority: Priority.high,
                icon: '@mipmap/ic_launcher',
              ),
            ),
          );
        }
      });

      // 7. Configure notification opened app (clicked from background)
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        print('FCM message opened: ${message.data}');
      });

    } catch (e) {
      print('FCM initialization error: $e');
    }
  }

  /// Register FCM token in Supabase device_tokens table
  static Future<void> _registerToken(String token) async {
    try {
      final supabase = Supabase.instance.client;
      final user = supabase.auth.currentUser;
      if (user == null) return;

      // Get selected company from Hive
      final settingsBox = Hive.box('settings');
      final companyId = settingsBox.get('selectedCompanyId');
      if (companyId == null) return;

      await supabase.from('device_tokens').upsert({
        'user_id': user.id,
        'company_id': companyId,
        'token': token,
        'platform': 'android',
        'is_active': true,
        'updated_at': DateTime.now().toIso8601String(),
      }, onConflict: 'user_id,company_id');

      print('FCM token registered for user ${user.id}, company $companyId');
    } catch (e) {
      print('Error registering FCM token: $e');
    }
  }
}
