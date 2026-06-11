// JylliSensor.cs — 1000Hz LHM named-pipe sensor bridge for Jylli Tool
// Build: csc /target:exe /optimize /out:JylliSensor.exe JylliSensor.cs
//        /reference:LibreHardwareMonitorLib.dll
// Place LibreHardwareMonitorLib.dll alongside this .cs during compilation.
// Output exe goes to: assets/sensor/JylliSensor.exe

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using LibreHardwareMonitor.Hardware;

class JylliSensor
{
    // Sensor IDs in fixed order — must match the schema emitted in the handshake
    static readonly string[] SENSOR_ORDER = {
        "cpu_package_temp",
        "cpu_core_max",
        "cpu_power",
        "gpu_core_temp",
        "gpu_hotspot_temp",
        "gpu_power",
        "gpu_usage",
        "cpu_usage",
        "ram_usage",
        "gpu_mem_usage",
    };

    static float[] _values = new float[SENSOR_ORDER.Length];

    static void Main(string[] args)
    {
        var computer = new Computer
        {
            IsCpuEnabled        = true,
            IsGpuEnabled        = true,
            IsMemoryEnabled     = true,
            IsMotherboardEnabled = false,
            IsControllerEnabled  = false,
            IsNetworkEnabled     = false,
            IsStorageEnabled     = false,
        };

        try { computer.Open(); }
        catch { return; }

        // Build schema JSON once
        var schemaItems = new List<string>();
        for (int i = 0; i < SENSOR_ORDER.Length; i++)
            schemaItems.Add("{\"id\":\"" + SENSOR_ORDER[i] + "\",\"idx\":" + i + "}");
        byte[] schemaLine = Encoding.UTF8.GetBytes("[" + string.Join(",", schemaItems) + "]\n");

        // Frame buffer: N sensors × 4 bytes each
        byte[] frameBuf = new byte[SENSOR_ORDER.Length * 4];

        while (true)
        {
            NamedPipeServerStream pipe = null;
            try
            {
                pipe = new NamedPipeServerStream(
                    "JylliSensor",
                    PipeDirection.Out,
                    1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous,
                    0, 65536);

                pipe.WaitForConnection();

                // Send schema handshake
                pipe.Write(schemaLine, 0, schemaLine.Length);
                pipe.Flush();

                // 1000Hz sensor loop
                while (pipe.IsConnected)
                {
                    try { computer.Accept(new SensorVisitor(ref _values)); }
                    catch { }

                    // Pack float32 values into frame buffer
                    for (int i = 0; i < _values.Length; i++)
                        Buffer.BlockCopy(BitConverter.GetBytes(_values[i]), 0, frameBuf, i * 4, 4);

                    try
                    {
                        pipe.Write(frameBuf, 0, frameBuf.Length);
                        pipe.Flush();
                    }
                    catch { break; }

                    Thread.Sleep(1);  // ~1000Hz
                }
            }
            catch { }
            finally
            {
                try { if (pipe != null) { pipe.Close(); pipe.Dispose(); } } catch { }
            }
            // If pipe closed, wait briefly then accept next connection
            Thread.Sleep(100);
        }
    }
}

class SensorVisitor : IVisitor
{
    private float[] _vals;

    public SensorVisitor(ref float[] vals) { _vals = vals; }

    public void VisitComputer(IComputer computer)  { computer.Traverse(this); }
    public void VisitParameter(IParameter p)       { }
    public void VisitHardware(IHardware hardware)
    {
        hardware.Update();
        foreach (var sub in hardware.SubHardware)
            sub.Accept(this);
        hardware.Traverse(this);
    }
    public void VisitSensor(ISensor sensor)
    {
        if (!sensor.Value.HasValue) return;
        float v = sensor.Value.Value;

        switch (sensor.Hardware.HardwareType)
        {
            case HardwareType.Cpu:
                if (sensor.SensorType == SensorType.Temperature)
                {
                    if (sensor.Name.Contains("Package") || sensor.Name.Contains("CPU Package"))
                        _vals[0] = v;  // cpu_package_temp
                    if (sensor.Name.StartsWith("Core #") || sensor.Name.Contains("Core Max"))
                        _vals[1] = Math.Max(_vals[1], v);  // cpu_core_max (running max)
                }
                else if (sensor.SensorType == SensorType.Power && sensor.Name.Contains("Package"))
                    _vals[2] = v;  // cpu_power
                else if (sensor.SensorType == SensorType.Load && sensor.Name.Contains("Total"))
                    _vals[7] = v;  // cpu_usage
                break;

            case HardwareType.GpuNvidia:
            case HardwareType.GpuAmd:
            case HardwareType.GpuIntel:
                if (sensor.SensorType == SensorType.Temperature)
                {
                    if (sensor.Name.Contains("Core") || sensor.Name == "GPU Core")
                        _vals[3] = v;  // gpu_core_temp
                    else if (sensor.Name.Contains("Hot Spot") || sensor.Name.Contains("Junction"))
                        _vals[4] = v;  // gpu_hotspot_temp
                }
                else if (sensor.SensorType == SensorType.Power && sensor.Name.Contains("Total"))
                    _vals[5] = v;  // gpu_power
                else if (sensor.SensorType == SensorType.Load)
                {
                    if (sensor.Name.Contains("Core") || sensor.Name == "GPU Core")
                        _vals[6] = v;  // gpu_usage
                    else if (sensor.Name.Contains("Memory"))
                        _vals[9] = v;  // gpu_mem_usage
                }
                break;

            case HardwareType.Memory:
                if (sensor.SensorType == SensorType.Load && sensor.Name.Contains("Memory"))
                    _vals[8] = v;  // ram_usage
                break;
        }
        // Reset per-frame max for cpu_core_max (will re-accumulate next visit)
    }
}
