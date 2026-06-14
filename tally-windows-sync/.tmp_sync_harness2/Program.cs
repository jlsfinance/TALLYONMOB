using System;
using System.Collections.Generic;
using System.Reflection;
using Newtonsoft.Json.Linq;
using TallySyncApp.Models;
using TallySyncApp.Services;

class Program
{
    static void Main()
    {
        var method = typeof(SyncManager).GetMethod("BuildFallbackLedgerEntries", BindingFlags.NonPublic | BindingFlags.Static);
        if (method == null)
        {
            Console.WriteLine("METHOD_NOT_FOUND");
            return;
        }

        var inventory = new List<VoucherInventoryEntry>
        {
            new VoucherInventoryEntry
            {
                StockItemName = "Demo Item",
                Quantity = 1,
                Rate = 100,
                Amount = 100,
                TaxRate = 18
            }
        };

        var available = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "A.M. Enterprises",
            "Sales Account",
            "Output CGST 9%",
            "Output SGST 9%",
            "Round Off"
        };

        var sourceLedgers = new List<VoucherLedgerEntry>();

        var tokenA = JObject.Parse("{\"party_name\":\"A.M. Enterprises\"}");
        var argsA = new object?[] { "Sales", "A.M. Enterprises", 100m, tokenA, sourceLedgers, inventory, available };
        var resultA = (List<VoucherLedgerEntry>?)method.Invoke(null, argsA) ?? new List<VoucherLedgerEntry>();

        Console.WriteLine("TEST_A");
        foreach (var e in resultA)
        {
            Console.WriteLine($"{e.LedgerName}|{e.Amount}");
        }

        var tokenB = JObject.Parse("{\"party_name\":\"A.M. Enterprises\",\"cgst_amount\":9,\"sgst_amount\":9,\"round_off\":0.5}");
        var argsB = new object?[] { "Sales", "A.M. Enterprises", 118.5m, tokenB, sourceLedgers, inventory, available };
        var resultB = (List<VoucherLedgerEntry>?)method.Invoke(null, argsB) ?? new List<VoucherLedgerEntry>();

        Console.WriteLine("TEST_B");
        foreach (var e in resultB)
        {
            Console.WriteLine($"{e.LedgerName}|{e.Amount}");
        }
    }
}
