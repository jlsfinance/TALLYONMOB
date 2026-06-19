using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using TallySyncApp.Models;

namespace TallySyncApp.Pages
{
    public partial class VoucherDetailPage : UserControl
    {
        private List<Voucher> _vouchers = new();
        private int _currentIndex = 0;
        private Point _dragStart;
        private bool _isDragging = false;

        public event Action? OnBack;
        public event Action<string, string?>? OnPartyClick;
        public event Action<string, string?>? OnStockItemClick;
        public event Action<int, double>? OnNavigateVoucher;

        public VoucherDetailPage()
        {
            InitializeComponent();

            // Mouse drag for swipe
            MouseLeftButtonDown += OnMouseLeftDown;
            MouseLeftButtonUp += OnMouseLeftUp;
            MouseMove += OnMouseMove;
        }

        public void LoadVoucher(List<Voucher> vouchers, int index)
        {
            _vouchers = vouchers;
            _currentIndex = index;
            RenderVoucher();
        }

        private void RenderVoucher()
        {
            if (_vouchers == null || _vouchers.Count == 0 || _currentIndex < 0 || _currentIndex >= _vouchers.Count)
                return;

            var v = _vouchers[_currentIndex];

            VoucherTypeLabel.Text = v.VoucherType ?? "Voucher";
            VoucherNumberLabel.Text = $"#{v.VoucherNumber ?? "-"}";
            VoucherTitle.Text = $"{v.VoucherType} #{v.VoucherNumber ?? "-"}";
            VoucherDate.Text = v.VoucherDate.ToString("dd MMM yyyy, dddd");
            VoucherNumber.Text = $"Voucher #{v.VoucherNumber ?? "-"}";

            var amount = Math.Abs(v.TotalAmount);
            VoucherAmount.Text = $"₹{amount:N0}";
            AmountBorder.Background = new SolidColorBrush(
                (Color)ColorConverter.ConvertFromString(
                    v.TotalAmount >= 0 ? "#059669" : "#DC2626"));

            PartyName.Text = v.PartyName ?? "Unknown Party";
            NarrationText.Text = v.Narration ?? "No narration";
            NarrationBorder.Visibility = string.IsNullOrEmpty(v.Narration) ? Visibility.Collapsed : Visibility.Visible;

            // Ledger entries
            var ledgerItems = new List<object>();
            if (v.LedgerEntries != null)
            {
                foreach (var le in v.LedgerEntries)
                {
                    ledgerItems.Add(new
                    {
                        LedgerName = le.LedgerName ?? "Unknown",
                        AmountFormatted = $"₹{Math.Abs(le.Amount):N0}",
                        Direction = le.IsDebit ? "DR" : "CR"
                    });
                }
            }
            LedgerEntriesList.ItemsSource = ledgerItems;

            // Inventory entries
            var inventoryItems = new List<object>();
            if (v.InventoryEntries != null && v.InventoryEntries.Count > 0)
            {
                foreach (var ie in v.InventoryEntries)
                {
                    inventoryItems.Add(new
                    {
                        StockItemName = ie.StockItemName ?? "Unknown",
                        Quantity = ie.Quantity,
                        RateFormatted = $"₹{ie.Rate:N2}/unit",
                        AmountFormatted = $"₹{ie.Amount:N0}"
                    });
                }
                InventoryEntriesList.ItemsSource = inventoryItems;
                InventoryBorder.Visibility = Visibility.Visible;
            }
            else
            {
                InventoryBorder.Visibility = Visibility.Collapsed;
            }

            NavIndicator.Text = $"{_currentIndex + 1} / {_vouchers.Count}";
            VoucherScroll.ScrollToTop();
        }

        private void Back_Click(object sender, RoutedEventArgs e)
        {
            OnBack?.Invoke();
        }

        private void PartyName_Click(object sender, MouseButtonEventArgs e)
        {
            if (_vouchers != null && _currentIndex >= 0 && _currentIndex < _vouchers.Count)
            {
                var v = _vouchers[_currentIndex];
                OnPartyClick?.Invoke(v.PartyName ?? "", v.PartyGstin);
            }
        }

        private void StockItem_Click(object sender, MouseButtonEventArgs e)
        {
            if (sender is TextBlock tb && tb.DataContext is { } ctx)
            {
                var name = ctx.GetType().GetProperty("StockItemName")?.GetValue(ctx)?.ToString();
                OnStockItemClick?.Invoke(name ?? "", null);
            }
        }

        private void PrevVoucher_Click(object sender, RoutedEventArgs e)
        {
            if (_currentIndex > 0)
            {
                _currentIndex--;
                RenderVoucher();
                OnNavigateVoucher?.Invoke(_currentIndex, 0);
            }
        }

        private void NextVoucher_Click(object sender, RoutedEventArgs e)
        {
            if (_currentIndex < _vouchers.Count - 1)
            {
                _currentIndex++;
                RenderVoucher();
                OnNavigateVoucher?.Invoke(_currentIndex, 0);
            }
        }

        // Swipe via mouse drag
        private void OnMouseLeftDown(object sender, MouseButtonEventArgs e)
        {
            _dragStart = e.GetPosition(this);
            _isDragging = true;
            CaptureMouse();
        }

        private void OnMouseLeftUp(object sender, MouseButtonEventArgs e)
        {
            if (_isDragging)
            {
                _isDragging = false;
                ReleaseMouseCapture();

                var dragEnd = e.GetPosition(this);
                var diff = dragEnd.X - _dragStart.X;

                if (Math.Abs(diff) > 80)
                {
                    if (diff < 0 && _currentIndex < _vouchers.Count - 1)
                    {
                        _currentIndex++;
                        RenderVoucher();
                        OnNavigateVoucher?.Invoke(_currentIndex, 0);
                    }
                    else if (diff > 0 && _currentIndex > 0)
                    {
                        _currentIndex--;
                        RenderVoucher();
                        OnNavigateVoucher?.Invoke(_currentIndex, 0);
                    }
                }
            }
        }

        private void OnMouseMove(object sender, MouseEventArgs e)
        {
        }

        public int CurrentIndex => _currentIndex;
    }
}
