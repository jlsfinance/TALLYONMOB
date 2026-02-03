using System.IO;
using Newtonsoft.Json;

namespace TallySyncApp.Services
{
    public class BuildInfo
    {
        public string version { get; set; } = "1.0.0";
        public int build { get; set; } = 0;

        public static BuildInfo Load()
        {
            try 
            {
                if (File.Exists("build.json"))
                {
                    var json = File.ReadAllText("build.json");
                    return JsonConvert.DeserializeObject<BuildInfo>(json) ?? new BuildInfo();
                }
            }
            catch { }
            return new BuildInfo();
        }
    }
}
