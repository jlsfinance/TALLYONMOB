import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

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

      // 3. Initialize local notifications for foreground alerts
      const AndroidInitializationSettings initializationSettingsAndroid =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      const InitializationSettings initializationSettings = InitializationSettings(
        android: initializationSettingsAndroid,
      );
      await _localNotificationsPlugin.initialize(
        initializationSettings: initializationSettings,
      );

      // 4. Configure foreground listeners
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

      // 5. Configure notification opened app (clicked from background)
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        print('FCM message opened: ${message.data}');
      });

    } catch (e) {
      print('FCM initialization error: $e');
    }
  }
}
