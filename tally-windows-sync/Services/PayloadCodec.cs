using System;
using System.IO;
using System.IO.Compression;
using System.Text;
using MongoDB.Bson;
using MongoDB.Bson.IO;
using MongoDB.Bson.Serialization;
using Newtonsoft.Json;
// MongoDB.Bson.IO also exposes a JsonConvert type; alias Newtonsoft's to keep the codec unambiguous.
using JsonConvert = Newtonsoft.Json.JsonConvert;

namespace TallySyncApp.Services
{
    /// <summary>
    /// Wire format for a sync payload.
    /// <see cref="Bson"/> / <see cref="BsonGzip"/> let the app emit the BSON document format the
    /// competitor used (MongoDB.Bson), while staying able to read/write plain JSON.
    /// </summary>
    public enum PayloadFormat
    {
        /// <summary>UTF-8 JSON produced by Newtonsoft.Json.</summary>
        Json = 0,

        /// <summary>Raw BSON bytes (MongoDB.Bson).</summary>
        Bson = 1,

        /// <summary>BSON bytes wrapped in a gzip container.</summary>
        BsonGzip = 2
    }

    /// <summary>
    /// PayloadCodec — dependency-light, side-effect-free conversion between CLR objects and the
    /// supported sync payload formats, plus gzip helpers.
    ///
    /// The class is static and keeps no state: it is safe to call from any thread and cannot leak
    /// resources. Format selection is explicit per call, so the app can keep JSON for the
    /// Supabase REST path and use BSON when talking to a backend that expects documents.
    /// </summary>
    public static class PayloadCodec
    {
        private const int GzipBufferSize = 81920;

        private static readonly JsonSerializerSettings JsonSettings = new()
        {
            NullValueHandling = NullValueHandling.Ignore,
            DateFormatString = "yyyy-MM-ddTHH:mm:ssZ",
            Formatting = Formatting.None
        };

        // -----------------------------------------------------------------------
        // Encode / Decode
        // -----------------------------------------------------------------------

        /// <summary>
        /// Serialises <paramref name="payload"/> to the requested format.
        /// </summary>
        /// <exception cref="ArgumentOutOfRangeException">An unknown <paramref name="format"/> was supplied.</exception>
        public static byte[] Encode(object? payload, PayloadFormat format = PayloadFormat.Json)
        {
            switch (format)
            {
                case PayloadFormat.Json:
                    return Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(payload, JsonSettings));

                case PayloadFormat.Bson:
                    return ToBsonBytes(payload);

                case PayloadFormat.BsonGzip:
                    return GzipCompress(ToBsonBytes(payload));

                default:
                    throw new ArgumentOutOfRangeException(
                        nameof(format), format, "Unsupported payload format.");
            }
        }

        /// <summary>
        /// Deserialises <paramref name="data"/> into <typeparamref name="T"/> using the requested format.
        /// Returns <c>default</c> for null/empty input.
        /// </summary>
        /// <exception cref="ArgumentOutOfRangeException">An unknown <paramref name="format"/> was supplied.</exception>
        public static T? Decode<T>(byte[]? data, PayloadFormat format = PayloadFormat.Json)
        {
            if (data == null || data.Length == 0) return default;

            switch (format)
            {
                case PayloadFormat.Json:
                    return JsonConvert.DeserializeObject<T>(Encoding.UTF8.GetString(data), JsonSettings);

                case PayloadFormat.Bson:
                    return BsonSerializer.Deserialize<T>(data);

                case PayloadFormat.BsonGzip:
                    return BsonSerializer.Deserialize<T>(GzipDecompress(data));

                default:
                    throw new ArgumentOutOfRangeException(
                        nameof(format), format, "Unsupported payload format.");
            }
        }

        /// <summary>
        /// Serialises any CLR object (or a live <see cref="BsonDocument"/> / <see cref="BsonArray"/>)
        /// to BSON bytes. Null yields an empty array.
        /// </summary>
        public static byte[] ToBsonBytes(object? payload)
        {
            if (payload == null) return Array.Empty<byte>();
            if (payload is byte[] existing) return existing;
            if (payload is BsonDocument document) return document.ToBson();
            if (payload is BsonArray array) return array.ToBson();

            // Serialise using the payload's runtime type. Going through the `object` nominal
            // type would hit ObjectSerializer, which only allows pre-registered types and
            // throws for an ordinary CLR payload.
            var doc = new BsonDocument();
            using (var writer = new BsonDocumentWriter(doc))
            {
                BsonSerializer.Serialize(writer, payload.GetType(), payload);
            }
            return doc.ToBson();
        }

        // -----------------------------------------------------------------------
        // gzip helpers
        // -----------------------------------------------------------------------

        /// <summary>Compresses raw bytes with gzip.</summary>
        public static byte[] GzipCompress(byte[] data)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));

            using var output = new MemoryStream();
            using (var gzip = new GZipStream(output, CompressionLevel.Optimal, leaveOpen: true))
            {
                gzip.Write(data, 0, data.Length);
            }
            return output.ToArray();
        }

        /// <summary>Decompresses a gzip stream.</summary>
        /// <exception cref="InvalidDataException">The input is not a valid gzip stream.</exception>
        public static byte[] GzipDecompress(byte[] data)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));

            using var input = new MemoryStream(data);
            using var gzip = new GZipStream(input, CompressionMode.Decompress);
            using var output = new MemoryStream();
            gzip.CopyTo(output, GzipBufferSize);
            return output.ToArray();
        }

        /// <summary>Reads a byte array as a UTF-8 string (JSON path convenience).</summary>
        public static string ToJsonString(byte[] data)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            return Encoding.UTF8.GetString(data);
        }

        /// <summary>
        /// Detects the gzip magic number (0x1F 0x8B). Handy when the format of an inbound payload
        /// is not known up front.
        /// </summary>
        public static bool IsGzip(byte[]? data)
        {
            return data != null && data.Length > 1 && data[0] == 0x1F && data[1] == 0x8B;
        }

        /// <summary>
        /// Convenience for an unknown inbound payload: gzip BSON is decompressed and decoded as
        /// BSON, otherwise the bytes are decoded as JSON.
        /// </summary>
        public static T? DecodeAuto<T>(byte[]? data)
        {
            if (data == null || data.Length == 0) return default;
            return IsGzip(data) ? Decode<T>(data, PayloadFormat.BsonGzip) : Decode<T>(data, PayloadFormat.Json);
        }
    }
}