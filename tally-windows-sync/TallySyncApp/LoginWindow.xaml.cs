using System;
using System.Windows;
using System.Windows.Input;
using System.Windows.Controls;
using TallySyncApp.Services;

namespace TallySyncApp
{
    public partial class LoginWindow : Window
    {
        private readonly AuthService _authService;
        private bool _isLoginMode = true;

        public bool LoginSuccessful { get; private set; }

        public LoginWindow(AuthService authService)
        {
            InitializeComponent();
            _authService = authService;

            // Focus on email box
            Loaded += (s, e) => EmailBox.Focus();

            // Allow Enter key to submit
            KeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                    LoginButton_Click(s, e);
            };

            // Allow dragging the window
            MouseDown += (s, e) =>
            {
                if (e.LeftButton == MouseButtonState.Pressed && !(e.OriginalSource is Button) && !(e.OriginalSource is TextBox) && !(e.OriginalSource is PasswordBox))
                    DragMove();
            };
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        private async void LoginButton_Click(object sender, RoutedEventArgs e)
        {
            // Validate inputs
            var email = EmailBox.Text.Trim();
            var password = PasswordBox.Password;
            var fullName = FullNameBox.Text.Trim();

            if (string.IsNullOrEmpty(email))
            {
                ShowError("Please enter your email");
                return;
            }

            if (string.IsNullOrEmpty(password))
            {
                ShowError("Please enter your password");
                return;
            }

            if (!_isLoginMode && string.IsNullOrEmpty(fullName))
            {
                ShowError("Please enter your full name");
                return;
            }

            // Show loading
            SetLoading(true);
            HideError();

            try
            {
                if (_isLoginMode)
                {
                    // Login
                    var (success, error) = await _authService.SignInAsync(email, password);

                    if (success)
                    {
                        LoginSuccessful = true;
                        DialogResult = true;
                        Close();
                    }
                    else
                    {
                        ShowError(error ?? "Login failed. Please check your credentials.");
                    }
                }
                else
                {
                    // Signup
                    var (success, error) = await _authService.SignUpAsync(email, password, fullName);

                    if (success)
                    {
                        MessageBox.Show(
                            "Account created successfully!\n\nPlease check your email to verify your account, then sign in.",
                            "Success",
                            MessageBoxButton.OK,
                            MessageBoxImage.Information
                        );

                        // Switch to login mode
                        ToggleMode();
                        PasswordBox.Password = "";
                    }
                    else
                    {
                        ShowError(error ?? "Signup failed. Please try again.");
                    }
                }
            }
            catch (Exception ex)
            {
                ShowError($"Connection error: {ex.Message}");
            }
            finally
            {
                SetLoading(false);
            }
        }

        private async void GoogleSignInButton_Click(object sender, RoutedEventArgs e)
        {
            SetLoading(true);
            LoadingText.Text = "Opening Google Sign-In...";
            HideError();

            try
            {
                // Use Supabase OAuth with Google
                var (success, error) = await _authService.SignInWithGoogleAsync();

                if (success)
                {
                    LoginSuccessful = true;
                    DialogResult = true;
                    Close();
                }
                else
                {
                    ShowError(error ?? "Google Sign-In failed. Please try again.");
                }
            }
            catch (Exception ex)
            {
                ShowError($"Google Sign-In error: {ex.Message}");
            }
            finally
            {
                SetLoading(false);
            }
        }

        private void ToggleMode_Click(object sender, MouseButtonEventArgs e)
        {
            ToggleMode();
        }

        private void ToggleMode()
        {
            _isLoginMode = !_isLoginMode;

            if (_isLoginMode)
            {
                HeaderText.Text = "Welcome Back";
                SubHeaderText.Text = "Sign in to your account";
                ButtonText.Text = "Sign In";
                TogglePrompt.Text = "Don't have an account? ";
                ToggleLink.Text = "Sign Up";
                FullNamePanel.Visibility = Visibility.Collapsed;
            }
            else
            {
                HeaderText.Text = "Create Account";
                SubHeaderText.Text = "Sign up to get started";
                ButtonText.Text = "Create Account";
                TogglePrompt.Text = "Already have an account? ";
                ToggleLink.Text = "Sign In";
                FullNamePanel.Visibility = Visibility.Visible;
            }

            HideError();
        }

        private void ShowError(string message)
        {
            ErrorText.Text = message;
            ErrorBorder.Visibility = Visibility.Visible;
        }

        private void HideError()
        {
            ErrorBorder.Visibility = Visibility.Collapsed;
        }

        private void SetLoading(bool isLoading)
        {
            LoginButton.IsEnabled = !isLoading;
            LoadingPanel.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
            LoadingText.Text = _isLoginMode ? "Signing in..." : "Creating account...";
        }
    }
}
