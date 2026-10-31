package tv.moonga.recorder.v3;

import com.google.gson.Gson;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.StandardOpenOption;
import net.runelite.client.util.Filepath;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/** Only immutable JSON strings cross into the disk worker. Never blocks the game thread. */
final class Recording {
  private final BlockingQueue<String> queue = new ArrayBlockingQueue<>(8192);
  private final Gson gson;
  private final AtomicLong dropped = new AtomicLong();
  private final CompletableFuture<Filepath> finished = new CompletableFuture<>();
  private volatile boolean closing;
  private volatile String error;
  final Filepath path;
  private final long start = System.nanoTime();
  private long sequence;

  Recording(Filepath directory, Gson gson) throws IOException {
    this.gson = gson;
    directory.createDirectories();
    path =
        directory.join(
            "combat-v3-"
                + java.time.Instant.now().toString().replace(':', '-')
                + "-"
                + UUID.randomUUID().toString().substring(0, 8)
                + ".jsonl");
    // Open synchronously on a worker before Record is enabled.
    BufferedWriter writer =
        path.openBufferedWriter(StandardOpenOption.CREATE_NEW);
    Thread worker = new Thread(() -> drain(writer), "moonga-combat-writer");
    worker.setDaemon(true);
    worker.start();
  }

  synchronized void add(String type, int tick, int cycle, Object data) {
    addAt(type, tick, cycle, elapsed(), data);
  }

  long elapsed() {
    return (System.nanoTime() - start) / 1_000_000;
  }

  synchronized boolean addAt(String type, int tick, int cycle, long ms, Object data) {
    if (closing || error != null) return false;
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("seq", sequence++);
    row.put("ms", ms);
    row.put("tick", tick);
    row.put("cycle", cycle);
    row.put("type", type);
    row.put("data", data);
    boolean accepted = queue.offer(gson.toJson(row));
    if (!accepted) dropped.incrementAndGet();
    return accepted;
  }

  synchronized CompletableFuture<Filepath> close() {
    closing = true;
    return finished;
  }

  long dropped() {
    return dropped.get();
  }

  String error() {
    return error;
  }

  private void drain(BufferedWriter writer) {
    try (BufferedWriter out = writer) {
      long lastFlush = System.nanoTime();
      while (!closing || !queue.isEmpty()) {
        String line = queue.poll(200, TimeUnit.MILLISECONDS);
        if (line != null) {
          out.write(line);
          out.newLine();
        }
        if (System.nanoTime() - lastFlush > 1_000_000_000L) {
          out.flush();
          lastFlush = System.nanoTime();
        }
      }
      out.write(
          gson.toJson(
              Map.of("type", "end", "data", Map.of("dropped", dropped.get(), "complete", true))));
      out.newLine();
    } catch (Exception e) {
      error = e.toString();
      finished.completeExceptionally(e);
      return;
    }
    finished.complete(path);
  }
}
