// Windows/.NET Framework native-messaging host. No network, shell execution,
// generic file commands or browser-profile access. stdout is protocol-only.
using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public sealed class TargetConfig { public Dictionary<string, string> Folders = new Dictionary<string, string>(); }
public sealed class BackupRecord { public string Name; public long CreatedAt; }
public sealed class BackupIndex { public int Version = 1; public string Owner; public List<BackupRecord> Files = new List<BackupRecord>(); }
public static class BackupHost {
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = Int32.MaxValue, RecursionLimit = 200 };
  static readonly Encoding Utf8 = new UTF8Encoding(false, true);
  static readonly Regex NamePattern = new Regex(@"^manga-shelf-\d{4}-\d{2}-\d{2}-[a-f0-9]{32}\.json$", RegexOptions.CultureInvariant);
  static string ConfigDir;
  static string ConfigPath { get { return Path.Combine(ConfigDir, "targets.json"); } }

  [STAThread] public static void Main(string[] args) {
    ConfigDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MangaShelf", "BackupHelper");
    // Explicit CLI override permits isolated protocol tests without touching a
    // real user's helper configuration. Browsers never supply this flag.
    if (args.Length == 2 && args[0] == "--config-dir") ConfigDir = Path.GetFullPath(args[1]);
    Stream input = Console.OpenStandardInput(), output = Console.OpenStandardOutput();
    while (true) {
      byte[] header = new byte[4];
      if (!ReadExactly(input, header, true)) return;
      uint length = BitConverter.ToUInt32(header, 0);
      if (length == 0 || length > 268435456) return;
      byte[] body = new byte[(int)length];
      if (!ReadExactly(input, body, false)) return;
      object result;
      try {
        var request = Json.Deserialize<Dictionary<string, object>>(Utf8.GetString(body));
        using (var mutex = new Mutex(false, @"Local\MangaShelf.BackupHelper")) {
          if (!mutex.WaitOne(TimeSpan.FromMinutes(5))) throw new Exception("HELPER_BUSY");
          try { result = Handle(request); } finally { mutex.ReleaseMutex(); }
        }
      } catch (Exception error) { result = new { ok = false, error = error is ArgumentException || error is InvalidOperationException ? "INVALID_BACKUP_REQUEST" : error.Message }; }
      byte[] reply = Utf8.GetBytes(Json.Serialize(result));
      output.Write(BitConverter.GetBytes((uint)reply.Length), 0, 4);
      output.Write(reply, 0, reply.Length); output.Flush();
    }
  }
  static bool ReadExactly(Stream stream, byte[] bytes, bool eofAllowed) {
    int offset = 0;
    while (offset < bytes.Length) {
      int read = stream.Read(bytes, offset, bytes.Length - offset);
      if (read == 0) return false;
      offset += read;
    }
    return true;
  }
  static string Text(Dictionary<string, object> request, string key) {
    object value; return request.TryGetValue(key, out value) ? Convert.ToString(value) : "";
  }
  static void RejectLink(string file) {
    if (File.Exists(file) && (File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) throw new Exception("LINKED_FILE_REJECTED");
  }
  static TargetConfig ReadConfig() {
    RejectLink(ConfigPath);
    return File.Exists(ConfigPath) ? Json.Deserialize<TargetConfig>(File.ReadAllText(ConfigPath, Utf8)) : new TargetConfig();
  }
  static void AtomicWrite(string path, string text, bool overwrite = true) {
    RejectLink(path);
    string temporary = path + ".tmp-" + Guid.NewGuid().ToString("N");
    try {
      using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
        byte[] bytes = Utf8.GetBytes(text); stream.Write(bytes, 0, bytes.Length); stream.Flush(true);
      }
      if (overwrite && File.Exists(path)) File.Replace(temporary, path, null); else File.Move(temporary, path);
    } finally { if (File.Exists(temporary)) File.Delete(temporary); }
  }
  static string Child(string folder, string name) {
    if (!NamePattern.IsMatch(name)) throw new Exception("INVALID_BACKUP_NAME");
    string target = Path.GetFullPath(Path.Combine(folder, name));
    if (!target.StartsWith(folder.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("INVALID_BACKUP_PATH");
    return target;
  }
  static string OwnerHash(string owner) {
    using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(Utf8.GetBytes(owner))).Replace("-", "").Substring(0, 24).ToLowerInvariant();
  }
  static object Handle(Dictionary<string, object> request) {
    string owner = Text(request, "owner"), action = Text(request, "action");
    if (owner != "manga-shelf@local.example" && owner != "manga-regal@local.example") throw new Exception("EXTENSION_NOT_ALLOWED");
    var config = ReadConfig();
    string folder;
    if (!config.Folders.TryGetValue(owner, out folder)) folder = "";
    if (action == "status") return new { ok = true, folder = folder, ready = folder.Length > 0 && Directory.Exists(folder), protocol = 1 };
    if (action == "choose") {
      using (var dialog = new FolderBrowserDialog()) {
        dialog.Description = "Manga Shelf: Zielordner fuer Sicherungen / Choose backup folder";
        dialog.ShowNewFolderButton = true;
        dialog.SelectedPath = Directory.Exists(folder) ? folder : Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        if (dialog.ShowDialog() != DialogResult.OK) return new { ok = true, cancelled = true, folder = folder };
        folder = Path.GetFullPath(dialog.SelectedPath);
        config.Folders[owner] = folder;
        Directory.CreateDirectory(ConfigDir);
        AtomicWrite(ConfigPath, Json.Serialize(config));
        return new { ok = true, folder = folder, ready = true };
      }
    }
    if (action != "save") throw new Exception("UNKNOWN_ACTION");
    if (!Directory.Exists(folder)) throw new Exception("FOLDER_PERMISSION_REQUIRED");
    folder = Path.GetFullPath(folder);
    string day = Text(request, "day");
    DateTime parsedDay;
    if (!DateTime.TryParseExact(day, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out parsedDay)) throw new Exception("INVALID_BACKUP_DAY");
    int limit;
    if (!Int32.TryParse(Text(request, "limit"), out limit) || limit < 1 || limit > 365) throw new Exception("INVALID_BACKUP_COUNT");
    string snapshot = Text(request, "snapshot");
    var data = Json.Deserialize<Dictionary<string, object>>(snapshot);
    object items;
    if (!data.TryGetValue("items", out items) || !(items is System.Collections.IList) || ((System.Collections.IList)items).Count == 0
      || !data.ContainsKey("settings") || !(data["settings"] is Dictionary<string, object>)) throw new Exception("EMPTY_OR_INVALID_BACKUP");
    string indexPath = Path.Combine(folder, ".manga-shelf-index-" + OwnerHash(owner) + ".json");
    RejectLink(indexPath);
    var index = File.Exists(indexPath) ? Json.Deserialize<BackupIndex>(File.ReadAllText(indexPath, Utf8)) : new BackupIndex { Owner = owner };
    if (index.Version != 1 || index.Owner != owner || index.Files == null || index.Files.Any(record => record == null || !NamePattern.IsMatch(record.Name))) throw new Exception("BACKUP_INDEX_INVALID");
    string name = "manga-shelf-" + day + "-" + Guid.NewGuid().ToString("N") + ".json";
    string filename = Child(folder, name);
    // Complete on disk before adding ownership or considering retention.
    AtomicWrite(filename, snapshot, false);
    index.Files.Add(new BackupRecord { Name = name, CreatedAt = DateTime.UtcNow.Ticks });
    AtomicWrite(indexPath, Json.Serialize(index));
    index.Files = index.Files.OrderBy(record => record.CreatedAt).ToList();
    string cleanupError = "";
    while (index.Files.Count > limit) {
      try {
        string old = Child(folder, index.Files[0].Name);
        RejectLink(old);
        if (File.Exists(old)) File.Delete(old);
        index.Files.RemoveAt(0);
      } catch (Exception error) { cleanupError = error.Message; break; }
    }
    AtomicWrite(indexPath, Json.Serialize(index));
    return new { ok = true, filename = filename, cleanupError = cleanupError };
  }
}
