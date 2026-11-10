#pragma warning disable 162
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows;

namespace JylliSetup
{
    static class App
    {
#if UNINSTALLER
        public const bool IsUninstaller = true;
#else
        public const bool IsUninstaller = false;
#endif

        [STAThread]
        static int Main(string[] args)
        {
            string self = Assembly.GetExecutingAssembly().Location;
            string selfDir = Path.GetDirectoryName(self);
            string raw = TailOfCommandLine();

            if (!IsUninstaller)
            {
                RunWindow(false, null);
                return 0;
            }

            string installDir = selfDir;
            int fi = raw.IndexOf("--from=", StringComparison.OrdinalIgnoreCase);
            bool relocated = fi >= 0;
            if (relocated) installDir = raw.Substring(fi + 7).Trim().Trim('"');

            // electron-builder's updater calls the registered uninstaller silently: hand straight to NSIS.
            if (HasSwitch(raw, "/S"))
            {
                int ui = raw.IndexOf("_?=", StringComparison.Ordinal);
                string dir = ui >= 0 ? raw.Substring(ui + 3).Trim().Trim('"') : installDir;
                string nsis = Path.Combine(dir, Engine.NsisUninstaller);
                if (!File.Exists(nsis)) return 2;
                // Run a temp copy (like electron-builder does) so the NSIS uninstaller is not running from the folder it removes.
                string tmpDir = Path.Combine(Path.GetTempPath(), "JylliUn-" + Guid.NewGuid().ToString("N"));
                try
                {
                    Directory.CreateDirectory(tmpDir);
                    string copy = Path.Combine(tmpDir, Engine.NsisUninstaller);
                    File.Copy(nsis, copy, true);
                    Process p = Engine.Start(copy, raw);
                    p.WaitForExit();
                    return p.ExitCode;
                }
                finally { try { Directory.Delete(tmpDir, true); } catch { } }
            }

            // Interactive: run from a temp copy so the install folder can be deleted.
            if (!relocated)
            {
                string tmp = Path.Combine(Path.GetTempPath(), "JylliUn-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(tmp);
                string copy = Path.Combine(tmp, Engine.CustomUninstaller);
                File.Copy(self, copy, true);
                string flag = HasSwitch(raw, "/allusers") ? " /allusers" : (HasSwitch(raw, "/currentuser") ? " /currentuser" : "");
                ProcessStartInfo psi = new ProcessStartInfo(copy, "--from=\"" + selfDir + "\"" + flag);
                psi.UseShellExecute = true;
                Process.Start(psi);
                return 0;
            }

            RunWindow(true, installDir);
            return 0;
        }

        static void RunWindow(bool uninstall, string dir)
        {
            Application app = new Application();
            SetupWindow sw = new SetupWindow(uninstall, dir);
            app.Run(sw.Window);
            sw.OnExit();
        }

        static bool HasSwitch(string raw, string sw)
        {
            foreach (string t in raw.Split(' '))
                if (string.Equals(t.Trim('"'), sw, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        // Everything after the executable token, preserving spacing (NSIS needs "_?=<path with spaces>" intact).
        static string TailOfCommandLine()
        {
            string c = Environment.CommandLine.TrimStart();
            int i;
            if (c.StartsWith("\""))
            {
                i = c.IndexOf('"', 1);
                i = i < 0 ? c.Length : i + 1;
            }
            else
            {
                i = c.IndexOf(' ');
                if (i < 0) i = c.Length;
            }
            return c.Substring(i).Trim();
        }
    }
}
