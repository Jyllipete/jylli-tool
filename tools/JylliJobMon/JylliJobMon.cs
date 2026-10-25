// JylliJobMon.cs — per-thread CPU affinity monitor for Jylli Tool
// Build: csc /target:exe /optimize /unsafe /out:JylliJobMon.exe JylliJobMon.cs
// Usage: JylliJobMon.exe <pid>
// Output exe goes to: assets/jobmon/JylliJobMon.exe

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

class JylliJobMon
{
    // ─── Win32 P/Invoke ──────────────────────────────────────────────────────
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool   CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern uint   WaitForSingleObject(IntPtr handle, uint ms);
    [DllImport("ntdll.dll")]    static extern int    NtQuerySystemInformation(int cls, IntPtr buf, uint len, out uint ret);

    const uint PROCESS_QUERY_INFORMATION = 0x0400;
    const uint SYNCHRONIZE               = 0x00100000;
    const uint WAIT_OBJECT_0             = 0;
    const int  SystemProcessInformation  = 5;

    // Matches SYSTEM_THREAD_INFORMATION layout (64-bit)
    [StructLayout(LayoutKind.Sequential)]
    struct THREAD_INFO
    {
        public long   KernelTime;
        public long   UserTime;
        public long   CreateTime;
        public uint   WaitTime;
        public IntPtr StartAddress;
        public IntPtr UniqueProcess;
        public IntPtr UniqueThread;
        public int    Priority;
        public int    BasePriority;
        public uint   ContextSwitches;
        public uint   ThreadState;
        public uint   WaitReason;
        public uint   Padding;
    }

    // Minimal SYSTEM_PROCESS_INFORMATION (variable-size; we walk manually)
    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_INFO_HEADER
    {
        public uint   NextEntryOffset;
        public uint   NumberOfThreads;
        public long   WorkingSetPrivateSize;
        public uint   HardFaultCount;
        public uint   NumberOfThreadsHighWatermark;
        public ulong  CycleTime;
        public long   CreateTime;
        public long   UserTime;
        public long   KernelTime;
        public ushort ImageNameLength;
        public ushort ImageNameMaxLength;
        public IntPtr ImageNameBuffer;
        public int    BasePriority;
        public IntPtr UniqueProcessId;
        public IntPtr InheritedFromUniqueProcessId;
        public uint   HandleCount;
        public uint   SessionId;
        public IntPtr PageDirectoryBase;
        public IntPtr PeakVirtualSize;
        public IntPtr VirtualSize;
        public uint   PageFaultCount;
        public IntPtr PeakWorkingSetSize;
        public IntPtr WorkingSetSize;
        public IntPtr QuotaPeakPagedPoolUsage;
        public IntPtr QuotaPagedPoolUsage;
        public IntPtr QuotaPeakNonPagedPoolUsage;
        public IntPtr QuotaNonPagedPoolUsage;
        public IntPtr PagefileUsage;
        public IntPtr PeakPagefileUsage;
        public IntPtr PrivatePageCount;
        public long   ReadOperationCount;
        public long   WriteOperationCount;
        public long   OtherOperationCount;
        public long   ReadTransferCount;
        public long   WriteTransferCount;
        public long   OtherTransferCount;
        // SYSTEM_THREAD_INFORMATION[] follows
    }

