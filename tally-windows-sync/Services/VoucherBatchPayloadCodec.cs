using System.Collections.Generic;
using System.IO;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using TallySyncApp.Models;

namespace TallySyncApp.Services;

/// <summary>
/// Allocations are JsonIgnore on the cloud transport models (they upload separately),
/// but MUST survive in the local write-ahead payload for a complete replay.
/// Keep the network model's normal serialization unchanged.
/// </summary>
public static class VoucherBatchPayloadCodec
{
    private sealed class SnapshotContractResolver : DefaultContractResolver
    {
        protected override JsonProperty CreateProperty(MemberInfo member, MemberSerialization serialization)
        {
            var property = base.CreateProperty(member, serialization);
            if (member.DeclaringType == typeof(VoucherLedgerEntry) &&
                member.Name is nameof(VoucherLedgerEntry.BillAllocations) or nameof(VoucherLedgerEntry.BankAllocations))
                property.Ignored = false;
            return property;
        }
    }

    private static readonly JsonSerializerSettings Settings = new() { ContractResolver = new SnapshotContractResolver() };
    public static string Serialize(List<Voucher> vouchers) => JsonConvert.SerializeObject(vouchers, Settings);
    public static List<Voucher> Deserialize(string json) => JsonConvert.DeserializeObject<List<Voucher>>(json, Settings)
        ?? throw new InvalidDataException("Saved voucher batch is unreadable.");
}
