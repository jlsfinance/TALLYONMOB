using System;
using System.Windows;
using System.Windows.Input;
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

            // Focus on email box safely using dispatcher
            Loaded += (s, e) => {
                Dispatcher.BeginInvoke(new Action(() => {
                    if (EmailBox != null) EmailBox.Focus();
                }), System.Windows.Threading.DispatcherPriority.Input);
            };

            // Allow Enter key to submit
            KeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                    LoginButton_Click(s, e);
            };
        }

        private async void LoginButton_Click(object sender, RoutedEventArgs e)
        {
            // Validate inputs
            var email = EmailBox?.Text?.Trim() ?? string.Empty;
            var password = PasswordBox?.Password ?? string.Empty;
            var fullName = FullNameBox?.Text?.Trim() ?? string.Empty;

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
                    if (_authService == null)
                    {
                        ShowError("Login service is not initialized. Please restart TallyLink.");
                        return;
                    }

                    // Login
                    var (success, error) = await _authService.SignInAsync(email, password);

                    if (success)
                    {
                        LoginSuccessful = true;
                        Close();
                    }
                    else
                    {
                        ShowError(error ?? "Login failed. Please check your credentials.");
                    }
                }
                else
                {
                    if (_authService == null)
                    {
                        ShowError("Signup service is not initialized. Please restart TallyLink.");
                        return;
                    }

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
                        if (PasswordBox != null) PasswordBox.Password = "";
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

        private void ToggleMode_Click(object sender, MouseButtonEventArgs e)
        {
            ToggleMode();
        }

        private void ToggleMode()
        {
            _isLoginMode = !_isLoginMode;

            if (_isLoginMode)
            {
                if (HeaderText != null) HeaderText.Text = "Welcome Back";
                if (SubHeaderText != null) SubHeaderText.Text = "Sign in to your account";
                if (ButtonText != null) ButtonText.Text = "Sign In";
                if (TogglePrompt != null) TogglePrompt.Text = "Don't have an account? ";
                if (ToggleLink != null) ToggleLink.Text = "Sign Up";
                if (FullNamePanel != null) FullNamePanel.Visibility = Visibility.Collapsed;
            }
            else
            {
                if (HeaderText != null) HeaderText.Text = "Create Account";
                if (SubHeaderText != null) SubHeaderText.Text = "Sign up to get started";
                if (ButtonText != null) ButtonText.Text = "Create Account";
                if (TogglePrompt != null) TogglePrompt.Text = "Already have an account? ";
                if (ToggleLink != null) ToggleLink.Text = "Sign In";
                if (FullNamePanel != null) FullNamePanel.Visibility = Visibility.Visible;
            }

            HideError();
        }

        private void ShowError(string message)
        {
            if (ErrorText == null)
            {
                MessageBox.Show(message, "TallyLink", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            ErrorText.Text = message;
            ErrorText.Visibility = Visibility.Visible;
        }

        private void HideError()
        {
            if (ErrorText != null)
            {
                ErrorText.Visibility = Visibility.Collapsed;
            }
        }

        private void SetLoading(bool isLoading)
        {
            if (LoginButton != null) LoginButton.IsEnabled = !isLoading;
            if (LoadingPanel != null) LoadingPanel.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
            if (LoadingText != null) LoadingText.Text = _isLoginMode ? "Signing in..." : "Creating account...";
        }
    }
}
