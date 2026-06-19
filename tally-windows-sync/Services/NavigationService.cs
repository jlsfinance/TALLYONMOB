using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Simple navigation stack for smart back navigation.
    /// Preserves scroll position and selected index when going back.
    /// </summary>
    public class NavigationService
    {
        private readonly Stack<NavEntry> _backStack = new();
        private readonly Stack<NavEntry> _forwardStack = new();

        public event Action<string, object?>? OnNavigate;
        public event Action? OnBackAvailable;
        public event Action? OnForwardAvailable;

        public bool CanGoBack => _backStack.Count > 0;
        public bool CanGoForward => _forwardStack.Count > 0;

        public void NavigateTo(string pageName, object? parameter = null, double scrollOffset = 0, int selectedIndex = -1)
        {
            _backStack.Push(new NavEntry
            {
                PageName = pageName,
                Parameter = parameter,
                ScrollOffset = scrollOffset,
                SelectedIndex = selectedIndex
            });
            _forwardStack.Clear();
            OnBackAvailable?.Invoke();
            OnForwardAvailable?.Invoke();
            OnNavigate?.Invoke(pageName, parameter);
        }

        public NavEntry? GoBack()
        {
            if (_backStack.Count <= 1) return null;

            var current = _backStack.Pop();
            _forwardStack.Push(current);
            OnBackAvailable?.Invoke();
            OnForwardAvailable?.Invoke();

            var prev = _backStack.Peek();
            OnNavigate?.Invoke(prev.PageName, prev.Parameter);
            return prev;
        }

        public NavEntry? GoForward()
        {
            if (_forwardStack.Count == 0) return null;

            var entry = _forwardStack.Pop();
            _backStack.Push(entry);
            OnBackAvailable?.Invoke();
            OnForwardAvailable?.Invoke();

            OnNavigate?.Invoke(entry.PageName, entry.Parameter);
            return entry;
        }

        public void Clear()
        {
            _backStack.Clear();
            _forwardStack.Clear();
            OnBackAvailable?.Invoke();
            OnForwardAvailable?.Invoke();
        }

        public NavEntry? Peek()
        {
            return _backStack.Count > 0 ? _backStack.Peek() : null;
        }
    }

    public class NavEntry
    {
        public string PageName { get; set; } = "";
        public object? Parameter { get; set; }
        public double ScrollOffset { get; set; }
        public int SelectedIndex { get; set; } = -1;
    }
}
