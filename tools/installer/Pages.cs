using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace JylliSetup
{
    class SetupWindow
    {
        static readonly Dictionary<string, string[]> S = new Dictionary<string, string[]>
        {
            { "tagline",    new[] { "Tune. Monitor. Perform.", "Viritä. Seuraa. Suorita." } },
            { "w_title",    new[] { "Welcome to Jylli Tool", "Tervetuloa — Jylli Tool" } },
            { "w_sub",      new[] { "Everything you need to tune your PC, in one place. Setup takes about a minute.", "Kaikki mitä tarvitset koneesi viritykseen yhdessä paikassa. Asennus kestää noin minuutin." } },
            { "u_title",    new[] { "Update to v{0}", "Päivitä versioon {0}" } },
            { "u_sub",      new[] { "Version {0} is installed. Your settings are kept.", "Versio {0} on asennettu. Asetuksesi säilyvät." } },
            { "r_title",    new[] { "Repair Jylli Tool", "Korjaa Jylli Tool" } },
            { "r_sub",      new[] { "Reinstalls the program files. Your settings are kept.", "Asentaa ohjelmatiedostot uudelleen. Asetuksesi säilyvät." } },
            { "b_install",  new[] { "Install", "Asenna" } },
            { "b_update",   new[] { "Update", "Päivitä" } },
            { "b_repair",   new[] { "Repair", "Korjaa" } },
            { "b_custom",   new[] { "Customize", "Mukauta" } },
            { "b_cancel",   new[] { "Cancel", "Peruuta" } },
            { "b_browse",   new[] { "Browse", "Selaa" } },
            { "b_close",    new[] { "Close", "Sulje" } },
            { "b_launch",   new[] { "Launch Jylli Tool", "Käynnistä Jylli Tool" } },
            { "b_retry",    new[] { "Retry", "Yritä uudelleen" } },
            { "location",   new[] { "INSTALL LOCATION", "ASENNUSKANSIO" } },
            { "o_desktop",  new[] { "Create a desktop shortcut", "Luo työpöydän pikakuvake" } },
            { "o_start",    new[] { "Add to the Start menu", "Lisää Käynnistä-valikkoon" } },
            { "o_launch",   new[] { "Launch Jylli Tool when finished", "Käynnistä Jylli Tool valmistuttua" } },
            { "space",      new[] { "{0} required · {1} free", "{0} tarvitaan · {1} vapaana" } },
            { "nospace",    new[] { "Not enough free space on this drive", "Levyllä ei ole tarpeeksi tilaa" } },
            { "p_install",  new[] { "Installing…", "Asennetaan…" } },
            { "p_update",   new[] { "Updating…", "Päivitetään…" } },
            { "st_close",   new[] { "Closing the running app…", "Suljetaan käynnissä oleva sovellus…" } },
            { "st_prep",    new[] { "Preparing…", "Valmistellaan…" } },
            { "st_files",   new[] { "Installing files…", "Asennetaan tiedostoja…" } },
            { "st_final",   new[] { "Finishing up…", "Viimeistellään…" } },
            { "st_remove",  new[] { "Removing files…", "Poistetaan tiedostoja…" } },
            { "d_title",    new[] { "You're all set", "Kaikki valmista" } },
            { "d_sub",      new[] { "Jylli Tool v{0} is ready to go.", "Jylli Tool v{0} on käyttövalmis." } },
            { "e_title",    new[] { "Something went wrong", "Jokin meni pieleen" } },
            { "e_text",     new[] { "Setup exited with code {0}. Close any running copy of Jylli Tool and try again.", "Asennus päättyi koodiin {0}. Sulje käynnissä oleva Jylli Tool ja yritä uudelleen." } },
            { "un_title",   new[] { "Uninstall Jylli Tool", "Poista Jylli Tool" } },
            { "un_sub",     new[] { "Version {0} will be removed from this PC.", "Versio {0} poistetaan tältä koneelta." } },
            { "un_data",    new[] { "Also remove my settings, backups and logs", "Poista myös asetukseni, varmuuskopiot ja lokit" } },
            { "un_btn",     new[] { "Uninstall", "Poista" } },
            { "un_prog",    new[] { "Uninstalling…", "Poistetaan…" } },
            { "un_done",    new[] { "Jylli Tool has been removed", "Jylli Tool on poistettu" } },
            { "un_done_s",  new[] { "Thanks for trying it. You can close this window.", "Kiitos kun kokeilit. Voit sulkea tämän ikkunan." } },
            { "s1t",        new[] { "One-click tweaks", "Säädöt yhdellä klikkauksella" } },
            { "s1d",        new[] { "Dozens of Windows tweaks, each one journaled so it can be reverted.", "Kymmeniä Windows-säätöjä, jokainen kirjataan jotta sen voi perua." } },
            { "s2t",        new[] { "Live hardware monitor", "Laitteiston reaaliaikaseuranta" } },
            { "s2d",        new[] { "CPU, GPU, RAM and disk sensors with an in-game FPS overlay.", "CPU-, GPU-, RAM- ja levyanturit sekä FPS-näyttö pelissä." } },
            { "s3t",        new[] { "Deep clean", "Perusteellinen siivous" } },
            { "s3d",        new[] { "Clear temp files, purge standby RAM and debloat Windows safely.", "Tyhjennä väliaikaiset tiedostot, vapauta valmiustilan RAM ja poista turhat ohjelmat turvallisesti." } },
            { "s4t",        new[] { "Built for games", "Tehty peleille" } },
            { "s4d",        new[] { "Per-game profiles for Valorant, CS2, Fortnite, FiveM and more.", "Pelikohtaiset profiilit: Valorant, CS2, Fortnite, FiveM ja muut." } },
            { "s5t",        new[] { "Always reversible", "Aina peruttavissa" } },
            { "s5d",        new[] { "Every change is recorded. Undo anything, any time.", "Jokainen muutos kirjataan. Perut mitä vain, milloin vain." } }
        };

        static readonly string[] SlideGlyph = { "", "", "", "", "" };

        readonly Window w;
        readonly bool un;
        readonly string fromDir;
        readonly ExistingInstall ex;
        readonly List<System.Windows.Shapes.Ellipse> dots = new List<System.Windows.Shapes.Ellipse>();
        readonly DispatcherTimer carousel = new DispatcherTimer();
        int lang;
        string installDir;
        Grid cur;
        bool busy;
        bool custom;
        int slide;
        double lastPct;
        int lastCode;
        bool removed;

        public Window Window { get { return w; } }

        public SetupWindow(bool uninstall, string from)
        {
            un = uninstall;
            fromDir = from;
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("ui.xaml"))
                w = (Window)XamlReader.Load(s);

            lang = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "fi" ? 1 : 0;
            ex = un ? null : Engine.FindExisting();
            installDir = ex != null ? ex.Location
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", Engine.AppName);

            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("icon.png"))
            {
                BitmapImage bi = new BitmapImage();
                bi.BeginInit();
                bi.StreamSource = s;
                bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.EndInit();
                bi.Freeze();
                G<Image>("BrandIcon").Source = bi;
                w.Icon = bi;
            }

            Wire();
            ApplyTexts();
            BuildDots();
            AmbientAnimation();
            carousel.Interval = TimeSpan.FromSeconds(4);
            carousel.Tick += delegate { NextSlide(); };

            cur = G<Grid>("PageWelcome");
            w.Loaded += delegate { Animate(cur); };
        }

        T G<T>(string name) where T : class
        {
            return (T)w.FindName(name);
        }

        string T(string key, params object[] a)
        {
            string v = S[key][lang];
            return a.Length == 0 ? v : string.Format(v, a);
        }

        string KindKey()
        {
            if (ex == null) return "i";
            Version a, b;
            if (Version.TryParse(ex.Version, out a) && Version.TryParse(BuildInfo.Version, out b) && a == b) return "r";
            return "u";
        }

        void Wire()
        {
            MouseButtonEventHandler drag = delegate(object s, MouseButtonEventArgs e) { try { w.DragMove(); } catch { } };
            G<Grid>("TitleBar").MouseLeftButtonDown += drag;
            G<Border>("DragLeft").MouseLeftButtonDown += drag;
            G<Button>("BtnMin").Click += delegate { w.WindowState = WindowState.Minimized; };
            G<Button>("BtnX").Click += delegate { TryClose(); };
            G<Button>("BtnCancel").Click += delegate { TryClose(); };
            G<Button>("BtnDoneClose").Click += delegate { w.Close(); };
            G<Button>("BtnErrClose").Click += delegate { w.Close(); };
            G<Button>("BtnLang").Click += delegate { lang = 1 - lang; ApplyTexts(); };
            G<Button>("BtnPrimary").Click += delegate { StartWork(); };
            G<Button>("BtnRetry").Click += delegate { busy = false; StartWork(); };
            G<Button>("BtnLaunch").Click += delegate { Engine.Launch(installDir); w.Close(); };
            G<Button>("BtnCustomize").Click += delegate
            {
                custom = !custom;
                G<Border>("PanelOptions").Visibility = custom ? Visibility.Visible : Visibility.Collapsed;
                ApplyTexts();
            };
            G<Button>("BtnBrowse").Click += delegate { Browse(); };
        }

        void TryClose()
        {
            if (!busy) w.Close();
        }

        void Browse()
        {
            using (System.Windows.Forms.FolderBrowserDialog d = new System.Windows.Forms.FolderBrowserDialog())
            {
                d.SelectedPath = installDir;
                d.ShowNewFolderButton = true;
                if (d.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
                string p = d.SelectedPath.TrimEnd('\\');
                installDir = p.EndsWith(Engine.AppName, StringComparison.OrdinalIgnoreCase) ? p : Path.Combine(p, Engine.AppName);
                ApplyTexts();
            }
        }

        void ApplyTexts()
        {
            string k = KindKey();
            G<TextBlock>("BrandTagline").Text = T("tagline");
            G<TextBlock>("BrandVersion").Text = "v" + BuildInfo.Version;
            G<Button>("BtnLang").Content = lang == 0 ? "EN · fi" : "en · FI";
            G<Button>("BtnCancel").Content = T("b_cancel");
            G<Button>("BtnBrowse").Content = T("b_browse");
            G<Button>("BtnDoneClose").Content = T("b_close");
            G<Button>("BtnErrClose").Content = T("b_close");
            G<Button>("BtnLaunch").Content = T("b_launch");
            G<Button>("BtnRetry").Content = T("b_retry");
            G<TextBlock>("LblLocation").Text = T("location");
            G<CheckBox>("ChkDesktop").Content = T("o_desktop");
            G<CheckBox>("ChkStart").Content = T("o_start");
            G<CheckBox>("ChkLaunch").Content = T("o_launch");
            G<CheckBox>("ChkRemove").Content = T("un_data");
            G<TextBlock>("PathText").Text = installDir;
            G<TextBlock>("ErrTitle").Text = T("e_title");
            G<TextBlock>("ErrText").Text = T("e_text", lastCode);

            Button prim = G<Button>("BtnPrimary");
            Button cust = G<Button>("BtnCustomize");
            Border panel = G<Border>("PanelOptions");
            if (un)
            {
                G<TextBlock>("WelcomeTitle").Text = T("un_title");
                G<TextBlock>("WelcomeSub").Text = T("un_sub", BuildInfo.Version);
                prim.Content = T("un_btn");
                cust.Visibility = Visibility.Collapsed;
                panel.Visibility = Visibility.Visible;
                G<StackPanel>("PathBlock").Visibility = Visibility.Collapsed;
                G<StackPanel>("OptBlock").Visibility = Visibility.Collapsed;
                G<CheckBox>("ChkRemove").Visibility = Visibility.Visible;
                G<TextBlock>("ProgTitle").Text = T("un_prog");
                G<TextBlock>("DoneTitle").Text = T("un_done");
                G<TextBlock>("DoneSub").Text = T("un_done_s");
                G<Button>("BtnLaunch").Visibility = Visibility.Collapsed;
                G<Border>("CarouselCard").Visibility = Visibility.Collapsed;
                return;
            }

            cust.Content = T("b_custom");
            G<TextBlock>("ProgTitle").Text = T(k == "u" ? "p_update" : "p_install");
            G<TextBlock>("DoneTitle").Text = T("d_title");
            G<TextBlock>("DoneSub").Text = T("d_sub", BuildInfo.Version);
            if (k == "i")
            {
                G<TextBlock>("WelcomeTitle").Text = T("w_title");
                G<TextBlock>("WelcomeSub").Text = T("w_sub");
                prim.Content = T("b_install");
                long need = BuildInfo.UnpackedSize, free = Engine.FreeSpace(installDir);
                G<TextBlock>("SpaceText").Text = free < need ? T("nospace") : T("space", Engine.FormatBytes(need), Engine.FormatBytes(free));
                prim.IsEnabled = free >= need;
            }
            else
            {
                G<TextBlock>("WelcomeTitle").Text = T(k + "_title", BuildInfo.Version);
                G<TextBlock>("WelcomeSub").Text = T(k + "_sub", ex.Version);
                prim.Content = T(k == "u" ? "b_update" : "b_repair");
                cust.Visibility = Visibility.Collapsed;
                panel.Visibility = Visibility.Collapsed;
            }
        }

        // ---- pages -------------------------------------------------------------------------

        void Show(Grid next)
        {
            Grid old = cur;
            if (old == next) return;
            cur = next;
            if (old == null) { Animate(next); return; }
            DoubleAnimation fo = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(140));
            fo.Completed += delegate { old.Visibility = Visibility.Collapsed; Animate(next); };
            old.BeginAnimation(UIElement.OpacityProperty, fo);
        }

        void Animate(Grid next)
        {
            next.Visibility = Visibility.Visible;
            next.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(280)));
            TranslateTransform tt = (TranslateTransform)next.RenderTransform;
            DoubleAnimation da = new DoubleAnimation(16, 0, TimeSpan.FromMilliseconds(340));
            da.EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut };
            tt.BeginAnimation(TranslateTransform.YProperty, da);
        }

        void AmbientAnimation()
        {
            TranslateTransform a = G<TranslateTransform>("GlowAT"), b = G<TranslateTransform>("GlowBT");
            Action<TranslateTransform, DependencyProperty, double, double, double> loop = delegate(TranslateTransform t, DependencyProperty p, double from, double to, double secs)
            {
                DoubleAnimation d = new DoubleAnimation(from, to, TimeSpan.FromSeconds(secs));
                d.AutoReverse = true;
                d.RepeatBehavior = RepeatBehavior.Forever;
                d.EasingFunction = new SineEase { EasingMode = EasingMode.EaseInOut };
                t.BeginAnimation(p, d);
            };
            loop(a, TranslateTransform.XProperty, -20, 50, 9);
            loop(a, TranslateTransform.YProperty, -10, 40, 11);
            loop(b, TranslateTransform.XProperty, 30, -50, 10);
            loop(b, TranslateTransform.YProperty, 20, -40, 12);
        }

        // ---- carousel ----------------------------------------------------------------------

        void BuildDots()
        {
            StackPanel sp = G<StackPanel>("Dots");
            for (int i = 0; i < SlideGlyph.Length; i++)
            {
                System.Windows.Shapes.Ellipse e = new System.Windows.Shapes.Ellipse();
                e.Width = 7; e.Height = 7; e.Margin = new Thickness(0, 0, 8, 0);
                sp.Children.Add(e);
                dots.Add(e);
            }
            SetSlide(0);
        }

        void SetSlide(int i)
        {
            slide = i;
            G<TextBlock>("SlideIcon").Text = SlideGlyph[i];
            G<TextBlock>("SlideTitle").Text = T("s" + (i + 1) + "t");
            G<TextBlock>("SlideText").Text = T("s" + (i + 1) + "d");
            for (int d = 0; d < dots.Count; d++)
                dots[d].Fill = new SolidColorBrush(d == i ? Color.FromRgb(0x8B, 0x7C, 0xF6) : Color.FromRgb(0x3A, 0x3A, 0x42));
        }

        void NextSlide()
        {
            StackPanel body = G<StackPanel>("SlideBody");
            DoubleAnimation fo = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(220));
            fo.Completed += delegate
            {
                SetSlide((slide + 1) % SlideGlyph.Length);
                body.BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(320)));
            };
            body.BeginAnimation(UIElement.OpacityProperty, fo);
        }

        // ---- work --------------------------------------------------------------------------

        void Post(Action a)
        {
            w.Dispatcher.BeginInvoke(a);
        }

        void SetProgress(double p, string statusKey)
        {
            if (p < lastPct) p = lastPct;
            lastPct = p;
            double full = G<Border>("Track").ActualWidth;
            G<Border>("Fill").BeginAnimation(FrameworkElement.WidthProperty, new DoubleAnimation(full * p, TimeSpan.FromMilliseconds(300)));
            G<TextBlock>("ProgPct").Text = ((int)(p * 100)) + "%";
            if (statusKey != null) G<TextBlock>("ProgStatus").Text = T(statusKey);
        }

        void StartWork()
        {
            if (busy) return;
            busy = true;
            lastPct = 0;
            G<Border>("Fill").BeginAnimation(FrameworkElement.WidthProperty, null);
            G<Border>("Fill").Width = 0;
            G<TextBlock>("ProgPct").Text = "0%";
            G<TextBlock>("ProgStatus").Text = T("st_prep");
            Show(G<Grid>("PageProgress"));
            if (!un) carousel.Start();

            string dir = installDir;
            bool desk = G<CheckBox>("ChkDesktop").IsChecked == true;
            bool start = G<CheckBox>("ChkStart").IsChecked == true;
            bool launch = G<CheckBox>("ChkLaunch").IsChecked == true;
            bool removeData = G<CheckBox>("ChkRemove").IsChecked == true;
            Thread t = new Thread(delegate()
            {
                int code;
                try { code = un ? RunUninstall(dir, removeData) : RunInstall(dir, desk, start); }
                catch { code = -1; }
                Post(delegate { Finish(code, launch); });
            });
            t.IsBackground = true;
            t.Start();
        }

        int RunInstall(string dir, bool desk, bool start)
        {
            Post(delegate { SetProgress(0.01, "st_close"); });
            Engine.CloseAppIn(dir);
            Post(delegate { SetProgress(0.03, "st_prep"); });
            string payload = Engine.ExtractPayload();
            string mode = (ex != null && ex.AllUsers) ? "/allusers" : "/currentuser";
            int code = -1;
            // The old version's uninstaller can still fail on a lock that is released a moment later: close everything again and retry once.
            for (int attempt = 0; attempt < 2; attempt++)
            {
                Process p = Engine.Start(payload, "/S " + mode + " /D=" + dir);
                Stopwatch sw = Stopwatch.StartNew();
                while (!p.WaitForExit(300))
                {
                    double pr = ex == null
                        ? Math.Min(0.95, (double)Engine.DirSize(dir) / Math.Max(1, BuildInfo.UnpackedSize))
                        : 0.93 * (1 - Math.Exp(-sw.Elapsed.TotalSeconds / 18));
                    string key = pr < 0.04 ? "st_prep" : (pr < 0.9 ? "st_files" : "st_final");
                    Post(delegate { SetProgress(pr, key); });
                }
                code = p.ExitCode;
                if (code == 0) break;
                Engine.CloseAppIn(dir);
                System.Threading.Thread.Sleep(2000);
            }
            try { Directory.Delete(Path.GetDirectoryName(payload), true); } catch { }
            if (code == 0 && ex == null) Engine.RemoveShortcuts(desk, start);
            return code;
        }

        int RunUninstall(string dir, bool removeData)
        {
            Post(delegate { SetProgress(0.02, "st_close"); });
            Engine.CloseApp();
            string nsis = Path.Combine(dir, Engine.NsisUninstaller);
            if (!File.Exists(nsis)) return -2;
            long initial = Math.Max(1, Engine.DirSize(dir));
            string mode = ReadMode();
            Process p = Engine.Start(nsis, "/S " + mode + " _?=" + dir);
            while (!p.WaitForExit(300))
            {
                double pr = Math.Min(0.95, 1.0 - (double)Engine.DirSize(dir) / initial);
                Post(delegate { SetProgress(pr, "st_remove"); });
            }
            int code = p.ExitCode;
            if (code == 0 && removeData)
                Engine.DeleteDir(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), Engine.AppName));
            return code;
        }

        string ReadMode()
        {
            foreach (string a in Environment.GetCommandLineArgs())
            {
                if (string.Equals(a, "/allusers", StringComparison.OrdinalIgnoreCase)) return "/allusers";
            }
            return "/currentuser";
        }

        void Finish(int code, bool launch)
        {
            carousel.Stop();
            busy = false;
            if (code != 0)
            {
                lastCode = code;
                ApplyTexts();
                Show(G<Grid>("PageError"));
                return;
            }
            removed = un;
            SetProgress(1, null);
            DispatcherTimer t = new DispatcherTimer();
            t.Interval = TimeSpan.FromMilliseconds(450);
            t.Tick += delegate
            {
                t.Stop();
                Show(G<Grid>("PageDone"));
                if (un) return;
                if (launch) Engine.Launch(installDir);
                DispatcherTimer close = new DispatcherTimer();
                close.Interval = TimeSpan.FromMilliseconds(2200);
                close.Tick += delegate { close.Stop(); w.Close(); };
                close.Start();
            };
            t.Start();
        }

        public void OnExit()
        {
            if (!un || fromDir == null || !removed) return;
            List<string> dirs = new List<string>();
            dirs.Add(fromDir);
            string self = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (!string.Equals(self, fromDir, StringComparison.OrdinalIgnoreCase)) dirs.Add(self);
            Engine.ScheduleCleanup(dirs);
        }
    }
}