    // ─── Thread name via GetThreadDescription (Win10+) ───────────────────────
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool OpenThread(uint access, bool inherit, uint tid, out IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true, ExactSpelling=true)]
    static extern IntPtr OpenThread(uint access, bool inherit, uint tid);

    [DllImport("kernel32.dll")]
    static extern int GetThreadDescription(IntPtr hThread, out IntPtr desc);
    [DllImport("kernel32.dll")]
    static extern IntPtr LocalFree(IntPtr h);
    const uint THREAD_QUERY_LIMITED_INFORMATION = 0x0800;

    static string GetThreadName(uint tid)
    {
        try
        {
            var h = OpenThread(THREAD_QUERY_LIMITED_INFORMATION, false, tid);
            if (h == IntPtr.Zero) return "";
            IntPtr desc;
            int hr = GetThreadDescription(h, out desc);
            CloseHandle(h);
            if (hr < 0 || desc == IntPtr.Zero) return "";
            string name = Marshal.PtrToStringUni(desc);
            LocalFree(desc);
            return name ?? "";
        }
        catch { return ""; }
    }

    // ─── Entry point ─────────────────────────────────────────────────────────
    static void Main(string[] args)
    {
        int targetPid;
        if (args.Length < 1 || !int.TryParse(args[0], out targetPid)) return;

        var procHandle = OpenProcess(PROCESS_QUERY_INFORMATION | SYNCHRONIZE, false, targetPid);
        if (procHandle == IntPtr.Zero) return;

        while (true)
        {
            var pipe = new NamedPipeServerStream(
                "JylliJobMon",
                PipeDirection.Out,
                1,
                PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous,
                0, 65536);

            try
            {
                pipe.WaitForConnection();
                MonitorLoop(pipe, procHandle, targetPid);
            }
            catch { }
            finally { try { pipe.Close(); pipe.Dispose(); } catch {} }

            if (WaitForSingleObject(procHandle, 0) == WAIT_OBJECT_0) break;
            Thread.Sleep(200);
        }

        CloseHandle(procHandle);
    }

    static void MonitorLoop(NamedPipeServerStream pipe, IntPtr procHandle, int targetPid)
    {
        var prevTimes = new Dictionary<uint, long>();  // tid → last KernelTime+UserTime
        var nameCache = new Dictionary<uint, string>();
        var sw = Stopwatch.StartNew();
        long prevTick = sw.ElapsedMilliseconds;

        while (pipe.IsConnected)
        {
            if (WaitForSingleObject(procHandle, 0) == WAIT_OBJECT_0) break;

            long nowTick     = sw.ElapsedMilliseconds;
            double elapsedMs = Math.Max(1, nowTick - prevTick);
            prevTick         = nowTick;

            var threads = GetProcessThreads(targetPid);
            if (threads == null) break;

            using (var ms = new MemoryStream(threads.Count * 16))
            using (var bw = new BinaryWriter(ms))
            {
                foreach (var t in threads)
                {
                    long pv;
                    long prevCpuTime = prevTimes.TryGetValue(t.Tid, out pv) ? pv : 0;
                    long delta       = Math.Max(0, t.CpuTime - prevCpuTime);
                    prevTimes[t.Tid] = t.CpuTime;
                    // Convert 100ns units to % over elapsed window (single logical CPU)
                    float cpuPct = (float)(delta / 1e5 / elapsedMs * 100f);
                    cpuPct = Math.Min(100f, Math.Max(0f, cpuPct));

                    string name;
                    if (!nameCache.TryGetValue(t.Tid, out name))
                    {
                        name = GetThreadName(t.Tid);
                        if (!string.IsNullOrEmpty(name)) nameCache[t.Tid] = name;
                    }

                    byte[] nameBytes = string.IsNullOrEmpty(name) ? new byte[0] : Encoding.UTF8.GetBytes(name.Length > 64 ? name.Substring(0, 64) : name);
                    bw.Write((uint)t.Tid);
                    bw.Write((byte)(t.CurrentCpu & 0xFF));
                    bw.Write(cpuPct);
                    bw.Write((byte)nameBytes.Length);
                    bw.Write(nameBytes);
                }
                // Frame sentinel
                bw.Write((byte)0xFF);
                bw.Flush();

                byte[] frame = ms.ToArray();
                try { pipe.Write(frame, 0, frame.Length); pipe.Flush(); }
                catch { break; }
            }

            Thread.Sleep(100);
        }
    }

    struct ThreadEntry { public uint Tid; public byte CurrentCpu; public long CpuTime; }

    static List<ThreadEntry> GetProcessThreads(int targetPid)
    {
        // Query NtQuerySystemInformation with exponential buffer growth
        int bufSize = 1 << 20;  // start at 1MB
        while (bufSize <= 64 << 20)
        {
            IntPtr buf = Marshal.AllocHGlobal(bufSize);
            try
            {
                uint returned;
                int status = NtQuerySystemInformation(SystemProcessInformation, buf, (uint)bufSize, out returned);
                if (status == unchecked((int)0xC0000004)) { bufSize <<= 1; continue; }  // STATUS_INFO_LENGTH_MISMATCH
                if (status != 0) return null;

                var result = new List<ThreadEntry>();
                IntPtr ptr = buf;
                while (true)
                {
                    var header = Marshal.PtrToStructure<PROCESS_INFO_HEADER>(ptr);
                    long pid = header.UniqueProcessId.ToInt64();

                    if (pid == targetPid && header.NumberOfThreads > 0)
                    {
                        int headerSize  = Marshal.SizeOf<PROCESS_INFO_HEADER>();
                        int threadSize  = Marshal.SizeOf<THREAD_INFO>();
                        for (int i = 0; i < (int)header.NumberOfThreads; i++)
                        {
                            IntPtr tPtr = IntPtr.Add(ptr, headerSize + i * threadSize);
                            var ti = Marshal.PtrToStructure<THREAD_INFO>(tPtr);
                            result.Add(new ThreadEntry
                            {
                                Tid        = (uint)ti.UniqueThread.ToInt64(),
                                CurrentCpu = (byte)(Environment.ProcessorCount > 0 ? ti.WaitReason % Environment.ProcessorCount : 0),
                                CpuTime    = ti.KernelTime + ti.UserTime,
                            });
                        }
                        break;
                    }

                    if (header.NextEntryOffset == 0) break;
                    ptr = IntPtr.Add(ptr, (int)header.NextEntryOffset);
                }
                return result;
            }
            finally { Marshal.FreeHGlobal(buf); }
        }
        return null;
    }
}
