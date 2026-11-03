using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using Microsoft.Win32;

namespace JylliSetup
{
    class ExistingInstall
    {
        public string Version;
        public string Location;
        public bool AllUsers;
    }

    static class Engine
    {
        public const string AppName = "Jylli Tool";
        public const string AppExe = "Jylli Tool.exe";
        public const string NsisUninstaller = "Uninstall Jylli Tool.exe";
        public const string CustomUninstaller = "Jylli Tool Uninstaller.exe";
        const string UninstallRoot = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";

        public static ExistingInstall FindExisting()
        {
            RegistryHive[] hives = { RegistryHive.CurrentUser, RegistryHive.LocalMachine };
            RegistryView[] views = { RegistryView.Registry64, RegistryView.Registry32 };
            foreach (RegistryHive hive in hives)
            {
                foreach (RegistryView view in views)
                {
                    try
                    {
                        using (RegistryKey bas = RegistryKey.OpenBaseKey(hive, view))
                        using (RegistryKey root = bas.OpenSubKey(UninstallRoot))
                        {
                            if (root == null) continue;
                            foreach (string name in root.GetSubKeyNames())
                            {
                                using (RegistryKey k = root.OpenSubKey(name))
                                {
                                    if (k == null) continue;
                                    string dn = k.GetValue("DisplayName") as string;
                                    if (dn == null || !(dn == AppName || dn.StartsWith(AppName + " "))) continue;
                                    string loc = k.GetValue("InstallLocation") as string;
                                    if (string.IsNullOrEmpty(loc))
                                    {
                                        string us = k.GetValue("UninstallString") as string;
                                        if (!string.IsNullOrEmpty(us))
                                        {
                                            int q = us.IndexOf('"', 1);
                                            string exe = us.StartsWith("\"") && q > 0 ? us.Substring(1, q - 1) : us;
                                            try { loc = Path.GetDirectoryName(exe); } catch { }
                                        }
                                    }
                                    if (string.IsNullOrEmpty(loc) || !Directory.Exists(loc)) continue;
                                    ExistingInstall e = new ExistingInstall();
                                    e.Version = (k.GetValue("DisplayVersion") as string) ?? "";
                                    e.Location = loc.TrimEnd('\\');
                                    e.AllUsers = hive == RegistryHive.LocalMachine;
                                    return e;
                                }
                            }
                        }
                    }
                    catch { }
                }
            }
            return null;
        }

        public static long DirSize(string path)
        {
            long total = 0;
            try
            {
                foreach (FileInfo f in new DirectoryInfo(path).GetFiles("*", SearchOption.AllDirectories))
                    total += f.Length;
            }
            catch { }
            return total;
        }

        public static string FormatBytes(long b)
        {
            if (b >= 1L << 30) return string.Format("{0:0.0} GB", b / (double)(1L << 30));
            return string.Format("{0:0} MB", b / (double)(1L << 20));
        }

        public static long FreeSpace(string path)
        {
            try { return new DriveInfo(Path.GetPathRoot(path)).AvailableFreeSpace; }
            catch { return long.MaxValue; }
        }

        public static void CloseApp()
        {
            foreach (string n in new string[] { "Jylli Tool", "JylliSensor" })
            {
                foreach (Process p in Process.GetProcessesByName(n))
                {
                    try
                    {
                        p.CloseMainWindow();
                        if (!p.WaitForExit(3000)) p.Kill();
                    }
                    catch { }
                }
            }
        }

        public static string ExtractPayload()
        {
            string dir = Path.Combine(Path.GetTempPath(), "JylliSetup-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            string file = Path.Combine(dir, "Jylli-Tool-Setup.exe");
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload"))
            {
                if (s == null) throw new InvalidOperationException("payload missing");
                using (FileStream o = File.Create(file)) s.CopyTo(o);
            }
            return file;
        }

        public static Process Start(string exe, string args)
        {
            ProcessStartInfo psi = new ProcessStartInfo(exe, args);
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            return Process.Start(psi);
        }

        public static void Launch(string dir)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(Path.Combine(dir, AppExe));
                psi.WorkingDirectory = dir;
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            catch { }
        }

        public static void RemoveShortcuts(bool desktop, bool startMenu)
        {
            string lnk = AppName + ".lnk";
            try
            {
                if (!desktop)
                {
                    Delete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), lnk));
                    Delete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory), lnk));
                }
                if (!startMenu)
                {
                    Delete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), lnk));
                    Delete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms), lnk));
                }
            }
            catch { }
        }

        static void Delete(string f)
        {
            try { if (File.Exists(f)) File.Delete(f); } catch { }
        }

        public static void DeleteDir(string d)
        {
            try { if (Directory.Exists(d)) Directory.Delete(d, true); } catch { }
        }

        // Removes folders after this process has exited (it may still be running from one of them).
        public static void ScheduleCleanup(IEnumerable<string> dirs)
        {
            try
            {
                string cmd = "/c ping 127.0.0.1 -n 3 >nul";
                foreach (string d in dirs) cmd += " & rmdir /s /q \"" + d + "\"";
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", cmd);
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process.Start(psi);
            }
            catch { }
        }
    }
}
