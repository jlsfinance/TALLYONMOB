using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using TallySyncApp.Models;

namespace TallySyncApp.Pages
{
    public partial class PartyDetailPage : UserControl
    {
        private List<Voucher> _allVouchers = new();
        private string _partyName = "";

        public event Action? OnBack;
        public event Action<int, double>? OnVoucherClick;

        public PartyDetailPage()
        {
            InitializeComponent();
        }

        public void LoadParty(string partyName, List<Voucher> allVouchers)
        {
            _partyName = partyName;
            _allVouchers = allVouchers;

            PartyTitle.Text = partyName;
            PartyNameText.Text = partyName;

            // Filter vouchers for this party
            var partyVouchers = allVouchers
                .Where(v => string.Equals(v.PartyName, partyName, StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(v => v.VoucherDate)
                .ToList();

            // Try to find ledger info from first voucher
            var firstVoucher = partyVouchers.FirstOrDefault();
            if (firstVoucher != null)
            {
                PartyGstinText.Text = string.IsNullOrEmpty(firstVoucher.PartyGstin) ? "" : $"GSTIN: {firstVoucher.PartyGstin}";
                PartyGroupText.Text = firstVoucher.PlaceOfSupply ?? "";
            }

            // Calculate total balance
            var totalDebit = partyVouchers
                .SelectMany(v => v.LedgerEntries ?? new List<VoucherLedgerEntry>())
                .Where(le => le.IsDebit)
                .Sum(le => le.Amount);
            var totalCredit = partyVouchers
                .SelectMany(v => v.LedgerEntries ?? new List<VoucherLedgerEntry>())
                .Where(le => !le.IsDebit)
                .Sum(le => le.Amount);
            var balance = totalDebit - totalCredit;

            BalanceText.Text = balance >= 0 ? $"₹{balance:N0} (Dr)" : $"₹{Math.Abs(balance):N0} (Cr)";
            BalanceText.Foreground = new SolidColorBrush(
                (Color)ColorConverter.ConvertFromString(balance >= 0 ? "#059669" : "#DC2626"));

            // Transactions list
            var txnItems = partyVouchers.Select(v => new
            {
                VoucherType = v.VoucherType ?? "",
                VoucherNumber = v.VoucherNumber ?? "-",
                DateFormatted = v.VoucherDate.ToString("dd MMM yyyy"),
                AmountFormatted = $"₹{Math.Abs(v.TotalAmount):N0}",
                TypeIcon = GetTypeIcon(v.VoucherType),
                _voucherIndex = allVouchers.IndexOf(v)
            }).ToList();

            if (txnItems.Count > 0)
            {
                TransactionsList.ItemsSource = txnItems;
                TxnCount.Text = $"{txnItems.Count} transactions";
                NoTransactionsText.Visibility = Visibility.Collapsed;
            }
            else
            {
                TransactionsList.ItemsSource = null;
                TxnCount.Text = "0 transactions";
                NoTransactionsText.Visibility = Visibility.Visible;
            }
        }

        private string GetTypeIcon(string? voucherType)
        {
            return voucherType?.ToUpper() switch
            {
                "SALES" or "SALE" => "🧾",
                "PURCHASE" or "PURCHASES" => "📦",
                "PAYMENT" => "💸",
                "RECEIPT" => "💰",
                "JOURNAL" => "📝",
                "CONTRA" => "🔄",
                "CREDIT NOTE" => "📋",
                "DEBIT NOTE" => "📋",
                _ => "📄"
            };
        }

        private void Back_Click(object sender, RoutedEventArgs e)
        {
            OnBack?.Invoke();
        }

        private void Transaction_Click(object sender, MouseButtonEventArgs e)
        {
            if (sender is Border border && border.Tag is { } tagObj)
            {
                // Find the voucher index from the anonymous type
                var prop = tagObj.GetType().GetProperty("_voucherIndex");
                if (prop != null)
                {
                    var index = (int)prop.GetValue(tagObj)!;
                    OnVoucherClick?.Invoke(index, 0);
                }
            }
        }
    }
}
