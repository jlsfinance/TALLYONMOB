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

            Loaded += (s, e) => {
                Dispatcher.BeginInvoke(new Action(() => {
                    if (EmailBox != null) EmailBox.Focus();
                }), System.Windows.Threading.DispatcherPriority.Input);
            };

            KeyDown += (s, e) =>
            {
                if (e.Key == Key.Enter)
                    LoginButton_Click(s, e);
            };
        }

        private void LoginButton_Click(object sender, RoutedEventArgs e)
        {
            var email = EmailBox?.Text?.Trim() ?? string.Empty;
            var password = PasswordBox?.Password ?? string.Empty;
            var fullName = FullNameBox?.Text?.Trim() ?? string.Empty;

            if (string.IsNullOrEmpty(email)) { ShowError("Please enter your email"); return; }
            if (string.IsNullOrEmpty(password)) { ShowError("Please enter your password"); return; }
            if (!_isLoginMode && string.IsNullOrEmpty(fullName)) { ShowError("Please enter your full name"); return; }

            SetLoading(true);
            HideError();

            DoLogin(email, password, fullName);
        }

        private async void DoLogin(string email, string password, string fullName)
        {
            try
            {
                if (_isLoginMode)
                {
                    if (_authService == null) { ShowError("Login service not initialized."); return; }
                    var (success, error) = await _authService.SignInAsync(email, password);
                    if (success) { LoginSuccessful = true; DialogResult = true; }
                    else { ShowError(error ?? "Login failed."); }
                }
                else
                {
                    if (_authService == null) { ShowError("Signup service not initialized."); return; }
                    var (success, error) = await _authService.SignUpAsync(email, password, fullName);
                    if (success)
                    {
                        MessageBox.Show("Account created! Check email to verify, then sign in.", "Success", MessageBoxButton.OK, MessageBoxImage.Information);
                        ToggleMode();
                        if (PasswordBox != null) PasswordBox.Password = "";
                    }
                    else { ShowError(error ?? "Signup failed."); }
                }
            }
            catch (Exception ex) { ShowError($"Connection error: {ex.Message}"); }
            finally { SetLoading(false); }
        }

        private void ToggleMode_Click(object sender, MouseButtonEventArgs e) => ToggleMode();

        private void ToggleMode()
        {
            _isLoginMode = !_isLoginMode;
            if (_isLoginMode)
            {
                HeaderText.Text = "Sign In";
                SubHeaderText.Text = "Enter your credentials to continue";
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

        private void ShowError(string message) { ErrorText.Text = message; ErrorText.Visibility = Visibility.Visible; }
        private void HideError() { ErrorText.Visibility = Visibility.Collapsed; }
        private void SetLoading(bool isLoading) { LoginButton.IsEnabled = !isLoading; LoadingPanel.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed; }
    }
}
