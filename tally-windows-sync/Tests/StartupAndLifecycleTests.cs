using TallySyncApp.Models;
using TallySyncApp.Services;

namespace TallySyncApp.Tests
{
    public class StartupAndLifecycleTests
    {
        [Fact]
        public void CommandLineOptions_ParsesAutoStartAndPostInstallSwitches()
        {
            var auto = CommandLineOptions.Parse(new[] { @"C:\App\SyncoraConnector.exe", "/auto" });
            Assert.True(auto.IsAutoStart);
            Assert.False(auto.IsPostInstall);
            Assert.False(auto.IsNormalStart);

            var postInstall = CommandLineOptions.Parse(new[] { @"C:\App\SyncoraConnector.exe", "/installation@1" });
            Assert.False(postInstall.IsAutoStart);
            Assert.True(postInstall.IsPostInstall);

            var normal = CommandLineOptions.Parse(new[] { @"C:\App\SyncoraConnector.exe" });
            Assert.True(normal.IsNormalStart);
        }

        [Fact]
        public void SyncSettings_DefaultsStartWithWindowsToTrue()
        {
            var settings = new SyncSettings();
            Assert.True(settings.StartWithWindows);
        }
    }
}
